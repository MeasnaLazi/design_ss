/**
 * Thin client for the strip-editor dev-server API
 * (see `vite-plugin-editor-api.ts`). Base is same-origin by default; override
 * with `VITE_EDITOR_API_BASE` when the UI is served from elsewhere.
 */
const BASE = (import.meta.env.VITE_EDITOR_API_BASE ?? '').replace(/\/+$/, '')

export const API_PREFIX = `${BASE}/__api/strip-editor`

export type StripFile = {
  /** Repo-relative POSIX path, e.g. `composer/test/bio-strip.html`. */
  path: string
  name: string
  dir: string
  mtime: string
  size: number
}

export type EditorMode = {
  mode: 'human' | 'agent'
  since: string
  holder: string | null
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { Accept: 'application/json' } })
  const body = (await res.json()) as T & { ok?: boolean; error?: string }
  if (!res.ok || body.ok === false) throw new Error(body.error ?? `request failed (${res.status})`)
  return body
}

export function listStrips(): Promise<{ files: StripFile[] }> {
  return getJson<{ files: StripFile[] }>(`${API_PREFIX}/files`)
}

export function readStrip(path: string): Promise<{ path: string; html: string; mtime: string }> {
  return getJson(`${API_PREFIX}/file?path=${encodeURIComponent(path)}`)
}

export class StaleFileError extends Error {
  expected: string
  actual: string

  constructor(expected: string, actual: string) {
    super('the file changed on disk since it was opened')
    this.name = 'StaleFileError'
    this.expected = expected
    this.actual = actual
  }
}

/**
 * Write the strip back. `expectMtime` is the mtime the editor loaded; the server
 * refuses with 409 if disk has moved on, which surfaces as {@link StaleFileError}.
 */
export async function writeStrip(
  path: string,
  html: string,
  expectMtime: string | null,
): Promise<{ path: string; mtime: string; bytes: number }> {
  const qs = new URLSearchParams({ path })
  if (expectMtime) qs.set('expectMtime', expectMtime)
  const res = await fetch(`${API_PREFIX}/file?${qs.toString()}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
    body: html,
  })
  const body = (await res.json()) as {
    ok?: boolean
    error?: string
    expected?: string
    actual?: string
    path: string
    mtime: string
    bytes: number
  }
  if (res.status === 409) throw new StaleFileError(body.expected ?? '', body.actual ?? '')
  if (!res.ok || body.ok === false) throw new Error(body.error ?? `save failed (${res.status})`)
  return { path: body.path, mtime: body.mtime, bytes: body.bytes }
}

/** Create a new strip file. Fails with 409 rather than overwriting. */
export async function createStrip(path: string, html: string): Promise<{ path: string; mtime: string }> {
  const res = await fetch(`${API_PREFIX}/create?path=${encodeURIComponent(path)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
    body: html,
  })
  const body = (await res.json()) as { ok?: boolean; error?: string; path: string; mtime: string }
  if (!res.ok || body.ok === false) {
    throw new Error(body.error === 'already_exists' ? 'A strip with that name already exists.' : (body.error ?? 'create failed'))
  }
  return { path: body.path, mtime: body.mtime }
}

export type ScreenshotFile = { name: string; url: string; size: number; mtime: string }

export function listScreenshotPresets(): Promise<{ presets: string[] }> {
  return getJson(`${API_PREFIX}/screenshots`)
}

export function listScreenshots(preset: string): Promise<{ preset: string; files: ScreenshotFile[] }> {
  return getJson(`${API_PREFIX}/screenshots?preset=${encodeURIComponent(preset)}`)
}

/** Upload as a raw body — the filename and bucket ride in the query string. */
export async function uploadScreenshot(preset: string, file: File): Promise<ScreenshotFile> {
  const qs = new URLSearchParams({ preset, filename: file.name })
  const res = await fetch(`${API_PREFIX}/screenshots?${qs.toString()}`, {
    method: 'POST',
    headers: { 'Content-Type': file.type || 'application/octet-stream' },
    body: file,
  })
  const body = (await res.json()) as { ok?: boolean; error?: string } & ScreenshotFile
  if (!res.ok || body.ok === false) throw new Error(body.error ?? `upload failed (${res.status})`)
  return { name: body.name, url: body.url, size: body.size, mtime: new Date().toISOString() }
}

