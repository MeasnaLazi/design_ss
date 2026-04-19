import type { DeviceFrameStyle } from '../lib/deviceFrameCatalog'

export type { DeviceFrameStyle } from '../lib/deviceFrameCatalog'

/** Preset id: matches `frames[].name` in each device `frame.json`. */
export type DeviceFrameStyleId = string

export const DEFAULT_DEVICE_FRAME_STYLE_ID = 'front'

export function getDeviceFrameStyle(
  id: DeviceFrameStyleId | string | undefined,
  styles: DeviceFrameStyle[],
): DeviceFrameStyle {
  if (styles.length === 0) {
    return {
      id: DEFAULT_DEVICE_FRAME_STYLE_ID,
      label: 'Front',
      src: '/device-frames/iphone_12_pro/frame/front.svg',
    }
  }
  const found = styles.find((s) => s.id === id)
  if (found) return found
  return (
    styles.find((s) => s.id === DEFAULT_DEVICE_FRAME_STYLE_ID) ??
    styles[0]!
  )
}
