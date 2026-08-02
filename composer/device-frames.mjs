/**
 * Browser runtime for device-frame blocks inside composer strip HTML.
 *
 * Authoring contract (see strip-schema.md):
 *
 *   <div data-device data-pack="iphone_12_pro" data-pose="isometric-left"
 *        data-screenshot="/datasource/screenshots/appstore_iphone_portrait/<id>.png"
 *        style="width: 900px"></div>
 *
 * Optional attributes:
 *   data-fit="cover" (default) | "stretch"   — how the screenshot fills the screen quad
 *   data-screen-fallback="#rrggbb"            — screen fill when data-screenshot is omitted
 *
 * The runtime reads the pack's frame.json (`corners`, view size), warps the
 * screenshot onto the screen quad with a matrix3d homography, clips it with
 * the pose SVG's own `#screen` path (exact artwork match), and layers the
 * frame SVG on top. Sets `window.__composerReady = true` when all devices
 * (and images) are built, which render.mjs waits for.
 */
import {
  matrix3dForQuad,
  quadFromFrameCorners,
  quadSize,
  coverCropRect,
  roundedQuadPathD,
} from './homography.mjs'

const CONFIG = typeof window !== 'undefined' && window.COMPOSER_CONFIG ? window.COMPOSER_CONFIG : {}
/** Root under which /device-frames/** is served (repo-root static server → web_ui/public). */
const FRAMES_ROOT = CONFIG.framesRoot ?? '/web_ui/public'

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

/** Extract the `d` attribute of the `#screen` path from pose SVG markup. */
export function extractScreenPathD(svgText) {
  const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml')
  const path = doc.querySelector('#screen')
  return path ? path.getAttribute('d') : null
}

function clipPathDFor(frame, quad, svgText) {
  const d = svgText ? extractScreenPathD(svgText) : null
  if (d) return d
  // Fallback: rounded quad from frame.json radii (same as canvas iso path).
  const r = frame.clipCornerRadiiPx
  const uniform = frame.clipCornerRadiusPx ?? 30
  const radii = r
    ? [r.tl ?? uniform, r.tr ?? uniform, r.br ?? uniform, r.bl ?? uniform]
    : [uniform, uniform, uniform, uniform]
  return roundedQuadPathD(quad, radii)
}

async function buildDevice(el) {
  const packId = el.dataset.pack
  const pose = el.dataset.pose
  if (!packId || !pose) throw new Error('[data-device] needs data-pack and data-pose')

  const pack = await loadPack(packId)
  const frame = pack.frames.find((f) => f.name === pose)
  if (!frame) throw new Error(`pose "${pose}" not found in pack "${packId}"`)

  const svgText = await loadSvgText(frame.framePath)

  // `corners` and the `#screen` path are authored in the SVG's own viewBox
  // space. Trust the SVG viewBox as the stage size; frame.json viewWidth /
  // viewHeight is only a fallback (some entries are stale, e.g.
  // iphone_12_pro/tilted-front says 1282x1485 while the SVG is 785x1401).
  const vb = svgText.match(/viewBox="([\d.\s-]+)"/)
  const vbParts = vb ? vb[1].trim().split(/\s+/).map(Number) : null
  const viewW = vbParts?.[2] ?? frame.viewWidth
  const viewH = vbParts?.[3] ?? frame.viewHeight
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
    `clip-path:path('${clipPathDFor(frame, quad, svgText)}');`

  const shotSrc = el.dataset.screenshot
  if (shotSrc) {
    const img = await loadImage(shotSrc)
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

export async function initDevices() {
  const els = [...document.querySelectorAll('[data-device]')]
  await Promise.all(els.map((el) =>
    buildDevice(el).catch((err) => {
      console.error('[composer]', err)
      el.style.outline = '4px solid red'
      window.__composerErrors = [...(window.__composerErrors ?? []), String(err)]
    }),
  ))
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
