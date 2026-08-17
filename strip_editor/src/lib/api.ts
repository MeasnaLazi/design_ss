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
  /**
   * When the agent's lease lapses, after which the document is the human's
   * again without anyone asking. `null` in human mode.
   */
  expiresAt: string | null
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

/**
 * Create a new strip file. Fails with 409 rather than overwriting.
 *
 * @param replace clear the strip's folder first. Destructive, and the reason
 *   the default is to fail: `strips/` is not in git, so nothing brings back
 *   what this removes.
 */
export async function createStrip(
  path: string,
  html: string,
  opts: { replace?: boolean } = {},
): Promise<{ path: string; mtime: string }> {
  const q = `path=${encodeURIComponent(path)}${opts.replace ? '&replace=1' : ''}`
  const res = await fetch(`${API_PREFIX}/create?${q}`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
    body: html,
  })
  const body = (await res.json()) as { ok?: boolean; error?: string; path: string; mtime: string }
  if (!res.ok || body.ok === false) {
    // Folders are named for the device target, so there are only a handful of
    // possible names and a collision is routine rather than exotic. Name the
    // folder and say what to do about it.
    const folder = path.replace(/\/strip\.html$/, '/')
    throw new Error(
      body.error === 'already_exists'
        ? `${folder} already exists — open it below, or delete the folder first.`
        : (body.error ?? 'create failed'),
    )
  }
  return { path: body.path, mtime: body.mtime }
}

export type ScreenshotFile = { name: string; url: string; size: number; mtime: string }

/**
 * Device captures belonging to the open strip, from `strips/<name>/screenshots/`.
 *
 * No export-preset bucket: every panel of a strip is authored at one export
 * size, so the preset is a property of the strip and there is nothing left for
 * a bucket to disambiguate.
 */
export function listScreenshots(strip: string): Promise<{ dir: string | null; files: ScreenshotFile[] }> {
  return getJson(`${API_PREFIX}/screenshots?${new URLSearchParams({ strip })}`)
}

/** Upload as a raw body — the strip and filename ride in the query string. */
export function uploadScreenshot(strip: string, file: File): Promise<ScreenshotFile> {
  return postImage(`${API_PREFIX}/screenshots?${new URLSearchParams({ strip, filename: file.name })}`, file)
}

/**
 * Artwork belonging to the open strip, from `strips/<name>/images/`.
 *
 * `dir` is the repo-relative folder the files came from, or `null` when the
 * strip has no folder of its own (a flat fixture) — the inspector shows it so
 * the author knows where an upload would land.
 */
export function listImages(strip: string): Promise<{ dir: string | null; files: ScreenshotFile[] }> {
  return getJson(`${API_PREFIX}/images?${new URLSearchParams({ strip })}`)
}

export function uploadImage(strip: string, file: File): Promise<ScreenshotFile> {
  return postImage(`${API_PREFIX}/images?${new URLSearchParams({ strip, filename: file.name })}`, file)
}

async function postImage(url: string, file: File): Promise<ScreenshotFile> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': file.type || 'application/octet-stream' },
    body: file,
  })
  const body = (await res.json()) as { ok?: boolean; error?: string } & ScreenshotFile
  if (!res.ok || body.ok === false) throw new Error(body.error ?? `upload failed (${res.status})`)
  return { name: body.name, url: body.url, size: body.size, mtime: new Date().toISOString() }
}

/**
 * Root under which the device-frame packs are served, matching the default in
 * `composer/device-frames.mjs`. Frame paths inside `index.json` are relative to
 * it, so this is the one place the location is written down.
 */
export const FRAMES_ROOT = '/composer'

/** Pose catalogue for a device pack, straight from the statically served frame.json. */
export type DevicePose = { name: string; description?: string; framePath: string }

export async function listDevicePoses(pack: string): Promise<DevicePose[]> {
  const res = await fetch(`${FRAMES_ROOT}/device-frames/${encodeURIComponent(pack)}/frame.json`)
  if (!res.ok) throw new Error(`unknown device pack "${pack}"`)
  const json = (await res.json()) as { frames: DevicePose[] }
  return json.frames
}

/**
 * A frame pack as the catalogue describes it.
 *
 * `type` is the contract that lets the editor offer the right mockups for the
 * strip being edited: **it must equal a folder name under `strips/`** —
 * `iphone`, `ipad`, `phone`, `tablet`. A pack typed anything else still works,
 * it simply never matches a strip and so is only reachable as a fallback.
 */
export type DevicePack = { id: string; name: string; type: string }

