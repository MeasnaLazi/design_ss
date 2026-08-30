/**
 * Dev/preview-server API for the strip editor.
 *
 * Two jobs:
 *
 * 1. **Repo-root static aliasing.** Strip HTML references assets root-relatively
 *    (`/datasource/…`, `/composer/…`) because `composer/render.mjs` serves the
 *    repo root. Vite's root is `strip_editor/`, so this middleware serves those
 *    prefixes straight off disk — the same URL space the export renderer uses.
 *    It also implements the same two legacy aliases `render.mjs` does, so a
 *    strip renders identically in the iframe and in the export:
 *    `/__api/datasource/*` → `datasource/*`, and the pre-move device-frame
 *    prefix `/web_ui/public/device-frames/*` → `composer/device-frames/*`.
 *
 * 2. **Strip file IO** under `/__api/strip-editor/*` — list, read, raw-serve
 *    for the editing iframe.
 *
 * Middleware registered in the body of `configureServer` runs *before* Vite's
 * internal static/SPA middlewares, so the repo-root prefixes win over Vite's
 * 404 / index fallback.
 *
 * Path safety: every filesystem path is resolved and asserted to live inside
 * the repo root; strip reads/writes are additionally restricted to
 * {@link STRIP_DIRS}.
 */
import type { Dirent } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin, PreviewServer, ViteDevServer } from 'vite'

import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import nodeFs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { deviceForSize, panelSizeFromHtml, retargetStripAssets } from './src/editor/devices'

const EDITOR_DIR = path.dirname(fileURLToPath(import.meta.url))
export const REPO_ROOT = path.resolve(EDITOR_DIR, '..')

/**
 * Directories the editor may list / open strips from (repo-relative, POSIX).
 *
 * `strips/` holds one folder per strip — `strips/<name>/strip.html` with its
 * `images/` and `rendered/` beside it — so a strip and everything it references
 * travel together. `composer/test/` holds flat acceptance fixtures.
 */
const STRIP_DIRS = ['strips', 'composer/test'] as const

/**
 * URL prefixes served straight off the repo root (the render.mjs URL space).
 *
 * Checked *after* {@link aliasLegacy}, so a retired prefix needs an entry here
 * only if it still names a real directory.
 */
const STATIC_PREFIXES = ['/strips/', '/datasource/', '/composer/'] as const

const API_PREFIX = '/__api/strip-editor/'

/**
 * Limits on a folder load. Generous, because a real strip folder carries five
 * or more full-resolution captures; present so a mis-picked folder (a home
 * directory, a node_modules) fails fast instead of filling the disk.
 */
const MAX_LOAD_FILES = 400
const MAX_LOAD_BYTES = 300 * 1024 * 1024

/** Staging for an in-flight folder load, outside the repo. */
const LOAD_STAGE_ROOT = path.join(os.tmpdir(), 'strip-editor-load')

/**
 * Running totals per open stage, so the limits above apply to the *folder* and
 * not merely to each file in it. Without this a thousand small files pass every
 * individual check and still fill the disk.
 */
const loadStages = new Map<string, { files: number; bytes: number }>()

/**
 * Device screen captures for the open strip: `strips/<name>/screenshots/`.
 *
 * Flat, with no export-preset buckets. A strip's panels are all authored at one
 * export size, so the preset is a property of the strip, not of the folder — the
 * bucket a shared library needed to disambiguate has nothing left to
 * disambiguate once the captures belong to a single design.
 */
const SCREENSHOTS_SUBDIR = 'screenshots'

/** Sibling of {@link stripImagesDir}, for device captures. */
function stripScreenshotsDir(stripAbs: string): string | null {
  const rel = toRepoRel(stripAbs)
  if (!rel.startsWith('strips/')) return null
  return `${path.posix.dirname(rel)}/${SCREENSHOTS_SUBDIR}`
}
/**
 * Artwork for image layers lives *inside the strip folder*, at
 * `strips/<name>/images/`, not in a shared library.
 *
 * Separate from {@link SCREENSHOTS_SUBDIR} because the two are different kinds of
 * thing. A screenshot is destined for a phone screen and must match its export
 * preset's aspect ratio, which is what the preset buckets encode; it is also
 * app capture, reusable across strips. A logo or texture belongs to one design,
 * so it sits with that design and is committed with it — move the folder and
 * the strip still renders.
 */
const IMAGES_SUBDIR = 'images'

/**
 * The `images/` directory belonging to an open strip, repo-relative.
 *
 * Returns `null` for a strip that is not in its own folder (the flat fixtures
 * under `composer/test/`), where there is no such thing as "this strip's
 * folder" and writing one would litter the fixture directory.
 */
function stripImagesDir(stripAbs: string): string | null {
  const rel = toRepoRel(stripAbs)
  if (!rel.startsWith('strips/')) return null
  return `${path.posix.dirname(rel)}/${IMAGES_SUBDIR}`
}
/** One path segment, no traversal, no surprises in a URL. */
const SAFE_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]*$/
const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp'])
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
}

