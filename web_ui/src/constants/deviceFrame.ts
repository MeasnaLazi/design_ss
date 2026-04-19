import { DEFAULT_DEVICE_FRAME_STYLE_ID } from './deviceFrameStyles'

/**
 * Must match each frame SVG's logical size and masked “screen” opening (iso/perspective: 320×640).
 * `front.svg` uses {@link DEVICE_FRAME_FRONT} (772×1571 viewBox).
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
 * `public/device-frames/front.svg`: viewBox 772×1571. Metrics scaled from the prior 428×868 frame
 * so clip / cover math matches the same bezel proportions at the new resolution.
 */
export const DEVICE_FRAME_FRONT: DeviceFrameMetrics = {
  viewW: 772,
  viewH: 1571,
  screenX: 23.81915,
  screenY: -17.88707,
  screenW: 722.8226,
  screenH: 1569.05117,
  cornerRadius: 97.02882,
}

/**
 * 4-corner definition of a non-rectangular screen face (parallelogram or trapezoid).
 * All coordinates are in SVG viewBox units.
 */
export type ScreenQuad = {
  tl: readonly [number, number]
  tr: readonly [number, number]
  /** Explicit bottom-right corner from the `#screen` path (may differ from TR+BL−TL for non-parallelogram glass). */
  br: readonly [number, number]
  bl: readonly [number, number]
  /** viewBox width of the SVG that owns this quad */
  viewW: number
  /** viewBox height of the SVG that owns this quad */
  viewH: number
  /** Raw `d` attribute of the `#screen` path — used as the exact Fabric clip boundary */
  pathD: string
  /** Uniform rounded-corner clip radius (SVG/viewBox units). Used when {@link clipCornerRadiiPx} omits a corner. */
  clipCornerRadiusPx?: number
  /** Per-corner clip radii (tl → tr → br → bl). Omitted keys fall back to {@link clipCornerRadiusPx} then app default. */
  clipCornerRadiiPx?: ScreenQuadClipCornerRadiiPx
}

/** Per-corner rounded clip radii in SVG/viewBox units (same order as quad: TL, TR, BR, BL). */
export type ScreenQuadClipCornerRadiiPx = {
  tl?: number
  tr?: number
  br?: number
  bl?: number
}

/**
 * `public/device-frames/iso-down-left.svg`: viewBox 1282×1485.
 * Corners extracted from the `fill="none"` path (the transparent screen face).
 */
export const ISO_DOWN_LEFT_SCREEN_QUAD: ScreenQuad = {
  tl: [53, 121],
  tr: [538, 3],
  br: [1261, 1274],
  bl: [779, 1430],
  viewW: 1282,
  viewH: 1485,
  pathD: 'M 53 121 L 538 3 L 1261 1274 L 779 1430 Z',
}

export function getDeviceFrameMetricsForStyle(styleId: string | undefined): DeviceFrameMetrics {
  const id = styleId ?? DEFAULT_DEVICE_FRAME_STYLE_ID
  if (id === 'front') return DEVICE_FRAME_FRONT
  return DEVICE_FRAME
}

/** Returns a {@link ScreenQuad} for frames whose screen is a parallelogram, or null for rectangular frames. */
export function getScreenQuadForStyle(styleId: string | undefined): ScreenQuad | null {
  const id = styleId ?? DEFAULT_DEVICE_FRAME_STYLE_ID
  if (id === 'iso-down-left') return ISO_DOWN_LEFT_SCREEN_QUAD
  return null
}

/**
 * Portrait screenshots: match **width ÷ height** to these values so uniform “cover” scaling
 * fills the hole without trimming an extra band on one axis (same as matching `screenW`:`screenH` in SVG units).
 *
 * - **Front** (`front.svg` hole): same aspect as `screenW`:`screenH` (~**1 : 2.17**). Example bake: 2241×4745.
 * - **Iso / perspective** (`DEVICE_FRAME`): **33 : 61** (264×488), height ÷ width ≈ **1.848**.
 */
export const IDEAL_SCREENSHOT_ASPECT_RATIO_FRONT =
  DEVICE_FRAME_FRONT.screenW / DEVICE_FRAME_FRONT.screenH

export const IDEAL_SCREENSHOT_ASPECT_RATIO_ISO = DEVICE_FRAME.screenW / DEVICE_FRAME.screenH

/**
 * Pixel size to resample uploads to before placing on the frame (uniform cover into this rect).
 * Front uses fixed **2241×4745** (prior 1242×2622 scaled by 772/428 and 1571/868).
 */
export const DEVICE_SCREENSHOT_BAKE_SIZE_FRONT = { width: 2241, height: 4745 } as const

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

/** Rendered width on canvas (height follows aspect ratio). ~75% of the active panel width. */
export function deviceFrameTargetWidth(panelWidthPx: number): number {
  return Math.round(panelWidthPx * 0.75)
}

/**
 * After dragging, clamping allows the bezel to extend past the artboard top/bottom by this many
 * canvas px so a frame can sit partly “above” the screenshot row (e.g. spanning two+ panels).
 */
export const DEVICE_FRAME_PANEL_CLAMP_VERTICAL_BLEED_PX = 900
