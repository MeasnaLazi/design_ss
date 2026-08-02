/**
 * Dev/preview-server API for the strip editor.
 *
 * Two jobs:
 *
 * 1. **Repo-root static aliasing.** Strip HTML references assets root-relatively
 *    (`/datasource/…`, `/web_ui/public/device-frames/…`, `/composer/…`) because
 *    `composer/render.mjs` serves the repo root. Vite's root is `strip_editor/`,
 *    so this middleware serves those prefixes straight off disk — the same URL
 *    space the export renderer uses. Also aliases `/__api/datasource/*` →
 *    `datasource/*` for strips authored against the web_ui dev server (same
 *    alias `render.mjs` implements).
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
import fs from 'node:fs/promises'
import nodeFs from 'node:fs'
import path from 'node:path'

const EDITOR_DIR = path.dirname(fileURLToPath(import.meta.url))
export const REPO_ROOT = path.resolve(EDITOR_DIR, '..')

/** Directories the editor may list / open strips from (repo-relative, POSIX). */
const STRIP_DIRS = ['output/strips', 'composer/test'] as const

/**
 * URL prefixes served straight off the repo root (the render.mjs URL space).
 *
 * `/strip_editor/assets/` is here for the image placeholder. `render.mjs` serves
 * the whole repo root so it resolves there for free; this middleware has to be
 * told, because Vite's root is `strip_editor/` and the URL would otherwise fall
 * through to the SPA handler.
 */
const STATIC_PREFIXES = [
  '/datasource/',
  '/web_ui/public/',
  '/composer/',
  '/output/',
  '/strip_editor/assets/',
] as const

const API_PREFIX = '/__api/strip-editor/'

/** Screenshot library, repo-relative. Buckets are export presets. */
const SCREENSHOTS_DIR = 'datasource/screenshots'
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
 * One-way exclusive edit mode, mirroring web_ui's
 * `/__api/screenshot-designer/mode` contract so the agent skill can reuse the
 * same discipline. Dev-server lifetime state; restart resets to `human`.
 * (Endpoint lands in P0 so the shape is fixed; the banner + take-over UI is P6.)
 */
type EditorMode = { mode: 'human' | 'agent'; since: string; holder: string | null }
let editorMode: EditorMode = { mode: 'human', since: new Date().toISOString(), holder: null }

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

/** Serve a repo-root file for one of {@link STATIC_PREFIXES}. Returns false if not handled. */
async function serveStatic(urlPath: string, res: ServerResponse): Promise<boolean> {
  // Strips authored against the web_ui dev server use /__api/datasource/*.
  const normalized = urlPath.startsWith('/__api/datasource/')
    ? urlPath.replace('/__api/datasource/', '/datasource/')
    : urlPath
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
        .then((stat) => send('change', { mtime: stat.mtime.toISOString(), size: stat.size }))
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
  void fs.stat(abs).then((stat) => send('snapshot', { mtime: stat.mtime.toISOString(), size: stat.size }))
}

/**
 * Render the strip with `composer/render.mjs` — the same exporter the design
 * ships through, run as a child process rather than reimplemented, so the
 * editor can never disagree with it about what an export looks like.
 */
