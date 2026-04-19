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
  /** Uniform rounded-corner clip radius (SVG/viewBox units). Used when per-corner radii omit a corner. */
  clipCornerRadiusPx?: number
  /** Per-corner clip radii (tl → tr → br → bl). Omitted keys fall back to {@link clipCornerRadiusPx} then app default. */
  clipCornerRadiiPx?: { tl?: number; tr?: number; br?: number; bl?: number }
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
