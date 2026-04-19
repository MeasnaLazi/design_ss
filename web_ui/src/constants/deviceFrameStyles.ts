import { DEVICE_FRAME_FALLBACK_SRC, type DeviceFrameStyle } from '../lib/deviceFrameCatalog'

export const DEFAULT_DEVICE_FRAME_STYLE_ID = 'front'

export function getDeviceFrameStyle(id: string | undefined, styles: DeviceFrameStyle[]): DeviceFrameStyle {
  if (styles.length === 0) {
    return {
      id: DEFAULT_DEVICE_FRAME_STYLE_ID,
      label: 'Front',
      src: DEVICE_FRAME_FALLBACK_SRC,
    }
  }
  const found = styles.find((s) => s.id === id)
  if (found) return found
  return (
    styles.find((s) => s.id === DEFAULT_DEVICE_FRAME_STYLE_ID) ??
    styles[0]!
  )
}