/**
 * One-way exclusive edit mode, matching the
 * `/__api/screenshot-designer/mode` contract so the agent skill can reuse the
 * same discipline. Dev-server lifetime state; restart resets to `human`.
 * (Endpoint lands in P0 so the shape is fixed; the banner + take-over UI is P6.)
 */
type EditorMode = { mode: 'human' | 'agent'; since: string; holder: string | null; expiresAt: string | null }
let editorMode: EditorMode = { mode: 'human', since: new Date().toISOString(), holder: null, expiresAt: null }

/**
 * How long an agent holds the document without further activity.
 *
 * The lock is a *lease*, not a latch, because the editor disables "Take over"
 * while it is held. A latch would mean an agent that crashed, was interrupted,
 * or simply forgot to release left the human locked out of their own editor
 * with no recourse short of restarting this server. Every agent write refreshes
 * the lease, so a working agent never loses it and a dead one costs 90 seconds.
 */
const LEASE_MS = Number(process.env.STRIP_EDITOR_LEASE_MS) || 90_000

/** Mtimes this server wrote itself, so its own saves are not read as an agent. */
const ownWrites = new Set<string>()

/** The lock as it stands now — an expired lease is simply the human's turn. */
function currentMode(): EditorMode {
  if (editorMode.mode === 'agent' && editorMode.expiresAt && Date.parse(editorMode.expiresAt) <= Date.now()) {
    editorMode = { mode: 'human', since: new Date().toISOString(), holder: null, expiresAt: null }
  }
  return editorMode
}

/** Claim or refresh the agent lease. */
function claimAgent(holder: string | null): EditorMode {
  const now = Date.now()
  const held = currentMode().mode === 'agent'
  editorMode = {
    mode: 'agent',
    // Keep the original start time across refreshes: the banner reads "since
    // 14:32", which should mean when the turn began, not when it last renewed.
    since: held ? editorMode.since : new Date(now).toISOString(),
    holder: holder ?? (held ? editorMode.holder : null),
    expiresAt: new Date(now + LEASE_MS).toISOString(),
  }
  return editorMode
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify(body))
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (c) => chunks.push(Buffer.from(c)))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

/** Resolve a repo-relative path, refusing anything that escapes the repo root. */
function resolveInRepo(relPath: string): string | null {
  const abs = path.resolve(REPO_ROOT, relPath)
  if (abs !== REPO_ROOT && !abs.startsWith(REPO_ROOT + path.sep)) return null
  return abs
}

/** Repo-relative POSIX path, as used in API params and the UI. */
function toRepoRel(abs: string): string {
  return path.relative(REPO_ROOT, abs).split(path.sep).join('/')
}

/**
 * Validate a strip path from a query param: must be `.html` and inside one of
 * {@link STRIP_DIRS}. Returns the absolute path, or `null` if rejected.
 */
function resolveStripPath(raw: string | null): string | null {
  if (!raw) return null
  const rel = raw.replace(/^\/+/, '')
  if (!rel.toLowerCase().endsWith('.html')) return null
  const abs = resolveInRepo(rel)
  if (!abs) return null
  const relPosix = toRepoRel(abs)
  const allowed = STRIP_DIRS.some((dir) => relPosix === dir || relPosix.startsWith(`${dir}/`))
  return allowed ? abs : null
}

async function listStrips(): Promise<Array<{ path: string; name: string; dir: string; mtime: string; size: number }>> {
  const out: Array<{ path: string; name: string; dir: string; mtime: string; size: number }> = []
  for (const dir of STRIP_DIRS) {
    const abs = path.resolve(REPO_ROOT, dir)
    let entries: Dirent[]
    try {
      entries = await fs.readdir(abs, { withFileTypes: true })
    } catch {
      continue // directory absent (e.g. output/ not generated yet) — not an error
    }
    for (const entry of entries) {
      // A strip folder: strips/<name>/strip.html. The *folder* names the strip,
      // so that is what the picker shows — every file would otherwise be called
      // "strip.html" and the list would be unreadable.
      // Dot-directories are bookkeeping, not strips — `.load-backup-*` is one
      // of ours, kept beside the target only for as long as a load is in doubt.
      if (entry.name.startsWith('.')) continue
      if (entry.isDirectory()) {
        let inner: Dirent[]
        try {
          inner = await fs.readdir(path.join(abs, entry.name), { withFileTypes: true })
        } catch {
          continue
        }
        for (const f of inner) {
          if (!f.isFile() || !f.name.toLowerCase().endsWith('.html')) continue
          const filePath = path.join(abs, entry.name, f.name)
          const stat = await fs.stat(filePath)
          out.push({
            path: toRepoRel(filePath),
            name: entry.name,
            dir,
            mtime: stat.mtime.toISOString(),
            size: stat.size,
          })
        }
        continue
      }
      if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.html')) continue
      const filePath = path.join(abs, entry.name)
      const stat = await fs.stat(filePath)
      out.push({
        path: toRepoRel(filePath),
        name: entry.name,
        dir,
        mtime: stat.mtime.toISOString(),
        size: stat.size,
      })
    }
  }
  out.sort((a, b) => b.mtime.localeCompare(a.mtime))
  return out
}

