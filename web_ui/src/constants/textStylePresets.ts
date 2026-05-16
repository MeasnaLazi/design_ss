/**
 * Quick-add text style presets for the Text panel (sizes scaled for store screenshot artboards).
 * Layer names use `· P1` so they align with common `display_*.json` / template conventions.
 */
export type TextStylePresetId =
  | 'largeTitle'
  | 'title1'
  | 'title2'
  | 'title3'
  | 'headline'
  | 'body'
  | 'callout'
  | 'subheadline'
  | 'footnote'
  | 'caption1'
  | 'caption2'

export type TextStylePresetDefinition = {
  id: TextStylePresetId
  /** Human label in the UI */
  label: string
  /** Short token shown under the label (e.g. style identifier) */
  styleToken: string
  /** Shown in Layers list */
  layerName: string
  initialText: string
  fontSize: number
  fontWeight: string | number
  fontStyle: 'normal' | 'italic'
  textAlign: 'left' | 'center' | 'right'
  /** Textbox width in canvas px */
  width: number
  /** Default vertical placement so presets do not stack identically */
  top: number
}

export const TEXT_STYLE_PRESETS: readonly TextStylePresetDefinition[] = [
  {
    id: 'largeTitle',
    label: 'Large Title',
    styleToken: '.largeTitle',
    layerName: 'Large Title · P1',
    initialText: 'Large Title',
    fontSize: 162,
    fontWeight: '700',
    fontStyle: 'normal',
    textAlign: 'center',
    width: 1050,
    top: 100,
  },
  {
    id: 'title1',
    label: 'Title 1',
    styleToken: '.title1',
    layerName: 'Title 1 · P1',
    initialText: 'Title 1',
    fontSize: 138,
    fontWeight: '400',
    fontStyle: 'normal',
    textAlign: 'center',
    width: 1000,
    top: 128,
  },
  {
    id: 'title2',
    label: 'Title 2',
    styleToken: '.title2',
    layerName: 'Title 2 · P1',
    initialText: 'Title 2',
    fontSize: 114,
    fontWeight: '400',
    fontStyle: 'normal',
    textAlign: 'center',
    width: 960,
    top: 156,
  },
  {
    id: 'title3',
    label: 'Title 3',
    styleToken: '.title3',
    layerName: 'Title 3 · P1',
    initialText: 'Title 3',
    fontSize: 90,
    fontWeight: '600',
    fontStyle: 'normal',
    textAlign: 'center',
    width: 920,
    top: 184,
  },
  {
    id: 'headline',
    label: 'Headline',
    styleToken: '.headline',
    layerName: 'Headline · P1',
    initialText: 'Headline',
    fontSize: 72,
    fontWeight: '600',
    fontStyle: 'normal',
    textAlign: 'center',
    width: 900,
    top: 212,
  },
  {
    id: 'body',
    label: 'Body',
    styleToken: '.body',
    layerName: 'Body · P1',
    initialText: 'Body text',
    fontSize: 57,
    fontWeight: '400',
    fontStyle: 'normal',
    textAlign: 'center',
    width: 880,
    top: 248,
  },
  {
    id: 'callout',
    label: 'Callout',
    styleToken: '.callout',
    layerName: 'Callout · P1',
    initialText: 'Callout',
    fontSize: 51,
    fontWeight: '400',
    fontStyle: 'normal',
    textAlign: 'center',
    width: 860,
    top: 278,
  },
  {
    id: 'subheadline',
    label: 'Subheadline',
    styleToken: '.subheadline',
    layerName: 'Subheadline · P1',
    initialText: 'Subheadline',
    fontSize: 45,
    fontWeight: '400',
    fontStyle: 'normal',
    textAlign: 'center',
    width: 840,
    top: 306,
  },
  {
    id: 'footnote',
    label: 'Footnote',
    styleToken: '.footnote',
    layerName: 'Footnote · P1',
    initialText: 'Footnote',
    fontSize: 39,
    fontWeight: '400',
    fontStyle: 'normal',
    textAlign: 'center',
    width: 800,
    top: 334,
  },
  {
    id: 'caption1',
    label: 'Caption 1',
    styleToken: '.caption1',
    layerName: 'Caption 1 · P1',
    initialText: 'Caption 1',
    fontSize: 33,
    fontWeight: '400',
    fontStyle: 'normal',
    textAlign: 'center',
    width: 760,
    top: 360,
  },
  {
    id: 'caption2',
    label: 'Caption 2',
    styleToken: '.caption2',
    layerName: 'Caption 2 · P1',
    initialText: 'Caption 2',
    fontSize: 29,
    fontWeight: '400',
    fontStyle: 'normal',
    textAlign: 'center',
    width: 720,
    top: 386,
  },
]

export function getTextStylePreset(id: TextStylePresetId): TextStylePresetDefinition {
  const p = TEXT_STYLE_PRESETS.find((x) => x.id === id)
  if (!p) throw new Error(`Unknown text style preset: ${id}`)
  return p
}

/** Resolve sidebar / `add_text` **`font`** strings to a preset id (exact match on {@link TextStylePresetId}). */
export function tryParseTextStylePresetId(raw: string): TextStylePresetId | null {
  const trimmed = raw.trim()
  const found = TEXT_STYLE_PRESETS.find((x) => x.id === trimmed)
  return found ? found.id : null
}
