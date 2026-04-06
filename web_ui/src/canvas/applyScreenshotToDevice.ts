import { ActiveSelection, FabricImage, Group, Rect, type Canvas } from 'fabric'
import {
  getDeviceFrameMetricsForStyle,
  screenshotVerticalNudgeY,
  type DeviceFrameMetrics,
} from '../constants/deviceFrame'
import { findObjectOnCanvasByAppId } from '../lib/fabricObjectRegistry'
import { useDesignStore } from '../store/useDesignStore'
import { bakeScreenshotFileForMetrics } from './bakeScreenshotToScreenSize'

/**
 * Screen opening in **group** coordinates. The frame is not at (0,0): Fabric’s group
 * layout offsets children to center the bbox, so we anchor to {@link FabricImage#left} / `top`.
 */
function screenRectForFrame(frame: FabricImage, m: DeviceFrameMetrics) {
  const fw = frame.getScaledWidth()
  const fh = frame.getScaledHeight()
  const fx = fw / m.viewW
  const fy = (fh / m.viewH)
  return {
    sx: frame.left + m.screenX * fx,
    sy: frame.top + m.screenY * fy,
    sw: m.screenW * fx,
    sh: m.screenH * fy,
    rx: m.cornerRadius * fx,
    ry: m.cornerRadius * fy,
  }
}

/**
 * Places the image behind the device frame inside the group, with a rounded {@link Rect} clipPath.
 * Uploads are resampled to the bake size from `deviceFrame.ts` (e.g. 1242×2622 for front) via {@link bakeScreenshotFileForMetrics}, then scaled with uniform cover to the hole.
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
  const metrics = getDeviceFrameMetricsForStyle(existing?.deviceFrameStyleId)

  const { sx, sy, sw, sh, rx, ry } = screenRectForFrame(frame, metrics)

  const dataUrl = await bakeScreenshotFileForMetrics(file, metrics)
  const shot = await FabricImage.fromURL(dataUrl, { crossOrigin: 'anonymous' })

  const natW = Math.max(shot.width || 1, 1)
  const natH = Math.max(shot.height || 1, 1)
  const scale = Math.max(sw / natW, sh / natH)

  /** Clip and radii are in image local space (Fabric applies scaleX/Y after). */
  function clipForScreenRect(r: { sw: number; sh: number; rx: number; ry: number }, s: number) {
    return new Rect({
      originX: 'center',
      originY: 'center',
      left: 0,
      top: 0,
      width: r.sw / s,
      height: (r.sh / s),
      rx: r.rx / s,
      ry: r.ry / s,
      absolutePositioned: false,
    })
  }

  const cx = sx + sw / 2
  const nudgeY = screenshotVerticalNudgeY(sh, metrics)
  const cy = sy + sh / 2 + nudgeY

  shot.set({
    originX: 'center',
    originY: 'center',
    left: 0,
    top: 0,
    scaleX: scale,
    scaleY: scale,
    selectable: false,
    evented: false,
    objectCaching: false,
    dirty: true,
    clipPath: clipForScreenRect({ sw, sh, rx, ry }, scale),
  })

  const overlays = objects.slice(0, -1)
  for (const o of overlays) {
    target.remove(o)
  }
  target.insertAt(0, shot)
  // `enterGroup(..., true)` maps from canvas plane; set group-local center after the child is in the group.
  shot.set({ left: cx, top: cy })
  shot.setCoords()
  target.set('dirty', true)
  target.triggerLayout({})

  // Re-read the frame after layout so the screenshot + clip stay locked to the opening.
  const afterObjects = target.getObjects()
  const frameAfter = afterObjects[afterObjects.length - 1]
  if (frameAfter instanceof FabricImage) {
    const r = screenRectForFrame(frameAfter, metrics)
    const cx2 = r.sx + r.sw / 2
    const cy2 = r.sy + r.sh / 2 + screenshotVerticalNudgeY(r.sh, metrics)
    const s2 = Math.max(r.sw / natW, r.sh / natH)
    shot.set({
      left: cx2,
      top: cy2,
      scaleX: s2,
      scaleY: s2,
      clipPath: clipForScreenRect(r, s2),
      dirty: true,
    })
    shot.setCoords()
    console.log('[applyScreenshotToDeviceGroup] aligned after layout', {
      framePos: { left: frameAfter.left, top: frameAfter.top },
      screen: r,
    })
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
  console.log('[applyScreenshotToDeviceGroup] screenshot applied', {
    groupAppId,
    file: file.name,
  })
}
