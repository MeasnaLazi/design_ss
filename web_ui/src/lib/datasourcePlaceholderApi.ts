import type { ArtboardPreset } from '../constants/artboardPresets'

/** GET URL for a placeholder image served from `datasource/placeholder/` (dev server only). */
export const PLACEHOLDER_BASE = '/__api/datasource/placeholder'

export function placeholderImageUrl(filename: string): string {
  return `${PLACEHOLDER_BASE}/${encodeURIComponent(filename)}`
}

/**
 * Returns the placeholder filename for a given artboard preset.
 *
 * Mapping:
 *   Apple  + phone  → iphone.jpg
 *   Apple  + tablet → ipad.jpg
 *   Google + phone  → phone.jpg
 *   Google + tablet → tablet.jpg
 */
const PLACEHOLDER_FILENAME: Record<string, string> = {
  'apple-phone': 'iphone.jpg',
  'apple-tablet': 'ipad.jpg',
  'google-phone': 'phone.jpg',
  'google-tablet': 'tablet.jpg',
}

export function placeholderFilenameForPreset(preset: ArtboardPreset): string {
  const key = `${preset.store}-${preset.formFactor}`
  return PLACEHOLDER_FILENAME[key] ?? 'phone.jpg'
}

/** Fetches a placeholder image from the dev server and returns it as a File. */
export async function fetchPlaceholderAsFile(filename: string): Promise<File> {
  const url = placeholderImageUrl(filename)
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`Placeholder not found: ${filename} (${res.status})`)
  }
  const blob = await res.blob()
  return new File([blob], filename, { type: blob.type || 'image/jpeg' })
}
