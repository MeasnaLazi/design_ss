import {
  ActiveSelection,
  FabricImage,
  Group,
  Path,
  type Canvas,
  type FabricObject,
} from 'fabric'
import { resolveDeviceFrameStyle } from '../lib/deviceFrameCatalog'
import { useDeviceFramePackStore } from '../store/useDeviceFramePackStore'
import { screenshotBucketForConfig } from '../constants/artboardPresets'
import { uploadScreenshotBlob } from '../lib/datasourceScreenshotsApi'
import { findObjectOnCanvasByAppId } from '../lib/fabricObjectRegistry'
import { useDesignStore } from '../store/useDesignStore'
import { useToastStore } from '../store/useToastStore'
import { bakeScreenshotForRegion, bakeScreenshotToQuad } from './bakeScreenshotToScreenSize'
import { loadScreenRegion, loadScreenQuad, type ScreenRegion } from './loadScreenRegion'
import type { ScreenQuad } from '../constants/deviceFrame'

/** Fallback rounded corner radius for iso quad clipping (in SVG/viewBox units). */
const DEFAULT_ISO_CLIP_CORNER_RADIUS_PX = 30

/** Fabric's internal hook to attach a child that is already in `_objects` (do not use `enterGroup` — it calls `remove` first). */
type GroupWithEnter = Group & {
  _enterGroup(object: FabricObject, removeParentTransform?: boolean): void
}

/**
 * {@link Group#drawObject} (with `preserveObjectStacking`) only paints a child through the group when
 * `child.group === group`. Otherwise it applies the inverse group matrix and the child looks
 * axis-aligned (screenshot at 0° while the bezel is rotated). Assigning `child.group = group` is not
 * enough — we must run the same path as {@link Group#_enterGroup} so `group`, `canvas`, and event
 * wiring match Fabric's expectations after `fromURL` + layout.
 */
function resyncScreenshotChildInDeviceGroup(child: FabricObject, group: Group): void {
  ;(group as GroupWithEnter)._enterGroup(child, false)
  child.setCoords()
}

/**
 * Builds a Fabric clip path from the raw `d` attribute of the `#screen` SVG path.
 *
 * The path is in SVG viewBox coordinates. We anchor it so that SVG point (viewW/2, viewH/2)
 * maps to the shot image's local origin (0, 0) — i.e. the image centre — by compensating for
 * Fabric's automatic `pathOffset` normalisation:
 *
 *   clip.left = pathOffset.x − viewW/2
 *   clip.top  = pathOffset.y − viewH/2
 *
 * This works because after Fabric normalises the path (subtracts pathOffset from every coord),
 * setting `left/top` to `pathOffset − viewCentre` shifts the visual clip so that SVG coords
 * (px, py) land at local (px − viewW/2, py − viewH/2), matching the baked image's coordinate
 * system exactly.
 */
function makeClipPath(pathD: string, viewW: number, viewH: number): Path {
  const clip = new Path(pathD, {
    originX: 'center',
    originY: 'center',
    absolutePositioned: false,
    objectCaching: false,
  })
  clip.set({
    left: clip.pathOffset.x - viewW / 2,
    top: clip.pathOffset.y - viewH / 2,
  })
  return clip
}

function normalize(x: number, y: number): [number, number] {
  const len = Math.hypot(x, y)
  if (len < 1e-6) return [0, 0]
  return [x / len, y / len]
}

function isoClipCornerRadii(quad: ScreenQuad): readonly [number, number, number, number] {
  const uniform = quad.clipCornerRadiusPx ?? DEFAULT_ISO_CLIP_CORNER_RADIUS_PX
  const r = quad.clipCornerRadiiPx
  if (!r) return [uniform, uniform, uniform, uniform]
  return [
    r.tl ?? uniform,
    r.tr ?? uniform,
    r.br ?? uniform,
    r.bl ?? uniform,
  ]
}

