/**
 * Apple App Store — iPhone 6.7" display, portrait (pixel dimensions used for export).
 * @see https://developer.apple.com/help/app-store-connect/reference/screenshot-specifications
 */
export const APP_STORE_SCREEN_WIDTH = 1290
export const APP_STORE_SCREEN_HEIGHT = 2796

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
