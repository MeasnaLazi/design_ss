/**
 * Seven perspective presets (SVG under `public/device-frames/`).
 * Order matches the reference grid: top row L→R, then next rows.
 */
export const DEVICE_FRAME_STYLES = [
  {
    id: 'iso-down-right',
    label: 'Iso down-right',
    src: '/device-frames/iso-down-right.svg',
  },
  {
    id: 'perspective-right',
    label: 'Angled right',
    src: '/device-frames/perspective-right.svg',
  },
  {
    id: 'perspective-left',
    label: 'Angled left',
    src: '/device-frames/perspective-left.svg',
  },
  {
    id: 'front',
    label: 'Front',
    src: '/device-frames/front.svg',
  },
  {
    id: 'iso-up-right',
    label: 'Iso up-right',
    src: '/device-frames/iso-up-right.svg',
  },
  {
    id: 'iso-down-left',
    label: 'Iso down-left',
    src: '/device-frames/iso-down-left.svg',
  },
  {
    id: 'iso-up-left',
    label: 'Iso up-left',
    src: '/device-frames/iso-up-left.svg',
  },
] as const

export type DeviceFrameStyleId = (typeof DEVICE_FRAME_STYLES)[number]['id']

export const DEFAULT_DEVICE_FRAME_STYLE_ID: DeviceFrameStyleId = 'front'

/**
 * Which presets appear in the Assets sidebar grid. Front only for now — append more
 * {@link DeviceFrameStyleId} values when those angles are enabled in the UI.
 */
export const DEVICE_FRAME_STYLE_IDS_IN_SIDEBAR: readonly DeviceFrameStyleId[] = ['front', 'iso-down-left']

export function getDeviceFrameStyle(
  id: DeviceFrameStyleId | string | undefined,
): (typeof DEVICE_FRAME_STYLES)[number] {
  const found = DEVICE_FRAME_STYLES.find((s) => s.id === id)
  if (found) return found
  return DEVICE_FRAME_STYLES.find((s) => s.id === DEFAULT_DEVICE_FRAME_STYLE_ID)!
}

/** Sidebar grid entries, in {@link DEVICE_FRAME_STYLE_IDS_IN_SIDEBAR} order. */
export const DEVICE_FRAME_STYLES_FOR_SIDEBAR: (typeof DEVICE_FRAME_STYLES)[number][] =
  DEVICE_FRAME_STYLE_IDS_IN_SIDEBAR.map((id) => getDeviceFrameStyle(id))