export async function listDevicePacks(): Promise<DevicePack[]> {
  const res = await fetch(`${FRAMES_ROOT}/device-frames/index.json`)
  if (!res.ok) return []
  const json = (await res.json()) as { devices: Array<{ path: string; name?: string; type?: string }> }
  return json.devices
    // `path` looks like /device-frames/<pack>/frame.json — the pack id is the folder.
    .map((d) => ({ id: d.path.split('/').filter(Boolean)[1], name: d.name ?? '', type: d.type ?? '' }))
    .filter((d) => Boolean(d.id))
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

/**
 * The target folder already holds a strip, and the caller has not said to
 * replace it. Carries the stage so the confirmed retry does not re-upload:
 * the files are already on the server, only the decision was missing.
 */
export class StripExistsError extends Error {
  device: string
  folder: string
  stage: string

  constructor(device: string, folder: string, stage: string) {
    super(`${folder} already holds a strip`)
    this.name = 'StripExistsError'
    this.device = device
    this.folder = folder
    this.stage = stage
  }
}

/** A file from a picked folder, with its path relative to that folder's root. */
export interface FolderFile {
  rel: string
  file: File
}

export interface LoadResult {
  path: string
  device: string
  label: string
  replaced: boolean
  /**
   * How many `/strips/…/` asset paths were repointed at the new folder.
   *
   * Non-zero means the document was edited on the way in, which the user is
   * told about rather than left to discover: a strip authored as `strips/bio/`
   * has the old folder name baked into every screenshot path, and copying it
   * without rewriting them resolves nothing.
   */
  retargeted: number
}

/**
 * Copy a strip folder from disk into `strips/<device>/`.
 *
 * The browser cannot hand over a filesystem path, only file contents, so this
 * is always a copy: stage every file server-side, then commit the folder as one
 * unit. Nothing under `strips/` changes until the commit, and the commit is
 * atomic in the way that matters — if the schema check fails, whatever was
 * there before is put back.
 *
 * Which device folder it lands in is not asked, it is measured: the server
 * reads the strip's panel size and matches it to a target.
 *
 * @param stage reuse an existing stage instead of uploading again — the retry
 *   path after {@link StripExistsError}.
 */
export async function loadStripFolder(
  files: FolderFile[],
  opts: { replace?: boolean; stage?: string; onProgress?: (done: number, total: number) => void } = {},
): Promise<LoadResult> {
  let stage = opts.stage
  if (!stage) {
    const begun = await fetch(`${API_PREFIX}/load-begin`, { method: 'POST' })
    const body = (await begun.json()) as { ok?: boolean; stage?: string; error?: string }
    if (!begun.ok || !body.stage) throw new Error(body.error ?? 'could not start the load')
    stage = body.stage

    let done = 0
    for (const { rel, file } of files) {
      const res = await fetch(`${API_PREFIX}/load-file?stage=${stage}&path=${encodeURIComponent(rel)}`, {
        method: 'POST',
        body: file,
      })
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(`${rel}: ${err.error ?? `upload failed (${res.status})`}`)
      }
      opts.onProgress?.(++done, files.length)
    }
  }

  const q = `stage=${stage}${opts.replace ? '&replace=1' : ''}`
  const res = await fetch(`${API_PREFIX}/load-commit?${q}`, { method: 'POST' })
  const body = (await res.json()) as {
    ok?: boolean
    error?: string
    path?: string
    device?: string
    label?: string
    replaced?: boolean
    retargeted?: number
    width?: number
    height?: number
    output?: string
  }

  if (res.status === 409 && body.error === 'exists') {
    throw new StripExistsError(body.device ?? '', body.path ?? '', stage)
  }
  if (!res.ok || body.ok === false) {
    throw new Error(loadErrorMessage(body))
  }
  return {
    path: body.path ?? '',
    device: body.device ?? '',
    label: body.label ?? '',
    replaced: body.replaced ?? false,
    retargeted: body.retargeted ?? 0,
  }
}

/** Turn a commit failure into something that says what to do about it. */
function loadErrorMessage(body: { error?: string; width?: number; height?: number; output?: string }): string {
  switch (body.error) {
    case 'no_strip_html':
      return 'No strip.html at the top of that folder. Pick the folder that contains it, not its parent.'
    case 'no_panel_size':
      return 'Could not read a panel size from that strip. Panels need a CSS width and height in px on a .panel rule.'
    case 'unknown_size':
      return `Panels are ${body.width}×${body.height}, which matches no device target. Nothing was changed.`
    case 'check_failed':
      return `The strip failed check-schema, so the previous folder was put back:\n${body.output ?? ''}`
    case 'too_many_files':
    case 'folder_too_large':
      return 'That folder is far larger than a strip. Check you picked the strip folder itself.'
    case 'stage_expired':
      return 'The upload expired. Pick the folder again.'
    default:
      return body.error ?? 'the load failed'
  }
}
