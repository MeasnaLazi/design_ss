import { Gradient } from 'fabric'
import type { CSSProperties } from 'react'
import type { DesignConfig } from '../store/designTypes'

/** Fills the gutter between screenshot panels (and matches the HTML chrome behind the canvas). */
export const CANVAS_GUTTER_COLOR = '#0a0a0a'

/**
 * Backdrop in {@link CanvasArea} — neutral gutter; panel fills are drawn only on the Fabric
 * artboards.
 */
export function canvasAreaBackdropStyle(): CSSProperties {
  return { backgroundColor: CANVAS_GUTTER_COLOR }
}

/** Solid or linear gradient fill for one screenshot panel rect (object-local coordinates). */
export function fabricPanelRectFill(
  config: DesignConfig,
): string | Gradient<'linear'> {
  if (config.backgroundMode === 'solid') {
    return config.background
  }
  const { colorFrom, colorTo, angleDeg } = config.backgroundGradient
  const rad = (angleDeg * Math.PI) / 180
  return new Gradient({
    type: 'linear',
    gradientUnits: 'percentage',
    coords: {
      x1: 0,
      y1: 0,
      x2: Math.cos(rad),
      y2: Math.sin(rad),
    },
    colorStops: [
      { offset: 0, color: colorFrom },
      { offset: 1, color: colorTo },
    ],
  })
}
