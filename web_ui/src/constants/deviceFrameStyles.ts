import {
  DEFAULT_DEVICE_FRAME_ANGLE_ID,
  FALLBACK_DEVICE_FRAME_STYLE,
  type DeviceFrameStyle,
} from '../lib/deviceFrameCatalog'

export const DEFAULT_DEVICE_FRAME_STYLE_ID = DEFAULT_DEVICE_FRAME_ANGLE_ID

export function getDeviceFrameStyle(id: string | undefined, styles: DeviceFrameStyle[]): DeviceFrameStyle {
  if (styles.length === 0) {
    return FALLBACK_DEVICE_FRAME_STYLE
  }
  const found = styles.find((s) => s.id === id)
  if (found) return found
  return (
    styles.find((s) => s.id === DEFAULT_DEVICE_FRAME_STYLE_ID) ??
    styles[0]!
  )
}