type LibraryFile = { name: string; url: string; size: number; mtime: string }

/**
 * List the images in one directory, newest first.
 *
 * `urlPrefix` is the repo-root URL that `dir` is served under, so the returned
 * `url` is exactly what goes into the strip's `src` — the picker never has to
 * build a path itself. A missing directory lists as empty rather than failing:
 * the library is optional.
 */
async function readImageDir(dir: string, urlPrefix: string): Promise<LibraryFile[]> {
  let entries: Dirent[] = []
  try {
    entries = await fs.readdir(dir, { withFileTypes: true })
  } catch {
    return []
  }
  const files = await Promise.all(
    entries
      .filter((e) => e.isFile() && IMAGE_EXT.has(path.extname(e.name).toLowerCase()))
      .map(async (e) => {
        const stat = await fs.stat(path.join(dir, e.name))
        return { name: e.name, url: `${urlPrefix}/${e.name}`, size: stat.size, mtime: stat.mtime.toISOString() }
      }),
  )
  files.sort((a, b) => b.mtime.localeCompare(a.mtime))
  return files
}

/**
 * Read an upload body, enforcing {@link MAX_UPLOAD_BYTES}.
 * Responds itself and returns `null` if the body is oversized or empty.
 */
async function receiveUpload(req: IncomingMessage, res: ServerResponse): Promise<Buffer | null> {
  const chunks: Buffer[] = []
  let bytes = 0
  for await (const chunk of req) {
    bytes += (chunk as Buffer).length
    if (bytes > MAX_UPLOAD_BYTES) {
      sendJson(res, 413, { ok: false, error: 'too_large', limit: MAX_UPLOAD_BYTES })
      return null
    }
    chunks.push(Buffer.from(chunk as Buffer))
  }
  if (bytes === 0) {
    sendJson(res, 400, { ok: false, error: 'empty_body' })
    return null
  }
  return Buffer.concat(chunks)
}

/**
 * Write `data` into `dir` under a name that is not already taken.
 *
 * Never overwrites: an existing image may be referenced by other strips, and a
 * silent replacement would change designs the author is not looking at.
 */
async function writeUnique(dir: string, rawName: string, data: Buffer): Promise<string> {
  await fs.mkdir(dir, { recursive: true })
  const ext = path.extname(rawName).toLowerCase()
  const base = path.basename(rawName, path.extname(rawName))
  let name = `${base}${ext}`
  for (let n = 2; ; n++) {
    try {
      await fs.access(path.join(dir, name))
      name = `${base}-${n}${ext}`
    } catch {
      break
    }
  }
  await fs.writeFile(path.join(dir, name), data)
  return name
}

/**
 * Is this a filename the library will accept?
 *
 * Rejects anything carrying a directory component outright rather than reducing
 * it to its basename. Both land in the right directory, but silently accepting
 * `../../logo.png` and storing it as `logo.png` means the client is told the
 * upload succeeded under a name it never asked for.
 */
function validUploadName(rawName: string): boolean {
  if (!rawName || rawName !== path.basename(rawName) || rawName.includes('/') || rawName.includes('\\')) {
    return false
  }
  const ext = path.extname(rawName).toLowerCase()
  return SAFE_SEGMENT.test(path.basename(rawName, path.extname(rawName))) && IMAGE_EXT.has(ext)
}

/**
 * Rewrite legacy URL prefixes onto their current location.
 *
 * Must stay in lockstep with the same aliases in `composer/render.mjs`: if the
 * two disagree, a strip renders one way in the editor and another way in the
 * export, which is precisely the class of bug this editor exists to remove.
 */
function aliasLegacy(urlPath: string): string {
  // Strips authored against the web_ui dev server use /__api/datasource/*.
  if (urlPath.startsWith('/__api/datasource/')) {
    return urlPath.replace('/__api/datasource/', '/datasource/')
  }
  // Device frames lived in web_ui/public/ before they moved next to the runtime
  // that reads them. Strips predating the move hardcode the old prefix, and the
  // ones in output/ are gitignored — aliasing is cheaper than rewriting files
  // that have no version history to fall back on.
  if (urlPath.startsWith('/web_ui/public/device-frames/')) {
    return urlPath.replace('/web_ui/public/device-frames/', '/composer/device-frames/')
  }
  return urlPath
}

/** Serve a repo-root file for one of {@link STATIC_PREFIXES}. Returns false if not handled. */
async function serveStatic(urlPath: string, res: ServerResponse): Promise<boolean> {
  const normalized = aliasLegacy(urlPath)
  if (!STATIC_PREFIXES.some((p) => normalized.startsWith(p))) return false

  const abs = resolveInRepo(normalized.replace(/^\/+/, ''))
  if (!abs) {
    res.statusCode = 403
    res.end('forbidden')
    return true
  }
  try {
    const data = await fs.readFile(abs)
    res.statusCode = 200
    res.setHeader('Content-Type', MIME[path.extname(abs).toLowerCase()] ?? 'application/octet-stream')
    // Strip assets change on disk while the editor is open; never cache them.
    res.setHeader('Cache-Control', 'no-store')
    res.end(data)
  } catch {
    res.statusCode = 404
    res.end('not found')
  }
  return true
}

