import { Gradient } from 'fabric'
import type { CSSProperties } from 'react'
import type { DesignConfig } from '../store/designTypes'

import { sortGradientStops } from './backgroundGradient'

/** Fills the gutter between screenshot panels (and matches the HTML chrome behind the canvas). */
export const CANVAS_GUTTER_COLOR = '#0a0a0a'

/**
 * Backdrop in {@link CanvasArea} — neutral gutter; panel fills are drawn only on the Fabric
 * artboards.
 */
export function canvasAreaBackdropStyle(): CSSProperties {
  return { backgroundColor: CANVAS_GUTTER_COLOR }
}

/** Solid or gradient fill for the strip-wide background rect (object-local coordinates span the full row). */
export function fabricPanelRectFill(
  config: DesignConfig,
): string | Gradient<'linear'> | Gradient<'radial'> {
  if (config.backgroundMode === 'solid') {
    return config.background
  }
  const g = config.backgroundGradient
  const colorStops = sortGradientStops(g.stops).map((s) => ({
    offset: Math.min(1, Math.max(0, s.offset)),
    color: s.color,
  }))

  if (g.kind === 'radial') {
    const rad = (g.angleDeg * Math.PI) / 180
    const shift = 0.2
    const fx = 0.5 + shift * Math.cos(rad)
    const fy = 0.5 + shift * Math.sin(rad)
    const dx = Math.max(fx, 1 - fx)
    const dy = Math.max(fy, 1 - fy)
    const r2 = Math.sqrt(dx * dx + dy * dy) + 0.02

    return new Gradient({
      type: 'radial',
      gradientUnits: 'percentage',
      coords: {
        x1: fx,
        y1: fy,
        r1: 0,
        x2: fx,
        y2: fy,
        r2,
      },
      colorStops,
    })
  }

  const rad = (g.angleDeg * Math.PI) / 180
  return new Gradient({
    type: 'linear',
    gradientUnits: 'percentage',
    coords: {
      x1: 0,
      y1: 0,
      x2: Math.cos(rad),
      y2: Math.sin(rad),
    },
    colorStops,
  })
}
