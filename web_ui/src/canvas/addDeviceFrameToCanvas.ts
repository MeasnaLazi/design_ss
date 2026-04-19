import { FabricImage, Group, LayoutManager, FixedLayout, type Canvas } from 'fabric'
import { getArtboardDimensionsFromConfig, getArtboardPreset } from '../constants/artboardPresets'
import { deviceFrameTargetWidth } from '../constants/deviceFrame'
import { DEFAULT_DEVICE_FRAME_STYLE_ID, getDeviceFrameStyle } from '../constants/deviceFrameStyles'
import { activePackStyles } from '../lib/deviceFrameCatalog'
import { useDeviceFramePackStore } from '../store/useDeviceFramePackStore'
import {
  fetchPlaceholderAsFile,
  placeholderFilenameForPreset,
} from '../lib/datasourcePlaceholderApi'
import { registerFabricObjectId } from '../lib/fabricObjectRegistry'
import { useDesignStore } from '../store/useDesignStore'
import { useToastStore } from '../store/useToastStore'
import { applyScreenshotToDeviceGroup } from './applyScreenshotToDevice'

/**
 * Adds a phone-style frame (SVG with transparent screen) as a {@link Group} so a screenshot can be inserted behind it later.
 */
export async function addDeviceFrameToCanvas(
  canvas: Canvas,
  styleId: string = DEFAULT_DEVICE_FRAME_STYLE_ID,
): Promise<void> {
  const packState = useDeviceFramePackStore.getState()
  const packId = packState.selectedPackId
  if (!packId || packState.status !== 'ready') {
    useToastStore
      .getState()
      .showToast('Device frames are still loading or no device is selected. Try again in a moment.', 'warning')
    console.warn('[addDeviceFrameToCanvas] device registry not ready or no pack selected')
    return
  }
  const styles = activePackStyles(packState.devices, packState.selectedPackId)
  const style = getDeviceFrameStyle(styleId, styles)
  const { width: panelW } = getArtboardDimensionsFromConfig(useDesignStore.getState().config)
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

  frame.scaleToWidth(deviceFrameTargetWidth(panelW))
  frame.set({ dirty: true, objectCaching: false })

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
    /**
     * Clipped screenshot child + rotation: a cached group bitmap can mis-compose clipPath vs
     * group angle; disable caching for reliable preview when the frame is rotated.
     */
    objectCaching: false,
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
    deviceFramePackId: packId,
  })

  canvas.add(group)
  canvas.setActiveObject(group)
  canvas.requestRenderAll()
  useDesignStore.getState().setSelectedObject(id)

  // Apply default placeholder based on the active artboard preset (non-blocking).
  void (async () => {
    try {
      const preset = getArtboardPreset(useDesignStore.getState().config.artboardPresetId)
      const filename = placeholderFilenameForPreset(preset)
      const file = await fetchPlaceholderAsFile(filename)
      await applyScreenshotToDeviceGroup(canvas, id, file)
    } catch (e) {
      console.log('[addDeviceFrameToCanvas] placeholder not applied', e)
    }
  })()

  console.log('[addDeviceFrameToCanvas] device group added', { id })
}