function roundedQuadPathD(quad: ScreenQuad, radiiPx: readonly [number, number, number, number]): string {
  const points: Array<readonly [number, number]> = [quad.tl, quad.tr, quad.br, quad.bl]
  if (radiiPx.every((r) => r <= 0)) {
    return `M ${quad.tl[0]} ${quad.tl[1]} L ${quad.tr[0]} ${quad.tr[1]} L ${quad.br[0]} ${quad.br[1]} L ${quad.bl[0]} ${quad.bl[1]} Z`
  }

  const cornerData = points.map((corner, i) => {
    const radiusPx = radiiPx[i]
    const prev = points[(i + 3) % 4]
    const next = points[(i + 1) % 4]
    const toPrev = normalize(prev[0] - corner[0], prev[1] - corner[1])
    const toNext = normalize(next[0] - corner[0], next[1] - corner[1])
    const lenPrev = Math.hypot(prev[0] - corner[0], prev[1] - corner[1])
    const lenNext = Math.hypot(next[0] - corner[0], next[1] - corner[1])
    const localRadius = Math.min(radiusPx, lenPrev * 0.45, lenNext * 0.45)
    const start: [number, number] = [corner[0] + toPrev[0] * localRadius, corner[1] + toPrev[1] * localRadius]
    const end: [number, number] = [corner[0] + toNext[0] * localRadius, corner[1] + toNext[1] * localRadius]
    return { corner, start, end }
  })

  const [first, ...rest] = cornerData
  const segments = [`M ${first.end[0]} ${first.end[1]}`]
  for (const c of rest) {
    segments.push(`L ${c.start[0]} ${c.start[1]}`)
    segments.push(`Q ${c.corner[0]} ${c.corner[1]} ${c.end[0]} ${c.end[1]}`)
  }
  segments.push(`L ${first.start[0]} ${first.start[1]}`)
  segments.push(`Q ${first.corner[0]} ${first.corner[1]} ${first.end[0]} ${first.end[1]}`)
  segments.push('Z')
  return segments.join(' ')
}


async function uploadOrEmbed(dataUrl: string): Promise<string> {
  try {
    const blob = await (await fetch(dataUrl)).blob()
    const bucket = screenshotBucketForConfig(useDesignStore.getState().config)
    return await uploadScreenshotBlob(blob, 'device-screenshot.png', { bucket })
  } catch {
    useToastStore
      .getState()
      .showToast(
        'Saved as embedded image; dev server required to store under datasource.',
        'warning',
      )
    return dataUrl
  }
}

/**
 * Places the screenshot behind the device frame inside the group.
 *
 * - **Rectangular frames** (front, perspective-*): screenshot is cover-scaled into the screen
 *   opening using {@link bakeScreenshotForRegion}. The clip comes from the `#screen` SVG path.
 * - **Isometric frames** (iso-*): screenshot is affine-warped into the parallelogram screen face
 *   via {@link bakeScreenshotToQuad}. The clip is a polygon derived from the quad corners.
 *
 * In both cases the shot image is full-viewBox-size so a single uniform scale factor aligns it
 * with the device frame. The `left/top` in group space is set **after** `_enterGroup` because
 * Fabric converts canvas-space coords to group-local during that hook.
 */
