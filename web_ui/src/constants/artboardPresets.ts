/**
 * Export artboard presets (panel pixel size). Each {@link id} is also the dev screenshot subfolder name
 * under `datasource/screenshots/<id>/`.
 */
export const ARTBOARD_PRESETS = [
  {
    id: 'appstore_iphone_67',
    /** File: `datasource/display_iphone.json` */
    displayFileSlug: 'iphone',
    label: 'App Store · iPhone 6.7″',
    width: 1290,
    height: 2796,
    store: 'apple' as const,
    formFactor: 'phone' as const,
  },
  {
    id: 'appstore_ipad_129',
    /** File: `datasource/display_ipad.json` */
    displayFileSlug: 'ipad',
    label: 'App Store · iPad 12.9″',
    width: 2048,
    height: 2732,
    store: 'apple' as const,
    formFactor: 'tablet' as const,
  },
  {
    id: 'play_phone_portrait',
    /** File: `datasource/display_play_phone.json` */
    displayFileSlug: 'play_phone',
    label: 'Play Store · phone portrait',
    width: 1080,
    height: 1920,
    store: 'google' as const,
    formFactor: 'phone' as const,
  },
  {
    id: 'play_tablet_portrait',
    /** File: `datasource/display_play_tablet_portrait.json` */
    displayFileSlug: 'play_tablet_portrait',
    label: 'Play Store · tablet portrait',
    width: 1600,
    height: 2560,
    store: 'google' as const,
    formFactor: 'tablet' as const,
  },
  {
    id: 'play_tablet_landscape',
    /** File: `datasource/display_play_tablet_landscape.json` */
    displayFileSlug: 'play_tablet_landscape',
    label: 'Play Store · tablet landscape',
    width: 2560,
    height: 1600,
    store: 'google' as const,
    formFactor: 'tablet' as const,
  },
] as const

export type ArtboardPreset = (typeof ARTBOARD_PRESETS)[number]
export type ArtboardPresetId = ArtboardPreset['id']

export const DEFAULT_ARTBOARD_PRESET_ID: ArtboardPresetId = 'appstore_iphone_67'

/** Same values as {@link DEFAULT_ARTBOARD_PRESET_ID}; kept for callers that only need numbers. */
export const DEFAULT_ARTBOARD_WIDTH = ARTBOARD_PRESETS[0].width
export const DEFAULT_ARTBOARD_HEIGHT = ARTBOARD_PRESETS[0].height

export const ARTBOARD_PRESET_IDS: readonly ArtboardPresetId[] = ARTBOARD_PRESETS.map(
  (p) => p.id,
)

/** Allowed `slug` query values for `GET|PUT /__api/datasource/display?slug=…` → `display_<slug>.json`. */
export const DISPLAY_FILE_SLUGS: readonly string[] = ARTBOARD_PRESETS.map((p) => p.displayFileSlug)

export function isDisplayFileSlug(s: string): boolean {
  return (DISPLAY_FILE_SLUGS as readonly string[]).includes(s)
}

const PRESET_BY_ID: Record<ArtboardPresetId, ArtboardPreset> = Object.fromEntries(
  ARTBOARD_PRESETS.map((p) => [p.id, p]),
) as Record<ArtboardPresetId, ArtboardPreset>

export function isArtboardPresetId(s: string): s is ArtboardPresetId {
  return (ARTBOARD_PRESET_IDS as readonly string[]).includes(s)
}

export function normalizeArtboardPresetId(id: string | undefined): ArtboardPresetId {
  if (id && isArtboardPresetId(id)) return id
  return DEFAULT_ARTBOARD_PRESET_ID
}

export function getArtboardPreset(id: string | undefined): ArtboardPreset {
  return PRESET_BY_ID[normalizeArtboardPresetId(id)]
}

export function getArtboardDimensionsFromConfig(config: {
  artboardPresetId?: string
}): { width: number; height: number; presetId: ArtboardPresetId } {
  const presetId = normalizeArtboardPresetId(config.artboardPresetId)
  const p = PRESET_BY_ID[presetId]
  return { width: p.width, height: p.height, presetId }
}

/** Dev screenshot bucket for uploads (matches folder under `datasource/screenshots/`). */
export function screenshotBucketForConfig(config: {
  artboardPresetId?: string
}): ArtboardPresetId {
  return normalizeArtboardPresetId(config.artboardPresetId)
}

export function getDisplayFileSlug(presetId: string | undefined): string {
  return getArtboardPreset(presetId).displayFileSlug
}

export function displayDocumentFilenameForPreset(presetId: string | undefined): string {
  return `display_${getDisplayFileSlug(presetId)}.json`
}

/**
 * Slug that may fall back to legacy `display.json` on load when the per-preset file is missing.
 * Matches {@link DEFAULT_ARTBOARD_PRESET_ID}.
 */
export const DEFAULT_DISPLAY_FILE_SLUG = getDisplayFileSlug(DEFAULT_ARTBOARD_PRESET_ID)
