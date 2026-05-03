/** Built-in font stack options for the text toolbar (canvas `fontFamily`). */
export const PRESET_FONT_FAMILIES = [
  'system-ui, -apple-system, sans-serif',
  'Georgia, serif',
  '"Times New Roman", Times, serif',
  'Arial, Helvetica, sans-serif',
  '"Helvetica Neue", Helvetica, sans-serif',
  '"Courier New", monospace',
  'Inter, sans-serif',
] as const

export const DEFAULT_TEXT_FONT_FAMILY = 'system-ui, -apple-system, sans-serif' as const

export type PresetFontFamily = (typeof PRESET_FONT_FAMILIES)[number]
