/** GET URL for a placeholder image served from `datasource/placeholder/` (dev server only). */
export const PLACEHOLDER_BASE = '/__api/datasource/placeholder'

export function placeholderImageUrl(filename: string): string {
  return `${PLACEHOLDER_BASE}/${encodeURIComponent(filename)}`
}