import {
  DEFAULT_DISPLAY_FILE_SLUG,
} from '../constants/artboardPresets'
import type { DisplayDocumentV1 } from '../types/displayDocument'

const DISPLAY_ENDPOINT = '/__api/datasource/display'

export function displayDocumentUrl(slug: string): string {
  return `${DISPLAY_ENDPOINT}?slug=${encodeURIComponent(slug)}`
}

export async function putDisplayDocument(
  doc: DisplayDocumentV1,
  slug: string,
): Promise<void> {
  const res = await fetch(displayDocumentUrl(slug), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(doc, null, 2),
  })
  if (!res.ok) {
    const t = await res.text()
    throw new Error(t || `Save failed (${res.status})`)
  }
}

/**
 * Loads `display_<slug>.json`. For the default iPhone slug, falls back to legacy `display.json` if missing.
 */
export async function fetchDisplayDocument(slug: string): Promise<unknown> {
  let res = await fetch(displayDocumentUrl(slug))
  if (res.ok) {
    return res.json() as Promise<unknown>
  }
  if (slug === DEFAULT_DISPLAY_FILE_SLUG) {
    res = await fetch(DISPLAY_ENDPOINT)
    if (res.ok) {
      return res.json() as Promise<unknown>
    }
  }
  const t = await res.text()
  throw new Error(t || `Load failed (${res.status})`)
}

/** Same resolution as {@link fetchDisplayDocument}, but returns `null` when no file exists (404). */
export async function tryFetchDisplayDocument(slug: string): Promise<unknown | null> {
  const primary = await fetch(displayDocumentUrl(slug))
  if (primary.ok) {
    return (await primary.json()) as unknown
  }

  if (slug === DEFAULT_DISPLAY_FILE_SLUG) {
    const legacy = await fetch(DISPLAY_ENDPOINT)
    if (legacy.ok) {
      return (await legacy.json()) as unknown
    }
    if (legacy.status === 404) {
      return null
    }
    const t = await legacy.text()
    throw new Error(t || `Load failed (${legacy.status})`)
  }

  if (primary.status === 404) {
    return null
  }
  const t = await primary.text()
  throw new Error(t || `Load failed (${primary.status})`)
}
