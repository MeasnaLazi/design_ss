import { ActiveSelection, FabricImage, Group, Rect, type Canvas } from 'fabric'
import { DEVICE_FRAME } from '../constants/deviceFrame'
import { findObjectOnCanvasByAppId } from '../lib/fabricObjectRegistry'
import { useDesignStore } from '../store/useDesignStore'

function readFileDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader()
    fr.onload = () => resolve(fr.result as string)
    fr.onerror = () => reject(fr.error ?? new Error('read failed'))
    fr.readAsDataURL(file)
  })
}

/**
 * Screen opening in **group** coordinates. The frame is not at (0,0): Fabric’s group
 * layout offsets children to center the bbox, so we anchor to {@link FabricImage#left} / `top`.
 */
function screenRectForFrame(frame: FabricImage) {
  const fw = frame.getScaledWidth()
  const fh = frame.getScaledHeight()
  const fx = fw / DEVICE_FRAME.viewW
  const fy = fh / DEVICE_FRAME.viewH
  return {
    sx: frame.left + DEVICE_FRAME.screenX * fx,
    sy: frame.top + DEVICE_FRAME.screenY * fy,
    sw: DEVICE_FRAME.screenW * fx,
    sh: DEVICE_FRAME.screenH * fy,
    rx: DEVICE_FRAME.cornerRadius * fx,
    ry: DEVICE_FRAME.cornerRadius * fy,
  }
}

/**
 * Places the image behind the device frame inside the group, with a rounded {@link Rect} clipPath (cover crop).
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

  const { sx, sy, sw, sh, rx, ry } = screenRectForFrame(frame)

  const dataUrl = await readFileDataUrl(file)
  const shot = await FabricImage.fromURL(dataUrl, { crossOrigin: 'anonymous' })

  const natW = Math.max(shot.width || 1, 1)
  const natH = Math.max(shot.height || 1, 1)
  const scale = Math.max(sw / natW, sh / natH)

  const cx = sx + sw / 2
  const cy = sy + sh / 2

  shot.set({
    originX: 'center',
    originY: 'center',
    left: cx,
    top: cy,
    scaleX: scale,
    scaleY: scale,
    selectable: false,
    evented: false,
    objectCaching: false,
    dirty: true,
  })

  shot.clipPath = new Rect({
    originX: 'center',
    originY: 'center',
    left: 0,
    top: 0,
    width: sw,
    height: sh,
    rx,
    ry,
    absolutePositioned: false,
  })

  const overlays = objects.slice(0, -1)
  for (const o of overlays) {
    target.remove(o)
  }
  target.insertAt(0, shot)
  target.set('dirty', true)
  target.triggerLayout({})

  // Re-read the frame after layout so the screenshot + clip stay locked to the opening.
  const afterObjects = target.getObjects()
  const frameAfter = afterObjects[afterObjects.length - 1]
  if (frameAfter instanceof FabricImage) {
    const r = screenRectForFrame(frameAfter)
    const cx2 = r.sx + r.sw / 2
    const cy2 = r.sy + r.sh / 2
    shot.set({
      left: cx2,
      top: cy2,
      clipPath: new Rect({
        originX: 'center',
        originY: 'center',
        left: 0,
        top: 0,
        width: r.sw,
        height: r.sh,
        rx: r.rx,
        ry: r.ry,
        absolutePositioned: false,
      }),
      dirty: true,
    })
    shot.setCoords()
    console.log('[applyScreenshotToDeviceGroup] aligned after layout', {
      framePos: { left: frameAfter.left, top: frameAfter.top },
      screen: r,
    })
  }

  const baseName = file.name.replace(/\.[^/.]+$/, '') || 'Screenshot'
  const existing = useDesignStore.getState().objects.find((o) => o.id === groupAppId)
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
