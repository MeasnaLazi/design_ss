/**
 * Browser runtime for device-frame blocks inside composer strip HTML.
 *
 * Authoring contract (see strip-schema.md):
 *
 *   <div data-device data-pack="iphone_12_pro" data-pose="isometric-left"
 *        data-screenshot="/strips/<name>/screenshots/<file>.png"
 *        style="width: 900px"></div>
 *
 * Optional attributes:
 *   data-fit="cover" (default) | "stretch"   — how the screenshot fills the screen quad
 *   data-screen-fallback="#rrggbb"            — screen fill when data-screenshot is omitted
 *
 * The runtime takes the warp quad from the pack's frame.json (`corners`) and
 * everything else from the pose SVG: the viewBox is the stage, and `#screen` is
 * the clip. It warps the screenshot onto the quad with a matrix3d homography,
 * clips it to the aperture, and layers the frame SVG on top. Sets
 * `window.__composerReady = true` when all devices (and images) are built, which
 * render.mjs waits for.
 *
 * The contract between those two sources, enforced by `check-schema.mjs --packs`:
 * **`corners` must fully contain the `#screen` aperture.** The quad only decides
 * how the screenshot is stretched; the aperture decides what is visible. A quad
 * that falls short leaves the panel background showing as a hairline along the
 * screen edge — which is invisible in `mask_analysis`, where an exact mask does
 * the cutting, and is why that tool and this runtime used to disagree.
 */
import {
  matrix3dForQuad,
  quadFromFrameCorners,
  quadSize,
  coverCropRect,
} from './homography.mjs'
import { screenClipPathD } from './screen-geometry.mjs'

const CONFIG = typeof window !== 'undefined' && window.COMPOSER_CONFIG ? window.COMPOSER_CONFIG : {}
/**
 * Root under which `/device-frames/**` is served by the repo-root static server.
 *
 * The packs sit in `composer/device-frames/`, beside this file — a strip depends
 * on `composer/` already (its `<head>` loads this module), so the frames add no
 * dependency the strip did not have. Strips need not set `framesRoot` at all;
 * the older ones that point at `/web_ui/public` still resolve because both the
 * export server and the editor alias that prefix to the new location.
 */
const FRAMES_ROOT = CONFIG.framesRoot ?? '/composer'

const packCache = new Map()
const svgTextCache = new Map()

async function fetchJson(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`fetch failed ${res.status}: ${url}`)
  return res.json()
}

async function fetchText(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`fetch failed ${res.status}: ${url}`)
  return res.text()
}

function loadPack(packId) {
  if (!packCache.has(packId)) {
    packCache.set(packId, fetchJson(`${FRAMES_ROOT}/device-frames/${packId}/frame.json`))
  }
  return packCache.get(packId)
}

function loadSvgText(framePath) {
  const url = `${FRAMES_ROOT}${framePath}`
  if (!svgTextCache.has(url)) svgTextCache.set(url, fetchText(url))
  return svgTextCache.get(url)
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`image failed to load: ${src}`))
    img.src = src
  })
}

/**
 * The clip for the screenshot layer: the pose SVG's own `#screen` outline.
 *
 * There is deliberately no fallback. There used to be one — a rounded quad built
 * from `frame.json` corners with `clipCornerRadiusPx ?? 30` — and because the
 * old extractor read `getAttribute('d')` it fired for every `<rect>`-based
 * `#screen`, which is half the catalogue. The result was a runtime that clipped
 * a shape nobody had measured: `galaxy_tab_s11`'s square aperture came out with
 * 30-unit rounded corners, `ipad_13_pro`'s `rx="32"` was ignored in favour of
 * 30, and `nexus_6p` had to carry `"clipCornerRadiusPx": 0` to suppress the
 * behaviour. That 30 was inherited verbatim from the deleted canvas app, where
 * it existed for isometric poses; no pack in this repo has one.
 *
 * A pack whose `#screen` cannot be read is an authoring error, and now says so:
 * the throw is caught by {@link initDevices}, which red-outlines the block and
 * records it in `window.__composerErrors` — which `render.mjs` refuses to export
 * past. Guessing a shape is what made this invisible for so long.
 */
