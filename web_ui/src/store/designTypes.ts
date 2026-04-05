/**
 * Serializable design-layer metadata kept in sync with the Fabric canvas in later phases.
 * Fabric.Object instances are not stored in Zustand (see project architecture rules).
 */
export interface DesignConfig {
  screens: number
  gap: number
  /** Solid canvas color (under background image when set). */
  background: string
  /** Optional full-bleed background image (data URL or remote URL), cover-scaled to the canvas. */
  backgroundImageUrl: string | null
}

export type DesignObjectKind = 'text' | 'image' | 'device' | 'shape' | 'group'

export interface DesignObjectRecord {
  id: string
  kind: DesignObjectKind
  name: string
  /** Layer order; higher values draw on top */
  zIndex: number
}