export async function applyScreenshotToDeviceGroup(
  canvas: Canvas,
  groupAppId: string,
  file: File,
): Promise<void> {
  const target = findObjectOnCanvasByAppId(canvas, groupAppId)
  if (!target || target instanceof ActiveSelection) {
    console.warn('[applyScreenshotToDeviceGroup] target missing', groupAppId)
    return
  }
  if (!(target instanceof Group)) {
    console.warn('[applyScreenshotToDeviceGroup] selection is not a device group')
    return
  }

  const objects = target.getObjects()
  if (objects.length < 1) {
    console.warn('[applyScreenshotToDeviceGroup] empty group')
    return
  }

  const frame = objects[objects.length - 1]
  if (!(frame instanceof FabricImage)) {
    console.warn('[applyScreenshotToDeviceGroup] last child is not frame image')
    return
  }

  const existing = useDesignStore.getState().objects.find((o) => o.id === groupAppId)
  const frameRegistry = useDeviceFramePackStore.getState()
  const style = resolveDeviceFrameStyle(
    existing?.deviceFramePackId,
    existing?.deviceFrameStyleId,
    frameRegistry.devices,
    frameRegistry.selectedPackId ?? undefined,
  )

  const fw = frame.getScaledWidth()
  const fh = frame.getScaledHeight()

  // ── Detect frame type from SVG: simple polygon → iso, curves → rect ───────
  let quad: ScreenQuad | null = null
  try {
    quad = await loadScreenQuad(style.src)
  } catch {
    // Not a simple polygon — treat as rectangular frame
  }

  // ── Bake, upload, build clip ───────────────────────────────────────────────
  let imageUrl: string
  let scaleX: number
  let scaleY: number
  let clipPath: Path | undefined
  let viewW: number
  let viewH: number

  if (quad) {
    // Isometric: perspective-warp into the quad via WebGL homography
    const dataUrl = await bakeScreenshotToQuad(file, quad)
    imageUrl = await uploadOrEmbed(dataUrl)
    viewW = quad.viewW
    viewH = quad.viewH
    scaleX = fw / viewW
    scaleY = fh / viewH
    // Clip keeps full quad coverage (same width/height) and only rounds the corners.
    const quadPathD = roundedQuadPathD(quad, isoClipCornerRadii(quad))
    clipPath = makeClipPath(quadPathD, viewW, viewH)
  } else {
    // Rectangular: cover-scale into the screen opening bounding box
    let region: ScreenRegion
    try {
      region = await loadScreenRegion(style.src)
    } catch (err) {
      console.error('[applyScreenshotToDeviceGroup] could not load screen region', err)
      return
    }
    const dataUrl = await bakeScreenshotForRegion(file, region)
    imageUrl = await uploadOrEmbed(dataUrl)
    viewW = region.viewW
    viewH = region.viewH
    scaleX = fw / viewW
    scaleY = fh / viewH
    clipPath = makeClipPath(region.pathD, viewW, viewH)
  }

  /**
   * Lock logical size to the SVG viewBox used for `scaleX` / `scaleY`.
   * Some decoders report `naturalWidth`/`naturalHeight` at a higher pixel ratio than the
   * baked canvas; Fabric would then use that for layout while our scale assumes `viewW`×`viewH`,
   * inflating the group bbox on {@link Group#triggerLayout} (rect / front frames only).
   */
  const shot = await FabricImage.fromURL(imageUrl, { crossOrigin: 'anonymous' }, {
    width: viewW,
    height: viewH,
  })

  /** Group-local scale so the baked bitmap (viewW×viewH) matches the bezel image size. */
  const applyShotGroupLocalTransform = (): void => {
    shot.set({
      originX: 'center',
      originY: 'center',
      angle: 0,
      skewX: 0,
      skewY: 0,
      selectable: false,
      evented: false,
      lockMovementX: true,
      lockMovementY: true,
      lockRotation: true,
      dirty: true,
      objectCaching: false,
      scaleX,
      scaleY,
      ...(clipPath ? { clipPath } : {}),
    })
  }

  // Pre-insert props (left/top fixed after insert — see below)
  applyShotGroupLocalTransform()

  // ── Insert into group ─────────────────────────────────────────────────────
  const overlays = objects.slice(0, -1)
  for (const o of overlays) {
    target.remove(o)
  }
  target.insertAt(0, shot)
  // Fabric's `insertAt` → `enterGroup(obj, true)` converts from canvas plane using
  // `inverse(groupMatrix)`. Our scaleX/Y are already in **group-local** space (they match
  // `frame.getScaledWidth()` / viewW). Re-apply after insert or scaled groups shrink the shot.
  applyShotGroupLocalTransform()
  shot.setCoords()
  target.set('dirty', true)
  resyncScreenshotChildInDeviceGroup(shot, target)

  // ── Fix left/top after _enterGroup ────────────────────────────────────────
  // _enterGroup(child, false) converts left/top from canvas-space to group-local,
  // displacing the shot. We read the frame's current group-local position and
  // place the shot's centre at the frame's centre.
  if (quad) {
    // Iso frames: skip triggerLayout (it shifts frame.left unpredictably).
    const allObjects = target.getObjects()
    const frameNow = allObjects[allObjects.length - 1]
    if (frameNow instanceof FabricImage) {
      shot.set({
        left: frameNow.left + frameNow.getScaledWidth() / 2,
        top: frameNow.top + frameNow.getScaledHeight() / 2,
        dirty: true,
      })
      shot.setCoords()
    }
  } else {
    // Rect frames: centre the shot on the bezel *before* triggerLayout. Fabric's insert path
    // leaves shot left/top in a bad group-local state; computing layout first unions a huge
    // bbox (empty top-left, frame pushed to bottom-right of the selection box).
    const allObjects = target.getObjects()
    const frameNow = allObjects[allObjects.length - 1]
    if (frameNow instanceof FabricImage) {
      shot.set({
        left: frameNow.left + frameNow.getScaledWidth() / 2,
        top: frameNow.top + frameNow.getScaledHeight() / 2,
        dirty: true,
      })
      shot.setCoords()
      resyncScreenshotChildInDeviceGroup(shot, target)
      applyShotGroupLocalTransform()
      target.triggerLayout({})
      applyShotGroupLocalTransform()
      const afterObjects = target.getObjects()
      const frameAfter = afterObjects[afterObjects.length - 1]
      if (frameAfter instanceof FabricImage) {
        shot.set({
          left: frameAfter.left + frameAfter.getScaledWidth() / 2,
          top: frameAfter.top + frameAfter.getScaledHeight() / 2,
          dirty: true,
        })
        shot.setCoords()
        resyncScreenshotChildInDeviceGroup(shot, target)
      }
      applyShotGroupLocalTransform()
      target.triggerLayout({})
      applyShotGroupLocalTransform()
    }
  }

  const baseName = file.name.replace(/\.[^/.]+$/, '') || 'Screenshot'
  if (existing) {
    useDesignStore.getState().upsertObject({
      ...existing,
      name: `Device · ${baseName}`,
    })
  }

  canvas.setActiveObject(target)
  canvas.fire('object:modified', { target })
  canvas.requestRenderAll()
  console.log('[applyScreenshotToDeviceGroup] done', { groupAppId, frameStyleId: style.id, iso: !!quad })
}
