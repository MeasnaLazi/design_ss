import { APP_STORE_SCREEN_WIDTH } from './appStoreScreens'
import { DEFAULT_DEVICE_FRAME_STYLE_ID } from './deviceFrameStyles'

/**
 * Must match each frame SVG’s logical size and masked “screen” opening (iso/perspective: 320×640).
 * `front.svg` uses {@link DEVICE_FRAME_FRONT} (428×868 viewBox).
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

/**
 * `public/device-frames/front.svg`: Figma viewBox 428×868; root 320×640 + preserveAspectRatio none (fills canvas cell).
 * Screen hole matches mask `mFront` (~6px inset from inner black face).
 */
export const DEVICE_FRAME_FRONT: DeviceFrameMetrics = {
  viewW: 428,
  viewH: 868,
  screenX: 13.20532,
  screenY: -9.88269,
  screenW: 400.76,
  screenH: 867.487,
  cornerRadius: 53.7009,
}

export function getDeviceFrameMetricsForStyle(styleId: string | undefined): DeviceFrameMetrics {
  const id = styleId ?? DEFAULT_DEVICE_FRAME_STYLE_ID
  return id === 'front' ? DEVICE_FRAME_FRONT : DEVICE_FRAME
}

/**
 * Portrait screenshots: match **width ÷ height** to these values so uniform “cover” scaling
 * fills the hole without trimming an extra band on one axis (same as matching `screenW`:`screenH` in SVG units).
 *
 * - **Front** (`front.svg` hole): ≈ **1 : 2.115** (height ≈ 2.115× width). Example sizes: 402×850, 1206×2550, 1242×2622.
 * - **Iso / perspective** (`DEVICE_FRAME`): **33 : 61** (264×488), height ÷ width ≈ **1.848**.
 */
export const IDEAL_SCREENSHOT_ASPECT_RATIO_FRONT =
  DEVICE_FRAME_FRONT.screenW / DEVICE_FRAME_FRONT.screenH

export const IDEAL_SCREENSHOT_ASPECT_RATIO_ISO = DEVICE_FRAME.screenW / DEVICE_FRAME.screenH

/**
 * Pixel size to resample uploads to before placing on the frame (uniform cover into this rect).
 * Front uses fixed **1242×2622**; other styles scale from {@link DEVICE_SCREENSHOT_BAKE_LONG_EDGE}.
 */
export const DEVICE_SCREENSHOT_BAKE_SIZE_FRONT = { width: 1242, height: 2622 } as const

export const DEVICE_SCREENSHOT_BAKE_LONG_EDGE = 2622

export function getScreenshotBakeDimensions(m: DeviceFrameMetrics): { width: number; height: number } {
  if (m.viewW === DEVICE_FRAME_FRONT.viewW && m.viewH === DEVICE_FRAME_FRONT.viewH) {
    return { width: DEVICE_SCREENSHOT_BAKE_SIZE_FRONT.width, height: DEVICE_SCREENSHOT_BAKE_SIZE_FRONT.height }
  }
  const k = DEVICE_SCREENSHOT_BAKE_LONG_EDGE / m.screenH
  return {
    width: Math.max(1, Math.round(m.screenW * k)),
    height: Math.max(1, Math.round(m.screenH * k)),
  }
}

/**
 * Front frame only: shift the screenshot **down** in group space by this fraction of the scaled hole height.
 * Centers cover math on the hole, but iOS status bars often need a few % lower to clear the top curve.
 */
export const DEVICE_SCREENSHOT_VERTICAL_NUDGE_RATIO_FRONT = 0.024

export function screenshotVerticalNudgeY(scaledHoleHeight: number, m: DeviceFrameMetrics): number {
  if (m.viewW === DEVICE_FRAME_FRONT.viewW && m.viewH === DEVICE_FRAME_FRONT.viewH) {
    return scaledHoleHeight * DEVICE_SCREENSHOT_VERTICAL_NUDGE_RATIO_FRONT
  }
  return 0
}

/** Rendered width on canvas (height follows aspect ratio). ~45% of one App Store panel. */
export const DEVICE_FRAME_TARGET_WIDTH = Math.round(APP_STORE_SCREEN_WIDTH * 0.75)

/**
 * After dragging, clamping allows the bezel to extend past the artboard top/bottom by this many
 * canvas px so a frame can sit partly “above” the screenshot row (e.g. spanning two+ panels).
 */
export const DEVICE_FRAME_PANEL_CLAMP_VERTICAL_BLEED_PX = 900
