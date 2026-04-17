import {
  ActiveSelection,
  FabricImage,
  Group,
  Path,
  type Canvas,
  type FabricObject,
} from 'fabric'
import { getDeviceFrameStyle } from '../constants/deviceFrameStyles'
import { screenshotBucketForConfig } from '../constants/artboardPresets'
import { uploadScreenshotBlob } from '../lib/datasourceScreenshotsApi'
import { findObjectOnCanvasByAppId } from '../lib/fabricObjectRegistry'
import { useDesignStore } from '../store/useDesignStore'
import { useToastStore } from '../store/useToastStore'
import { bakeScreenshotForRegion, bakeScreenshotToQuad } from './bakeScreenshotToScreenSize'
import { loadScreenRegion, loadScreenQuad, type ScreenRegion } from './loadScreenRegion'
import type { ScreenQuad } from '../constants/deviceFrame'

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
  const styleId = existing?.deviceFrameStyleId
  const style = getDeviceFrameStyle(styleId)

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
  // ISO frames: no Fabric clip needed — the WebGL output PNG is already transparent
  // outside the quad, and the device frame SVG (rendered on top) naturally masks
  // the bezel area through its own transparent glass cutout.
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
    // clipPath intentionally omitted — transparency handles the boundary
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

  const shot = await FabricImage.fromURL(imageUrl, { crossOrigin: 'anonymous' })

  // Set everything except left/top — those are set after _enterGroup (see below)
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

  // ── Insert into group ─────────────────────────────────────────────────────
  const overlays = objects.slice(0, -1)
  for (const o of overlays) {
    target.remove(o)
  }
  target.insertAt(0, shot)
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
    // Rect frames: triggerLayout stabilises the FixedLayout group after the child
    // swap, then re-read the frame position to place the shot correctly.
    target.triggerLayout({})
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
  }

  const baseName = file.name.replace(/\.[^/.]+$/, '') || 'Screenshot'
  if (existing) {
    useDesignStore.getState().upsertObject({
      ...existing,
      name: `Device · ${baseName}`,
    })
  }

  canvas.setActiveObject(target)
  canvas.requestRenderAll()
  console.log('[applyScreenshotToDeviceGroup] done', { groupAppId, styleId, iso: !!quad })
}
