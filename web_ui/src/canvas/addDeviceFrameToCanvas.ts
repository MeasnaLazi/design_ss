import { FabricImage, Group, LayoutManager, FixedLayout, type Canvas } from 'fabric'
import { DEVICE_FRAME_TARGET_WIDTH } from '../constants/deviceFrame'
import {
  DEFAULT_DEVICE_FRAME_STYLE_ID,
  getDeviceFrameStyle,
  type DeviceFrameStyleId,
} from '../constants/deviceFrameStyles'
import { registerFabricObjectId } from '../lib/fabricObjectRegistry'
import { useDesignStore } from '../store/useDesignStore'

/**
 * Adds a phone-style frame (SVG with transparent screen) as a {@link Group} so a screenshot can be inserted behind it later.
 */
export async function addDeviceFrameToCanvas(
  canvas: Canvas,
  styleId: DeviceFrameStyleId = DEFAULT_DEVICE_FRAME_STYLE_ID,
): Promise<void> {
  const style = getDeviceFrameStyle(styleId)
  const frame = await FabricImage.fromURL(
    style.src,
    { crossOrigin: 'anonymous' },
    {
      originX: 'left',
      originY: 'top',
      left: 0,
      top: 0,
      selectable: false,
      evented: false,
    },
  )

  frame.scaleToWidth(DEVICE_FRAME_TARGET_WIDTH)
  frame.set({ dirty: true })

  const id = crypto.randomUUID()
  const zIndex =
    useDesignStore.getState().objects.reduce((m, o) => Math.max(m, o.zIndex), -1) + 1

  const group = new Group([frame], {
    layoutManager: new LayoutManager(new FixedLayout()),
    left: 160,
    top: 140,
    originX: 'left',
    originY: 'top',
    subTargetCheck: false,
    interactive: false,
    lockRotation: false,
    /** Extra space so the rotate handle clears the tall frame. */
    padding: 28,
  })

  const w = group.getScaledWidth()
  const h = group.getScaledHeight()
  group.set({
    originX: 'center',
    originY: 'center',
    left: 160 + w / 2,
    top: 140 + h / 2,
  })
  group.setCoords()

  registerFabricObjectId(group, id)
  useDesignStore.getState().upsertObject({
    id,
    kind: 'device',
    name: `Device · ${style.label}`,
    zIndex,
    deviceFrameStyleId: style.id,
  })

  canvas.add(group)
  canvas.setActiveObject(group)
  canvas.requestRenderAll()
  useDesignStore.getState().setSelectedObject(id)

  console.log('[addDeviceFrameToCanvas] device group added', { id })
}
