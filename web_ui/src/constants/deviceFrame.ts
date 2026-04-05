import { APP_STORE_SCREEN_WIDTH } from './appStoreScreens'

/**
 * Must match each SVG’s viewBox (320×640) and the masked “screen” opening.
 * Iso / perspective frames use this rect; `front.svg` uses {@link DEVICE_FRAME_FRONT}.
 */
export const DEVICE_FRAME = {
  viewW: 320,
  viewH: 640,
  screenX: 28,
  screenY: 76,
  screenW: 264,
  screenH: 488,
  cornerRadius: 28,
} as const

export type DeviceFrameMetrics = {
  viewW: number
  viewH: number
  screenX: number
  screenY: number
  screenW: number
  screenH: number
  cornerRadius: number
}

/** `public/device-frames/front.svg`: outer bezel mapped to full viewBox (no padding). */
export const DEVICE_FRAME_FRONT: DeviceFrameMetrics = {
  viewW: 320,
  viewH: 640,
  screenX: 11.690869799,
  screenY: 9.53887005,
  screenW: 296.545947191,
  screenH: 620.870844714,
  cornerRadius: 31.451842884,
}

export function getDeviceFrameMetricsForStyle(styleId: string | undefined): DeviceFrameMetrics {
  return styleId === 'front' ? DEVICE_FRAME_FRONT : DEVICE_FRAME
}

/** Rendered width on canvas (height follows aspect ratio). ~45% of one App Store panel. */
export const DEVICE_FRAME_TARGET_WIDTH = Math.round(APP_STORE_SCREEN_WIDTH * 0.75)
