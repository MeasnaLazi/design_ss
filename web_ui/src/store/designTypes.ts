import type { DeviceFrameStyleId } from '../constants/deviceFrameStyles'

/**
 * Serializable design-layer metadata kept in sync with the Fabric canvas in later phases.
 * Fabric.Object instances are not stored in Zustand (see project architecture rules).
 */
export type CanvasBackgroundMode = 'solid' | 'gradient'

/** Linear gradient under optional background image. Angle: 0° = left→right, 90° = top→bottom (canvas +y down). */
export interface BackgroundGradientConfig {
  colorFrom: string
  colorTo: string
  angleDeg: number
}

export interface DesignConfig {
  screens: number
  gap: number
  /** Solid fill when {@link backgroundMode} is `solid`; also used as fallback in UI chrome. */
  background: string
  /** Base fill before optional {@link backgroundImageUrl}. */
  backgroundMode: CanvasBackgroundMode
  backgroundGradient: BackgroundGradientConfig
  /** Optional full-bleed background image (data URL or remote URL), cover-scaled to the canvas. */
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
  /** Set for {@link DesignObjectKind} `device` when using a perspective preset. */
  deviceFrameStyleId?: DeviceFrameStyleId
}
