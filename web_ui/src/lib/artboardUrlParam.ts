import {
  ARTBOARD_PRESET_ID_LEGACY,
  isArtboardPresetId,
  type ArtboardPresetId,
} from '../constants/artboardPresets'

/**
 * Mirrors `?artboard=` for GET /__api/screenshot-designer/session: Referer often omits the query
 * string on same-origin subrequests, so the dev server reads this cookie instead.
 */
export const DESIGNER_ARTBOARD_COOKIE = 'screenshotDesignerArtboard'

const COOKIE_MAX_AGE_SEC = 60 * 60 * 24 * 400

/** Persist preset hint for the screenshot-designer session API (same-origin Cookie header). */
export function writeArtboardSessionCookie(presetId: ArtboardPresetId): void {
  const value = encodeURIComponent(artboardPresetToUrlParam(presetId))
  document.cookie = `${DESIGNER_ARTBOARD_COOKIE}=${value}; Path=/; Max-Age=${COOKIE_MAX_AGE_SEC}; SameSite=Lax`
}

/** Short keys for `?artboard=` on the app URL (same vocabulary as designer session `canvasSize`). */
const SHORT_TO_PRESET: Record<string, ArtboardPresetId> = {
  iphone: 'appstore_iphone_portrait',
  ipad: 'appstore_ipad_portrait',
  phone: 'play_phone_portrait',
  tablet: 'play_tablet_portrait',
}

const PRESET_TO_SHORT = new Map<ArtboardPresetId, string>(
  (Object.entries(SHORT_TO_PRESET) as [string, ArtboardPresetId][]).map(([k, v]) => [v, k]),
)

/** Parse `?artboard=` value into a preset id, or null if unknown. */
export function parseArtboardUrlParam(raw: string | null | undefined): ArtboardPresetId | null {
  if (raw == null) return null
  const v = raw.trim()
  if (!v) return null
  if (isArtboardPresetId(v)) return v
  const legacy = ARTBOARD_PRESET_ID_LEGACY[v]
  if (legacy) return legacy
  return SHORT_TO_PRESET[v.toLowerCase()] ?? null
}

/** Value for `?artboard=` (short key when possible, else full preset id). */
export function artboardPresetToUrlParam(id: ArtboardPresetId): string {
  return PRESET_TO_SHORT.get(id) ?? id
}

/** Update or add `?artboard=` and session cookie (Referer alone is unreliable for /__api/…). */
export function replaceArtboardQueryParam(presetId: ArtboardPresetId): void {
  const u = new URL(window.location.href)
  u.searchParams.set('artboard', artboardPresetToUrlParam(presetId))
  const next = `${u.pathname}${u.search}${u.hash}`
  window.history.replaceState(window.history.state, '', next)
  writeArtboardSessionCookie(presetId)
}