/**
 * Stream file-change events for one strip.
 *
 * Watches the **directory**, not the file. Atomic saves — including this
 * editor's own tmp+rename — replace the inode, and a watch bound to the old
 * file goes deaf the moment anyone saves properly. Watching the parent and
 * filtering by name survives that.
 *
 * Events carry the mtime so the client can tell its own save (mtime it already
 * holds) from someone else's (mtime it has never seen) without any
 * echo-suppression bookkeeping here.
 */
function watchStrip(abs: string, req: IncomingMessage, res: ServerResponse): void {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-store',
    Connection: 'keep-alive',
    // Vite sits behind no proxy in dev, but this is free insurance.
    'X-Accel-Buffering': 'no',
  })

  const send = (event: string, data: unknown): void => {
    try {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
    } catch {
      /* client gone */
    }
  }

  const name = path.basename(abs)
  let timer: NodeJS.Timeout | null = null

  const emitChange = (): void => {
    // Editors and atomic renames fire several events per save; collapse them.
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      void fs
        .stat(abs)
        .then((stat) => {
          const mtime = stat.mtime.toISOString()
          // A write this server did not make is somebody else's turn. Claiming
          // the lease here rather than waiting to be told means an agent that
          // never calls the mode endpoint still puts the canvas out of the way
          // — the editor stops depending on the other party's good manners.
          //
          // It cannot tell an agent from a `git checkout` or an IDE save, and
          // does not try: the honest claim is "changed outside this editor",
          // which is what the banner says unless a holder identified itself.
          if (!ownWrites.delete(mtime)) claimAgent(null)
          send('change', { mtime, size: stat.size })
        })
        .catch(() => send('removed', { path: toRepoRel(abs) }))
    }, 120)
  }

  let watcher: nodeFs.FSWatcher | null = null
  try {
    watcher = nodeFs.watch(path.dirname(abs), (_type, changed) => {
      if (changed === null || changed === name) emitChange()
    })
  } catch (e: unknown) {
    send('error', { message: String((e as Error)?.message ?? e) })
  }

  // Proxies and browsers drop idle streams; a comment line keeps it warm.
  const keepAlive = setInterval(() => {
    try {
      res.write(': keep-alive\n\n')
    } catch {
      /* client gone */
    }
  }, 25_000)

  const close = (): void => {
    clearInterval(keepAlive)
    if (timer) clearTimeout(timer)
    watcher?.close()
  }
  req.on('close', close)
  res.on('close', close)

  // Named `snapshot`, not `open`: EventSource fires its *own* `open` event when
  // the connection is established, and a listener bound to that name would
  // receive both — one of them with no data at all.
  void fs
    .stat(abs)
    .then((stat) => send('snapshot', { mtime: stat.mtime.toISOString(), size: stat.size }))
    // The strip can be gone before the stream is even established: a folder
    // deleted by hand, then the page reloaded from a URL that still names it.
    // Unhandled, this rejection takes the whole dev server down with it, which
    // turns a missing file into "nothing works". Report it like any other
    // disappearance — the same event `emitChange` sends.
    .catch(() => send('removed', { path: toRepoRel(abs) }))
}

/**
 * Render the strip with `composer/render.mjs` — the same exporter the design
 * ships through, run as a child process rather than reimplemented, so the
 * editor can never disagree with it about what an export looks like.
 */
/**
 * A relative path inside a staged upload, or `null` if it is not one.
 *
 * Rejects rather than sanitises. `../../etc/passwd` reduced to `passwd` would
 * be written somewhere the client never named, and reporting that as a
 * successful upload is worse than refusing it.
 */
function safeStageRel(raw: string | null): string | null {
  if (!raw) return null
  const rel = raw.replace(/\\/g, '/').replace(/^\/+/, '')
  if (!rel || rel.length > 400) return null
  const parts = rel.split('/')
  if (parts.some((seg) => !seg || seg === '.' || seg === '..' || seg.startsWith('.'))) return null
  return parts.join('/')
}

function stageDir(id: string | null): string | null {
  if (!id || !/^[a-f0-9]{16}$/.test(id)) return null
  return path.join(LOAD_STAGE_ROOT, id)
}

/**
 * Run the real structural checker against a strip that is already in place.
 *
 * `check-schema.mjs` is the validation — the same program the export and CI
 * use. Writing a second checker here would measure something subtly different
 * from what ships, which is the exact disagreement this editor exists to
 * remove.
 *
 * It runs *after* the move, not before, and that ordering is deliberate: a
 * strip references its captures as `/strips/<device>/screenshots/…`, so those
 * paths only resolve once the folder is where it claims to be. Checking a
 * staged copy would report every screenshot as missing.
 */