function readScreen(svgText, packId, pose) {
  const screen = screenClipPathD(svgText)
  const where = `pack "${packId}" pose "${pose}"`
  if (!screen.d) {
    throw new Error(`${where}: cannot read the #screen aperture — ${screen.problems.join('; ')}`)
  }
  const vb = screen.geo.viewBox
  if (!vb) throw new Error(`${where}: the pose SVG has no usable viewBox`)
  // The stage is a plain div at (0, 0), so aperture coordinates and stage
  // coordinates only coincide while the viewBox starts at the origin. No pack
  // in the catalogue has a shifted viewBox; saying so out loud costs one
  // comparison and beats silently drawing the screen in the wrong place.
  if (vb.x !== 0 || vb.y !== 0) {
    throw new Error(
      `${where}: viewBox starts at (${vb.x}, ${vb.y}); the runtime places the stage at the ` +
        `origin, so a shifted viewBox would offset the screen. Re-export the pose from (0, 0).`,
    )
  }
  return screen
}

async function buildDevice(el) {
  const packId = el.dataset.pack
  const pose = el.dataset.pose
  if (!packId || !pose) throw new Error('[data-device] needs data-pack and data-pose')

  const pack = await loadPack(packId)
  const frame = pack.frames.find((f) => f.name === pose)
  if (!frame) throw new Error(`pose "${pose}" not found in pack "${packId}"`)

  const svgText = await loadSvgText(frame.framePath)

  // One read of the pose SVG answers both questions the runtime asks of it:
  // where the stage is (the viewBox) and what shape the screen is (`#screen`).
  //
  // `corners` and the aperture are both authored in the SVG's own viewBox space.
  // The SVG viewBox is the stage size, full stop — `frame.json` viewWidth /
  // viewHeight is not consulted, because several entries disagree with it
  // (galaxy_tab_s11 records the aperture, 1848x2960, where the viewBox is
  // 1971x3078). `check-schema.mjs --packs` reports that disagreement rather than
  // letting the runtime silently pick a winner.
  const screen = readScreen(svgText, packId, pose)
  const viewW = screen.geo.viewBox.width
  const viewH = screen.geo.viewBox.height
  const quad = quadFromFrameCorners(frame.corners)

  // Container: author sets width; height follows the pose aspect ratio.
  //
  // Record which inline properties are *derived* rather than authored. Tooling
  // that writes the strip back to disk (the strip editor) must not persist
  // these — they are recomputed from the pose on every load, and baking them in
  // would freeze one pose's aspect ratio into the file. A JS expando is used
  // deliberately: unlike a data attribute it can never serialize into HTML.
  const derived = []
  const cs = getComputedStyle(el)
  if (cs.position === 'static') {
    el.style.position = 'relative'
    derived.push('position')
  }
  el.style.aspectRatio = `${viewW} / ${viewH}`
  derived.push('aspect-ratio')
  el.style.overflow = 'visible'
  derived.push('overflow')
  el.__composerDerivedProps = derived

  // Stage in viewBox units, uniformly scaled to the container width.
  const rect = el.getBoundingClientRect()
  const scale = (rect.width || viewW) / viewW
  const stage = document.createElement('div')
  stage.className = 'composer-device-stage'
  stage.style.cssText = `position:absolute;left:0;top:0;width:${viewW}px;height:${viewH}px;` +
    `transform:scale(${scale});transform-origin:0 0;`

  // Screenshot layer, clipped by the pose's own screen path.
  const clipDiv = document.createElement('div')
  clipDiv.style.cssText = `position:absolute;left:0;top:0;width:${viewW}px;height:${viewH}px;` +
    `clip-path:path('${screen.d}');`

  const shotSrc = el.dataset.screenshot

  // A screenshot that will not load fills the screen with the fallback colour
  // instead of aborting the build.
  //
  // It used to throw, and because the frame artwork is appended *after* this
  // block, the throw discarded the whole mockup — one missing capture and the
  // device vanished, frame and all. That is at its worst while an agent designs
  // with the editor open: the markup naming a capture is written before the
  // capture is copied into place, every write reloads the canvas, and the user
  // watches empty panels until the copy happens.
  //
  // **The error is still recorded.** Degrading is about pixels, not about
  // silence: `noteError` feeds `window.__composerErrors`, `render.mjs` aborts
  // the export when that array is non-empty, and `check-schema.mjs` catches the
  // same thing from source text. A missing capture must never ship as a
  // deliberate-looking blank screen.
  let img = null
  if (shotSrc) {
    try {
      img = await loadImage(shotSrc)
    } catch (err) {
      noteError(el, err)
    }
  }

  if (img) {
    const w = img.naturalWidth
    const h = img.naturalHeight
    const fit = el.dataset.fit ?? 'cover'
    let srcRect
    if (fit === 'cover') {
      const q = quadSize(quad)
      srcRect = coverCropRect(w, h, q.width / q.height)
    }
    img.style.cssText = `position:absolute;left:0;top:0;width:${w}px;height:${h}px;` +
      `transform-origin:0 0;transform:${matrix3dForQuad(w, h, quad, { srcRect })};`
    clipDiv.appendChild(img)
  } else {
    const fill = document.createElement('div')
    fill.style.cssText = `position:absolute;left:0;top:0;width:${viewW}px;height:${viewH}px;` +
      `background:${el.dataset.screenFallback ?? '#0c0c0a'};`
    clipDiv.appendChild(fill)
  }
  stage.appendChild(clipDiv)

  // Frame artwork on top (inline SVG so it renders without another fetch).
  const frameHolder = document.createElement('div')
  frameHolder.style.cssText = `position:absolute;left:0;top:0;width:${viewW}px;height:${viewH}px;`
  frameHolder.innerHTML = svgText
  const svgEl = frameHolder.querySelector('svg')
  if (svgEl) {
    svgEl.setAttribute('width', String(viewW))
    svgEl.setAttribute('height', String(viewH))
    svgEl.style.display = 'block'
  }
  stage.appendChild(frameHolder)

  el.appendChild(stage)
}

