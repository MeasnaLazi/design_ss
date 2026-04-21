import type { ArtboardPresetId } from '../constants/artboardPresets'

/**
 * Serializable design-layer metadata kept in sync with the Fabric canvas in later phases.
 * Fabric.Object instances are not stored in Zustand (see project architecture rules).
 */
export type CanvasBackgroundMode = 'solid' | 'gradient'

export type BackgroundGradientKind = 'linear' | 'radial'

export interface GradientColorStop {
  /** Position along the gradient axis, 0–1. */
  offset: number
  color: string
}

/**
 * Panel gradient under optional background image.
 * - Linear: `angleDeg` — 0° → right, 90° → down (canvas +y down).
 * - Radial: fills from a focal point; `angleDeg` shifts the focal point for a soft vignette.
 */
export interface BackgroundGradientConfig {
  kind: BackgroundGradientKind
  angleDeg: number
  /** At least two stops; offsets are clamped to [0, 1] when rendering. */
  stops: GradientColorStop[]
}

export interface DesignConfig {
  /** Active export artboard; drives panel size and screenshot upload subfolder in dev. */
  artboardPresetId: ArtboardPresetId
  screens: number
  gap: number
  /** Solid fill when {@link backgroundMode} is `solid`; also used as fallback in UI chrome. */
  background: string
  /** Base fill before optional {@link backgroundImageUrl}. */
  backgroundMode: CanvasBackgroundMode
  backgroundGradient: BackgroundGradientConfig
  /**
   * Optional full-bleed background image, cover-scaled to the canvas.
   * May be a legacy `data:image/...` URL (fallback when upload API is unavailable) or a
   * same-origin dev asset path such as `/__api/datasource/screenshots/<file>.png`.
   */
  backgroundImageUrl: string | null
}

/** For `setConfig`: allow updating a subset of {@link backgroundGradient} fields. */
export type DesignConfigPartial = Omit<Partial<DesignConfig>, 'backgroundGradient'> & {
  backgroundGradient?: Partial<BackgroundGradientConfig>
}

export type DesignObjectKind = 'text' | 'image' | 'device' | 'shape' | 'group'

export interface DesignObjectRecord {
  id: string
  kind: DesignObjectKind
  name: string
  /** Layer order; higher values draw on top */
  zIndex: number
  /** Set for {@link DesignObjectKind} `device`: matches `frames[].name` in `frame.json`. */
  deviceFrameStyleId?: string
  /** Pack id under `public/device-frames/<id>/` (e.g. `iphone_12_pro`). */
  deviceFramePackId?: string
}