function checkSchema(relPath: string): Promise<{ ok: boolean; output: string }> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(REPO_ROOT, 'composer', 'check-schema.mjs'), relPath], {
      cwd: REPO_ROOT,
    })
    let out = ''
    child.stdout.on('data', (d: Buffer) => (out += d.toString()))
    child.stderr.on('data', (d: Buffer) => (out += d.toString()))
    const timeout = setTimeout(() => child.kill('SIGKILL'), 30_000)
    child.on('error', (e) => {
      clearTimeout(timeout)
      resolve({ ok: false, output: `could not start check-schema.mjs: ${e.message}` })
    })
    child.on('close', (code) => {
      clearTimeout(timeout)
      resolve({ ok: code === 0, output: out.trim() })
    })
  })
}

async function runExport(abs: string): Promise<Record<string, unknown>> {
  const rel = toRepoRel(abs)
  // Renders land beside the strip they came from — strips/<name>/rendered/ —
  // so deleting a strip takes its output with it. Flat fixtures have no folder
  // of their own, so they keep a shared bucket.
  const outDir = rel.startsWith('strips/')
    ? path.posix.join(path.posix.dirname(rel), 'rendered')
    : path.posix.join('strips/.rendered', path.basename(abs, path.extname(abs)))

  return new Promise((resolve) => {
    const started = Date.now()
    const child = spawn(
      process.execPath,
      [path.join(REPO_ROOT, 'composer', 'render.mjs'), '--strip', rel, '--out', outDir, '--full'],
      { cwd: REPO_ROOT },
    )

    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (d: Buffer) => (stdout += d.toString()))
    child.stderr.on('data', (d: Buffer) => (stderr += d.toString()))

    const timeout = setTimeout(() => child.kill('SIGKILL'), 120_000)

    child.on('error', (e) => {
      clearTimeout(timeout)
      resolve({ ok: false, error: `could not start the renderer: ${e.message}` })
    })

    child.on('close', (code) => {
      clearTimeout(timeout)
      const ms = Date.now() - started
      if (code !== 0) {
        resolve({ ok: false, error: stderr.trim() || stdout.trim() || `renderer exited with code ${code}`, ms })
        return
      }
      // render.mjs prints a JSON summary on success.
      try {
        const summary = JSON.parse(stdout) as { panels?: unknown[]; strip?: string }
        resolve({ ok: true, outDir, ms, panels: summary.panels ?? [], strip: summary.strip ?? null })
      } catch {
        resolve({ ok: true, outDir, ms, panels: [], raw: stdout.slice(0, 2000) })
      }
    })
  })
}