async function runExport(abs: string): Promise<Record<string, unknown>> {
  const rel = toRepoRel(abs)
  const slug = path.basename(abs, path.extname(abs))
  const outDir = path.posix.join('output/strips/rendered', slug)

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
        // Creating never overwrites: a strip is someone's work, and a name
        // collision is far more likely a mistake than an intent to replace.
        try {
          await fs.access(abs)
          sendJson(res, 409, { ok: false, error: 'already_exists', path: toRepoRel(abs) })
          return
        } catch {
          /* absent, good */
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

      // --- GET /__api/strip-editor/screenshots?preset= ---------------------
      if (route === 'screenshots' && req.method === 'GET') {
        const preset = url.searchParams.get('preset')
        const dir = preset
          ? resolveInRepo(path.posix.join(SCREENSHOTS_DIR, preset))
          : resolveInRepo(SCREENSHOTS_DIR)
        if (!dir || (preset && !SAFE_SEGMENT.test(preset))) {
          sendJson(res, 400, { ok: false, error: 'bad_preset' })
          return
        }
        if (!preset) {
          // No preset given: enumerate the buckets so the UI can offer them.
          let entries: Dirent[] = []
          try {
            entries = await fs.readdir(dir, { withFileTypes: true })
          } catch {
            /* datasource/screenshots absent — treat as empty */
          }
          sendJson(res, 200, { ok: true, presets: entries.filter((e) => e.isDirectory()).map((e) => e.name) })
          return
        }
        let entries: Dirent[] = []
        try {
          entries = await fs.readdir(dir, { withFileTypes: true })
        } catch {
          sendJson(res, 200, { ok: true, preset, files: [] })
          return
        }
        const files = await Promise.all(
          entries
            .filter((e) => e.isFile() && IMAGE_EXT.has(path.extname(e.name).toLowerCase()))
            .map(async (e) => {
              const stat = await fs.stat(path.join(dir, e.name))
              return {
                name: e.name,
                // The URL form strips use, so the picker can write it straight in.
                url: `/${SCREENSHOTS_DIR}/${preset}/${e.name}`,
                size: stat.size,
                mtime: stat.mtime.toISOString(),
              }
            }),
        )
        files.sort((a, b) => b.mtime.localeCompare(a.mtime))
        sendJson(res, 200, { ok: true, preset, files })
        return
      }

      // --- POST /__api/strip-editor/screenshots?preset=&filename= ----------
      if (route === 'screenshots' && req.method === 'POST') {
        const preset = url.searchParams.get('preset') ?? ''
        const rawName = url.searchParams.get('filename') ?? ''
        const ext = path.extname(rawName).toLowerCase()
        if (!SAFE_SEGMENT.test(preset)) {
          sendJson(res, 400, { ok: false, error: 'bad_preset' })
          return
        }
        if (!SAFE_SEGMENT.test(path.basename(rawName, ext)) || !IMAGE_EXT.has(ext)) {
          sendJson(res, 400, { ok: false, error: 'bad_filename', allowed: [...IMAGE_EXT] })
          return
        }

        const chunks: Buffer[] = []
        let bytes = 0
        for await (const chunk of req) {
          bytes += (chunk as Buffer).length
          if (bytes > MAX_UPLOAD_BYTES) {
            sendJson(res, 413, { ok: false, error: 'too_large', limit: MAX_UPLOAD_BYTES })
            return
          }
          chunks.push(Buffer.from(chunk as Buffer))
        }
        if (bytes === 0) {
          sendJson(res, 400, { ok: false, error: 'empty_body' })
          return
        }

        const dir = resolveInRepo(path.posix.join(SCREENSHOTS_DIR, preset))
        if (!dir) {
          sendJson(res, 400, { ok: false, error: 'bad_preset' })
          return
        }
        await fs.mkdir(dir, { recursive: true })
        // Never overwrite: an existing screenshot may be referenced by other
        // strips, and a silent replacement would change designs elsewhere.
        const base = path.basename(rawName, ext)
        let name = `${base}${ext}`
        for (let n = 2; ; n++) {
          try {
            await fs.access(path.join(dir, name))
            name = `${base}-${n}${ext}`
          } catch {
            break
          }
        }
        await fs.writeFile(path.join(dir, name), Buffer.concat(chunks))
        console.info(`[strip-editor] uploaded ${SCREENSHOTS_DIR}/${preset}/${name} (${bytes} bytes)`)
        sendJson(res, 200, { ok: true, name, url: `/${SCREENSHOTS_DIR}/${preset}/${name}`, size: bytes })
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
          sendJson(res, 200, { ok: true, ...editorMode })
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
          editorMode = { mode, since: new Date().toISOString(), holder }
          console.info('[strip-editor] mode set', editorMode)
          sendJson(res, 200, { ok: true, ...editorMode })
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
