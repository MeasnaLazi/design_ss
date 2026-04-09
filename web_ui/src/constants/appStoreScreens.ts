import {
  DEFAULT_ARTBOARD_HEIGHT,
  DEFAULT_ARTBOARD_WIDTH,
} from './artboardPresets'

/**
 * Default panel size (matches {@link DEFAULT_ARTBOARD_PRESET_ID} in `artboardPresets.ts`).
 * Prefer {@link getArtboardDimensionsFromConfig} for the active artboard.
 */
export const APP_STORE_SCREEN_WIDTH = DEFAULT_ARTBOARD_WIDTH
export const APP_STORE_SCREEN_HEIGHT = DEFAULT_ARTBOARD_HEIGHT

/** Allowed range when configuring the horizontal screenshot strip in the UI. */
export const SCREEN_LAYOUT_COUNT_MIN = 1
export const SCREEN_LAYOUT_COUNT_MAX = 10
export const SCREEN_LAYOUT_GAP_MIN = 0
export const SCREEN_LAYOUT_GAP_MAX = 200

export function totalContinuousWidth(
  screenCount: number,
  gapPx: number,
  screenWidth: number = APP_STORE_SCREEN_WIDTH,
): number {
  if (screenCount < 1) return 0
  return screenCount * screenWidth + (screenCount - 1) * gapPx
}

/** X positions for the left edge of screenshot panels 2..N (guides between artboards). */
export function screenshotLeftEdgeXs(
  screenCount: number,
  gapPx: number,
  screenWidth: number = APP_STORE_SCREEN_WIDTH,
): number[] {
  const xs: number[] = []
  for (let i = 2; i <= screenCount; i++) {
    xs.push((i - 1) * (screenWidth + gapPx))
  }
  return xs
}

/** Bounding box for exporting one App Store panel from the continuous canvas. */
export function screenExportRect(
  index: number,
  gapPx: number,
  screenWidth: number = APP_STORE_SCREEN_WIDTH,
  screenHeight: number = APP_STORE_SCREEN_HEIGHT,
): { left: number; top: number; width: number; height: number } {
  return {
    left: index * (screenWidth + gapPx),
    top: 0,
    width: screenWidth,
    height: screenHeight,
  }
}