export function editorApiPlugin(): Plugin {
  const middleware = async (
    req: IncomingMessage,
    res: ServerResponse,
    next: (err?: unknown) => void,
  ): Promise<void> => {
    let url: URL
    try {
      url = new URL(req.url ?? '/', 'http://strip.editor')
    } catch {
      next()
      return
    }
    const pathname = decodeURIComponent(url.pathname)

    try {
      if (await serveStatic(pathname, res)) return

      if (!pathname.startsWith(API_PREFIX)) {
        next()
        return
      }
      const route = pathname.slice(API_PREFIX.length)

      // --- GET /__api/strip-editor/files -----------------------------------
      if (route === 'files' && req.method === 'GET') {
        sendJson(res, 200, { ok: true, files: await listStrips() })
        return
      }

      // --- GET /__api/strip-editor/file?path= ------------------------------
      if (route === 'file' && req.method === 'GET') {
        const abs = resolveStripPath(url.searchParams.get('path'))
        if (!abs) {
          sendJson(res, 400, { ok: false, error: 'bad_path', allowedDirs: STRIP_DIRS })
          return
        }
        const [html, stat] = await Promise.all([fs.readFile(abs, 'utf8'), fs.stat(abs)])
        sendJson(res, 200, { ok: true, path: toRepoRel(abs), html, mtime: stat.mtime.toISOString() })
        return
      }

      // --- PUT /__api/strip-editor/file?path=&expectMtime= -----------------
      if (route === 'file' && req.method === 'PUT') {
        const abs = resolveStripPath(url.searchParams.get('path'))
        if (!abs) {
          sendJson(res, 400, { ok: false, error: 'bad_path', allowedDirs: STRIP_DIRS })
          return
        }
        const html = await readBody(req)
        if (!html.trim()) {
          sendJson(res, 400, { ok: false, error: 'empty_body' })
          return
        }

        // Optimistic concurrency: the client sends the mtime it loaded. If the
        // file moved under us — an agent edit, a git operation — refuse rather
        // than clobber. The editor then offers reload-or-overwrite.
        const expectMtime = url.searchParams.get('expectMtime')
        const current = await fs.stat(abs)
        if (expectMtime && current.mtime.toISOString() !== expectMtime) {
          sendJson(res, 409, {
            ok: false,
            error: 'stale_mtime',
            expected: expectMtime,
            actual: current.mtime.toISOString(),
          })
          return
        }

        // Atomic replace: write a sibling temp file, then rename over the target
        // so a crash mid-write can never leave a truncated strip on disk.
        const tmp = path.join(path.dirname(abs), `.${path.basename(abs)}.${process.pid}.tmp`)
        try {
          await fs.writeFile(tmp, html, 'utf8')
          await fs.rename(tmp, abs)
        } catch (e) {
          await fs.rm(tmp, { force: true })
          throw e
        }
        const after = await fs.stat(abs)
        // Remember the mtime so the watcher recognises this as our own save and
        // does not report the human's click as an agent taking the document.
        ownWrites.add(after.mtime.toISOString())
        console.info(`[strip-editor] saved ${toRepoRel(abs)} (${html.length} bytes)`)
        sendJson(res, 200, { ok: true, path: toRepoRel(abs), mtime: after.mtime.toISOString(), bytes: html.length })
        return
      }

      // --- POST /__api/strip-editor/create?path= ---------------------------
      if (route === 'create' && req.method === 'POST') {
        const abs = resolveStripPath(url.searchParams.get('path'))
        if (!abs) {
          sendJson(res, 400, { ok: false, error: 'bad_path', allowedDirs: STRIP_DIRS })
          return
        }
        // Creating never overwrites *by default*: a strip is someone's work,
        // and a name collision is far more likely a mistake than an intent to
        // replace. `replace=1` is the explicit opposite, and the client only
        // sends it behind a confirmation.
        const replace = url.searchParams.get('replace') === '1'
        let occupied = true
        try {
          await fs.access(abs)
        } catch {
          occupied = false
        }
        if (occupied && !replace) {
          sendJson(res, 409, { ok: false, error: 'already_exists', path: toRepoRel(abs) })
          return
        }
        if (occupied) {
          // Clear the whole strip folder, not just the document. A blank strip
          // references nothing, so the old screenshots and images would survive
          // as orphans — invisible, still on disk, and liable to be wired into
          // the next design by accident. This is what a pipeline run does too:
          // the folder is the unit, not the file.
          //
          // Only ever the folder directly under strips/. A flat fixture in
          // composer/test/ has no folder of its own, and deleting its parent
          // would take the other fixtures with it.
          const rel = toRepoRel(abs)
          const parent = path.posix.dirname(rel)
          if (parent.startsWith('strips/') && parent.split('/').length === 2) {
            await fs.rm(path.resolve(REPO_ROOT, parent), { recursive: true, force: true })
            console.info(`[strip-editor] cleared ${parent}/ before recreating`)
          } else {
            await fs.rm(abs, { force: true })
          }
        }
        const html = await readBody(req)
        if (!html.trim()) {
          sendJson(res, 400, { ok: false, error: 'empty_body' })
          return
        }
        await fs.mkdir(path.dirname(abs), { recursive: true })
        await fs.writeFile(abs, html, 'utf8')
        const stat = await fs.stat(abs)
        console.info(`[strip-editor] created ${toRepoRel(abs)}`)
        sendJson(res, 200, { ok: true, path: toRepoRel(abs), mtime: stat.mtime.toISOString() })
        return
      }

      // --- POST /__api/strip-editor/load-begin -----------------------------
      // A folder load arrives file by file (a browser cannot hand over a path,
      // only contents), so it is staged outside the repo and committed as one
      // unit. Nothing under strips/ changes until commit.
      if (route === 'load-begin' && req.method === 'POST') {
        const id = crypto.randomBytes(8).toString('hex')
        await fs.mkdir(path.join(LOAD_STAGE_ROOT, id), { recursive: true })
        loadStages.set(id, { files: 0, bytes: 0 })
        sendJson(res, 200, { ok: true, stage: id })
        return
      }

      // --- POST /__api/strip-editor/load-file?stage=&path= -----------------
      if (route === 'load-file' && req.method === 'POST') {
        const dir = stageDir(url.searchParams.get('stage'))
        const rel = safeStageRel(url.searchParams.get('path'))
        if (!dir || !rel) {
          sendJson(res, 400, { ok: false, error: 'bad_stage_path' })
          return
        }
        try {
          await fs.access(dir)
        } catch {
          sendJson(res, 409, { ok: false, error: 'stage_expired' })
          return
        }
        const tally = loadStages.get(path.basename(dir)) ?? { files: 0, bytes: 0 }
        if (tally.files + 1 > MAX_LOAD_FILES) {
          sendJson(res, 413, { ok: false, error: 'too_many_files', limit: MAX_LOAD_FILES })
          return
        }
        const data = await receiveUpload(req, res)
        if (!data) return // receiveUpload already answered
        if (tally.bytes + data.length > MAX_LOAD_BYTES) {
          sendJson(res, 413, { ok: false, error: 'folder_too_large', limit: MAX_LOAD_BYTES })
          return
        }
        loadStages.set(path.basename(dir), { files: tally.files + 1, bytes: tally.bytes + data.length })
        const dest = path.join(dir, rel)
        await fs.mkdir(path.dirname(dest), { recursive: true })
        await fs.writeFile(dest, data)
        sendJson(res, 200, { ok: true, path: rel, bytes: data.length })
        return
      }

      // --- POST /__api/strip-editor/load-commit?stage=[&replace=1] ---------
      if (route === 'load-commit' && req.method === 'POST') {
        const dir = stageDir(url.searchParams.get('stage'))
        if (!dir) {
          sendJson(res, 400, { ok: false, error: 'bad_stage' })
          return
        }
        const cleanup = async (): Promise<void> => {
          loadStages.delete(path.basename(dir))
          await fs.rm(dir, { recursive: true, force: true })
        }

        let html: string
        try {
          html = await fs.readFile(path.join(dir, 'strip.html'), 'utf8')
        } catch {
          await cleanup()
          sendJson(res, 422, { ok: false, error: 'no_strip_html' })
          return
        }

        // The strip states its own device target, in its panel size. Deriving
        // it here rather than asking means a folder cannot be filed under a
        // device it was never built for.
        const size = panelSizeFromHtml(html)
        if (!size) {
          await cleanup()
          sendJson(res, 422, { ok: false, error: 'no_panel_size' })
          return
        }
        const device = deviceForSize(size.width, size.height)
        if (!device) {
          await cleanup()
          sendJson(res, 422, { ok: false, error: 'unknown_size', width: size.width, height: size.height })
          return
        }

        // The folder name is baked into the document's asset paths, so a strip
        // authored as `strips/bio/` points every screenshot at `/strips/bio/…`
        // and resolves nothing once it is copied somewhere else. Retarget before
        // the check, or a perfectly good folder fails on paths that describe
        // where it used to live.
        const retarget = retargetStripAssets(html, device.folder)
        if (retarget.changed > 0) {
          await fs.writeFile(path.join(dir, 'strip.html'), retarget.html, 'utf8')
        }

        const targetRel = `strips/${device.folder}`
        const target = path.join(REPO_ROOT, targetRel)
        let exists = true
        try {
          await fs.access(target)
        } catch {
          exists = false
        }
        if (exists && url.searchParams.get('replace') !== '1') {
          // Do not clean up: the client is about to confirm and commit again.
          sendJson(res, 409, { ok: false, error: 'exists', device: device.folder, path: `${targetRel}/` })
          return
        }

        // Move the existing folder aside rather than deleting it, so a strip
        // that fails the check can be put back exactly as it was. The dot
        // prefix keeps it out of the strip list while it sits there.
        const backup = exists ? path.join(REPO_ROOT, 'strips', `.load-backup-${device.folder}-${Date.now()}`) : null
        if (backup) await fs.rename(target, backup)

        try {
          // cp, not rename: the stage lives in the OS temp dir, which is often
          // a different filesystem, and rename across devices fails.
          await fs.cp(dir, target, { recursive: true })
          await cleanup()
        } catch (e: unknown) {
          await fs.rm(target, { recursive: true, force: true })
          if (backup) await fs.rename(backup, target)
          await cleanup()
          sendJson(res, 500, { ok: false, error: e instanceof Error ? e.message : String(e) })
          return
        }

        const stripRel = `${targetRel}/strip.html`
        const check = await checkSchema(stripRel)
        if (!check.ok) {
          await fs.rm(target, { recursive: true, force: true })
          if (backup) await fs.rename(backup, target)
          sendJson(res, 422, { ok: false, error: 'check_failed', device: device.folder, output: check.output })
          return
        }

        if (backup) await fs.rm(backup, { recursive: true, force: true })
        sendJson(res, 200, {
          ok: true,
          path: stripRel,
          device: device.folder,
          label: device.label,
          replaced: exists,
          retargeted: retarget.changed,
        })
        return
      }

      // --- GET /__api/strip-editor/raw?path= (iframe document) -------------
      if (route === 'raw' && req.method === 'GET') {
        const abs = resolveStripPath(url.searchParams.get('path'))
        if (!abs) {
          res.statusCode = 400
          res.end('bad path')
          return
        }
        const html = await fs.readFile(abs)
        res.statusCode = 200
        res.setHeader('Content-Type', 'text/html; charset=utf-8')
        res.setHeader('Cache-Control', 'no-store')
        res.end(html)
        return
      }

      // --- GET /__api/strip-editor/screenshots?strip= ----------------------
      if (route === 'screenshots' && req.method === 'GET') {
        const stripAbs = resolveStripPath(url.searchParams.get('strip'))
        const relDir = stripAbs && stripScreenshotsDir(stripAbs)
        if (!relDir) {
          sendJson(res, 200, { ok: true, dir: null, files: [] })
          return
        }
        const dir = resolveInRepo(relDir)
        if (!dir) {
          sendJson(res, 500, { ok: false, error: 'bad_screenshots_dir' })
          return
        }
        sendJson(res, 200, { ok: true, dir: relDir, files: await readImageDir(dir, `/${relDir}`) })
        return
      }

      // --- POST /__api/strip-editor/screenshots?strip=&filename= -----------
      if (route === 'screenshots' && req.method === 'POST') {
        const rawName = url.searchParams.get('filename') ?? ''
        if (!validUploadName(rawName)) {
          sendJson(res, 400, { ok: false, error: 'bad_filename', allowed: [...IMAGE_EXT] })
          return
        }
        const stripAbs = resolveStripPath(url.searchParams.get('strip'))
        const relDir = stripAbs && stripScreenshotsDir(stripAbs)
        if (!relDir) {
          sendJson(res, 400, { ok: false, error: 'no_strip_folder' })
          return
        }
        const dir = resolveInRepo(relDir)
        if (!dir) {
          sendJson(res, 500, { ok: false, error: 'bad_screenshots_dir' })
          return
        }
        const data = await receiveUpload(req, res)
        if (!data) return

        const name = await writeUnique(dir, rawName, data)
        console.info(`[strip-editor] uploaded ${relDir}/${name} (${data.length} bytes)`)
        sendJson(res, 200, { ok: true, name, url: `/${relDir}/${name}`, size: data.length })
        return
      }

      // --- GET /__api/strip-editor/images?strip= ---------------------------
      // Artwork for image layers, from the open strip's own folder.
      if (route === 'images' && req.method === 'GET') {
        const stripAbs = resolveStripPath(url.searchParams.get('strip'))
        const relDir = stripAbs && stripImagesDir(stripAbs)
        if (!relDir) {
          // No strip folder (a flat fixture, or no strip named): an empty
          // library, not an error. The inspector still lets you type a src.
          sendJson(res, 200, { ok: true, dir: null, files: [] })
          return
        }
        const dir = resolveInRepo(relDir)
        if (!dir) {
          sendJson(res, 500, { ok: false, error: 'bad_images_dir' })
          return
        }
        sendJson(res, 200, { ok: true, dir: relDir, files: await readImageDir(dir, `/${relDir}`) })
        return
      }

      // --- POST /__api/strip-editor/images?filename= ------------------------
      if (route === 'images' && req.method === 'POST') {
        const rawName = url.searchParams.get('filename') ?? ''
        if (!validUploadName(rawName)) {
          sendJson(res, 400, { ok: false, error: 'bad_filename', allowed: [...IMAGE_EXT] })
          return
        }
        const stripAbs = resolveStripPath(url.searchParams.get('strip'))
        const relDir = stripAbs && stripImagesDir(stripAbs)
        if (!relDir) {
          sendJson(res, 400, { ok: false, error: 'no_strip_folder' })
          return
        }
        const dir = resolveInRepo(relDir)
        if (!dir) {
          sendJson(res, 500, { ok: false, error: 'bad_images_dir' })
          return
        }
        const data = await receiveUpload(req, res)
        if (!data) return

        const name = await writeUnique(dir, rawName, data)
        console.info(`[strip-editor] uploaded ${relDir}/${name} (${data.length} bytes)`)
        sendJson(res, 200, { ok: true, name, url: `/${relDir}/${name}`, size: data.length })
        return
      }

      // --- GET /__api/strip-editor/watch?path= (SSE) -----------------------
      if (route === 'watch' && req.method === 'GET') {
        const abs = resolveStripPath(url.searchParams.get('path'))
        if (!abs) {
          sendJson(res, 400, { ok: false, error: 'bad_path' })
          return
        }
        watchStrip(abs, req, res)
        return
      }

      // --- POST /__api/strip-editor/export?path= ---------------------------
      if (route === 'export' && req.method === 'POST') {
        const abs = resolveStripPath(url.searchParams.get('path'))
        if (!abs) {
          sendJson(res, 400, { ok: false, error: 'bad_path' })
          return
        }
        sendJson(res, 200, await runExport(abs))
        return
      }

      // --- GET|POST /__api/strip-editor/mode -------------------------------
      if (route === 'mode') {
        if (req.method === 'GET') {
          sendJson(res, 200, { ok: true, ...currentMode(), leaseMs: LEASE_MS })
          return
        }
        if (req.method === 'POST') {
          const parsed = JSON.parse(await readBody(req)) as Record<string, unknown>
          const mode = String(parsed.mode ?? '')
          if (mode !== 'human' && mode !== 'agent') {
            sendJson(res, 400, { ok: false, error: 'invalid_mode', message: "mode must be 'human' or 'agent'" })
            return
          }
          const holder = typeof parsed.holder === 'string' && parsed.holder.trim() ? parsed.holder.trim() : null
          if (mode === 'agent') {
            // Claiming and renewing are the same call: an agent that POSTs
            // periodically through a long turn keeps the lease alive without
            // needing a separate heartbeat endpoint to remember.
            claimAgent(holder)
          } else {
            // Releasing is immediate and unconditional. Anyone may hand the
            // document back — refusing a release could only ever strand it.
            editorMode = { mode: 'human', since: new Date().toISOString(), holder: null, expiresAt: null }
          }
          console.info('[strip-editor] mode set', editorMode)
          sendJson(res, 200, { ok: true, ...editorMode, leaseMs: LEASE_MS })
          return
        }
        sendJson(res, 405, { ok: false, error: 'method_not_allowed' })
        return
      }

      sendJson(res, 404, { ok: false, error: 'unknown_route', route })
    } catch (e: unknown) {
      const err = e as NodeJS.ErrnoException
      if (err?.code === 'ENOENT') {
        sendJson(res, 404, { ok: false, error: 'not_found' })
        return
      }
      sendJson(res, 500, { ok: false, error: String(err?.message ?? e) })
    }
  }

  return {
    name: 'vite-plugin-strip-editor-api',
    configureServer(server: ViteDevServer) {
      server.middlewares.use(middleware)
    },
    configurePreviewServer(server: PreviewServer) {
      server.middlewares.use(middleware)
    },
  }
}