/** Pose catalogue for a device pack, straight from the statically served frame.json. */
export type DevicePose = { name: string; description?: string; framePath: string }

export async function listDevicePoses(pack: string): Promise<DevicePose[]> {
  const res = await fetch(`/web_ui/public/device-frames/${encodeURIComponent(pack)}/frame.json`)
  if (!res.ok) throw new Error(`unknown device pack "${pack}"`)
  const json = (await res.json()) as { frames: DevicePose[] }
  return json.frames
}

export async function listDevicePacks(): Promise<string[]> {
  const res = await fetch('/web_ui/public/device-frames/index.json')
  if (!res.ok) return []
  const json = (await res.json()) as { devices: Array<{ path: string }> }
  // `path` looks like /device-frames/<pack>/frame.json — the pack id is the folder.
  return json.devices.map((d) => d.path.split('/').filter(Boolean)[1]).filter(Boolean)
}

export function getMode(): Promise<EditorMode> {
  return getJson<EditorMode>(`${API_PREFIX}/mode`)
}

export async function setMode(mode: 'human' | 'agent', holder?: string): Promise<EditorMode> {
  const res = await fetch(`${API_PREFIX}/mode`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode, holder }),
  })
  const body = (await res.json()) as EditorMode & { ok?: boolean; error?: string }
  if (!res.ok || body.ok === false) throw new Error(body.error ?? 'could not change mode')
  return body
}

export type ExportResult = {
  ok: boolean
  error?: string
  outDir?: string
  ms?: number
  panels?: Array<{ panel: string; file: string; width: number; height: number }>
  strip?: string | null
}

export async function exportStrip(path: string): Promise<ExportResult> {
  const res = await fetch(`${API_PREFIX}/export?path=${encodeURIComponent(path)}`, { method: 'POST' })
  return (await res.json()) as ExportResult
}

export type WatchEvent =
  | { type: 'snapshot' | 'change'; mtime: string; size: number }
  | { type: 'removed' }
  /** Connection state, reported by EventSource itself rather than the server. */
  | { type: 'connected' }
  | { type: 'disconnected' }

/**
 * Subscribe to on-disk changes for one strip.
 *
 * The stream reports the file's mtime rather than "something changed", so the
 * caller can recognise its own save (an mtime it already holds) without the
 * server needing to track who wrote what.
 */
export function watchStrip(path: string, onEvent: (event: WatchEvent) => void): () => void {
  const source = new EventSource(`${API_PREFIX}/watch?path=${encodeURIComponent(path)}`)

  const relay = (type: 'snapshot' | 'change' | 'removed') => (e: MessageEvent) => {
    try {
      onEvent({ type, ...(JSON.parse(e.data as string) as object) } as WatchEvent)
    } catch {
      /* malformed frame — ignore rather than tear down the stream */
    }
  }
  source.addEventListener('snapshot', relay('snapshot') as EventListener)
  source.addEventListener('change', relay('change') as EventListener)
  source.addEventListener('removed', relay('removed') as EventListener)

  // Connection state comes from EventSource, not from the server. Reporting it
  // is the difference between "live reload is off" and "live reload is broken
  // and nobody said so" — the second is how a watcher silently stops working
  // after a dev-server restart.
  source.onopen = () => onEvent({ type: 'connected' })
  source.onerror = () => onEvent({ type: 'disconnected' })

  return () => source.close()
}

/**
 * URL the editing iframe loads. `bust` forces a fresh document on reload —
 * strip assets are served `no-store`, but the HTML itself must not come from
 * the bfcache when we deliberately reload after an external edit.
 */
export function stripDocumentUrl(path: string, bust: number): string {
  return `${API_PREFIX}/raw?path=${encodeURIComponent(path)}&t=${bust}`
}
