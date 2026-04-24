import { FabricImage, Group, LayoutManager, FixedLayout, type Canvas } from 'fabric'
import { getArtboardDimensionsFromConfig, getArtboardPreset } from '../constants/artboardPresets'
import {
  deviceFrameTargetWidth,
  uniformScaleForMatchingFrontScreenHeight,
} from '../constants/deviceFrame'
import { DEFAULT_DEVICE_FRAME_STYLE_ID, getDeviceFrameStyle } from '../constants/deviceFrameStyles'
import { activePackStyles, DEFAULT_DEVICE_FRAME_ANGLE_ID } from '../lib/deviceFrameCatalog'
import { useDeviceFramePackStore } from '../store/useDeviceFramePackStore'
import {
  fetchPlaceholderAsFile,
  placeholderFilenameForPreset,
} from '../lib/datasourcePlaceholderApi'
import { registerFabricObjectId } from '../lib/fabricObjectRegistry'
import { useDesignStore } from '../store/useDesignStore'
import { useToastStore } from '../store/useToastStore'
import { applyScreenshotToDeviceGroup } from './applyScreenshotToDevice'

export type AddDeviceFrameToCanvasOptions = {
  /** Pack folder id under `public/device-frames/<id>/`. Defaults to sidebar selection. */
  packId?: string
}

/**
 * Adds a phone-style frame (SVG with transparent screen) as a {@link Group} so a screenshot can be inserted behind it later.
 *
 * @param styleIdOrOpts - Frame style id (e.g. `front`) or options object when omitting positional style id.
 */
export async function addDeviceFrameToCanvas(
  canvas: Canvas,
  styleIdOrOpts?: string | AddDeviceFrameToCanvasOptions,
  maybeOpts?: AddDeviceFrameToCanvasOptions,
): Promise<void> {
  let styleId: string = DEFAULT_DEVICE_FRAME_STYLE_ID
  let opts: AddDeviceFrameToCanvasOptions | undefined
  if (typeof styleIdOrOpts === 'string') {
    styleId = styleIdOrOpts
    opts = maybeOpts
  } else if (styleIdOrOpts != null) {
    opts = styleIdOrOpts
  }

  const packState = useDeviceFramePackStore.getState()
  const packId = opts?.packId ?? packState.selectedPackId
  if (!packId || packState.status !== 'ready') {
    useToastStore
      .getState()
      .showToast('Device frames are still loading or no device is selected. Try again in a moment.', 'warning')
    console.warn('[addDeviceFrameToCanvas] device registry not ready or no pack selected')
    return
  }
  if (!packState.devices.some((d) => d.id === packId)) {
    useToastStore
      .getState()
      .showToast(`Unknown device pack "${packId}". Check device-frames index.`, 'warning')
    console.warn('[addDeviceFrameToCanvas] pack not in registry', packId)
    return
  }
  const styles = activePackStyles(packState.devices, packId)
  const style = getDeviceFrameStyle(styleId, styles)
  const { width: panelW, height: panelH } = getArtboardDimensionsFromConfig(
    useDesignStore.getState().config,
  )
  const targetW = deviceFrameTargetWidth(panelW)
  const packDevice = packState.devices.find((d) => d.id === packId)
  const frontManifest = packDevice?.manifest.frames.find((f) => f.name === DEFAULT_DEVICE_FRAME_ANGLE_ID)
  const currentManifest = packDevice?.manifest.frames.find((f) => f.name === style.id)
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

  /** Must match the real SVG width; using loaded `frame.width` for `front` avoids stale/wrong JSON. */
  const referenceFrontViewWidth =
    style.id === DEFAULT_DEVICE_FRAME_ANGLE_ID
      ? frame.width
      : typeof frontManifest?.viewWidth === 'number'
        ? frontManifest.viewWidth
        : undefined

  const layoutScale =
    typeof currentManifest?.layoutScale === 'number' && Number.isFinite(currentManifest.layoutScale)
      ? currentManifest.layoutScale
      : 1

  const uniform =
    frontManifest?.corners &&
    currentManifest?.corners &&
    referenceFrontViewWidth !== undefined &&
    referenceFrontViewWidth > 0
      ? uniformScaleForMatchingFrontScreenHeight({
          referenceFrontViewWidth,
          referenceCorners: frontManifest.corners,
          currentCorners: currentManifest.corners,
          targetReferenceFrameWidthPx: targetW,
        })
      : null
  if (uniform != null) {
    frame.set({ scaleX: uniform * layoutScale, scaleY: uniform * layoutScale })
  } else {
    frame.scaleToWidth(targetW * layoutScale)
  }
  frame.set({ dirty: true, objectCaching: false })

  const id = crypto.randomUUID()
  const zIndex =
    useDesignStore.getState().objects.reduce((m, o) => Math.max(m, o.zIndex), -1) + 1

  const group = new Group([frame], {
    layoutManager: new LayoutManager(new FixedLayout()),
    left: 0,
    top: 0,
    originX: 'left',
    originY: 'top',
    subTargetCheck: false,
    interactive: false,
    lockRotation: false,
    /**
     * Fabric adds this inset on every side to the selection box (border + handles).
     * Keep it small so the control rect tracks the bezel; global `cornerSize` / `touchCornerSize`
     * already give the handles their own hit area.
     */
    padding: 8,
    /**
     * Clipped screenshot child + rotation: a cached group bitmap can mis-compose clipPath vs
     * group angle; disable caching for reliable preview when the frame is rotated.
     */
    objectCaching: false,
  })

  /** Center on screenshot panel 1 — avoids a large fixed offset (legacy 160×140) vs panel size. */
  group.set({
    originX: 'center',
    originY: 'center',
    left: panelW / 2,
    top: panelH / 2,
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