/**
 * Record a build failure without deciding whether it is fatal.
 *
 * Two callers with different intents share it: {@link initDevices} catches what
 * stopped a device being built at all, and the screenshot load catches what
 * merely spoiled its screen. Both must reach `window.__composerErrors`, because
 * that array is what `render.mjs` checks before it will export anything.
 */
function noteError(el, err) {
  console.error('[composer]', err)
  el.style.outline = '4px solid red'
  window.__composerErrors = [...(window.__composerErrors ?? []), String(err)]
}

export async function initDevices() {
  const els = [...document.querySelectorAll('[data-device]')]
  await Promise.all(els.map((el) => buildDevice(el).catch((err) => noteError(el, err))))
  await document.fonts.ready
  window.__composerReady = true
}

/**
 * Re-fit an already-built device block to its container's current width.
 *
 * The stage is laid out in the pose's viewBox units and scaled to the container
 * — but that scale is computed once, when the block is built. Anything that
 * changes the block's width afterwards (an editor resize, a new `width` in the
 * file) leaves the artwork at its old size inside a container that has moved on.
 * `render.mjs` never hits this because it renders once; interactive tooling does
 * constantly.
 *
 * Cheap on purpose — no refetch, no re-warp. The homography maps the screenshot
 * into viewBox space, so uniformly rescaling the stage is exactly right and safe
 * to call on every pointer move.
 *
 * @returns true if a stage was found and rescaled.
 */
export function rescaleDevice(el) {
  const stage = el.querySelector(':scope > .composer-device-stage')
  if (!stage) return false
  // The stage's own width is the pose's viewBox width, in px.
  const viewW = Number.parseFloat(stage.style.width)
  const width = el.getBoundingClientRect().width
  if (!Number.isFinite(viewW) || viewW <= 0 || !width) return false
  stage.style.transform = `scale(${width / viewW})`
  return true
}

/**
 * Re-run one device block after its authoring attributes change (pose, pack,
 * screenshot, fit, fallback). Used by the strip editor; `render.mjs` only ever
 * needs the one-shot `initDevices`.
 *
 * Discards the previously injected stage and the derived inline styles
 * (`aspect-ratio` comes from the new pose's viewBox and must not be inherited
 * from the old one), then rebuilds from the element's current attributes.
 * Rejects on failure so the caller can report it rather than leaving a silently
 * empty frame.
 */
export async function rebuildDevice(el) {
  el.replaceChildren()
  el.style.removeProperty('aspect-ratio')
  el.style.removeProperty('outline')
  await buildDevice(el)
}

if (typeof window !== 'undefined') {
  window.__composerReady = false
  // Expose the runtime to same-origin tooling (the strip editor). Module
  // exports are not reachable across realms, and re-importing the module from
  // another realm would bind it to the wrong `document`.
  window.__composerDevices = { initDevices, rebuildDevice, rescaleDevice }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { initDevices() })
  } else {
    initDevices()
  }
}
