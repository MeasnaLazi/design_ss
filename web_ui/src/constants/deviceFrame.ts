import { APP_STORE_SCREEN_WIDTH } from './appStoreScreens'

/**
 * Must match `public/device-frame.svg` viewBox and the masked “screen” opening.
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

/** Rendered width on canvas (height follows aspect ratio). ~45% of one App Store panel. */
export const DEVICE_FRAME_TARGET_WIDTH = Math.round(APP_STORE_SCREEN_WIDTH * 0.75)

export const DEVICE_FRAME_SRC = '/device-frame.svg'
