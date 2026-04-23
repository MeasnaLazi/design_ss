import { randomUUID } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin } from 'vite'
import busboy from 'busboy'

import { ARTBOARD_PRESET_IDS, isDisplayFileSlug } from './src/constants/artboardPresets'
import { DESIGNER_ARTBOARD_COOKIE } from './src/lib/artboardUrlParam'
import {
  getScreenshotDesignerSession,
  screenshotDesignerExecuteOperation,
  saveDisplayDocument,
} from './screenshot-designer-server'

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (c) => chunks.push(Buffer.from(c)))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

const SCREENSHOTS_PREFIX = '/__api/datasource/screenshots/'
const PLACEHOLDER_PREFIX = '/__api/datasource/placeholder/'
const SCREENSHOT_REF_REGEX = /\/__api\/datasource\/screenshots\/([^"'?#\s)]+)/g
const SCREENSHOT_CLEANUP_RETENTION_MS = 24 * 60 * 60 * 1000
const ALLOWED_MIME_EXT: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/webp': '.webp',
}

const SAFE_SCREENSHOT_FILENAME = /^[a-zA-Z0-9._-]+$/

function isAllowedScreenshotBucket(bucket: string): boolean {
  return (ARTBOARD_PRESET_IDS as readonly string[]).includes(bucket)
}

function collectScreenshotRefs(value: unknown, out: Set<string>): void {
  if (typeof value === 'string') {
    SCREENSHOT_REF_REGEX.lastIndex = 0
    let m: RegExpExecArray | null = null
    while ((m = SCREENSHOT_REF_REGEX.exec(value)) !== null) {
      const rel = m[1]?.trim()
      if (rel) out.add(rel)
    }
    return
  }
  if (Array.isArray(value)) {
    for (const v of value) collectScreenshotRefs(v, out)
    return
  }
  if (typeof value === 'object' && value !== null) {
    for (const v of Object.values(value as Record<string, unknown>)) {
      collectScreenshotRefs(v, out)
    }
  }
}

async function collectReferencedScreenshotPaths(datasourceDir: string): Promise<Set<string>> {
  const refs = new Set<string>()
  const filesToScan: string[] = []

  try {
    const names = await fs.readdir(datasourceDir, { withFileTypes: true })
    for (const entry of names) {
      if (
        entry.isFile() &&
        entry.name.endsWith('.json') &&
        (entry.name === 'display.json' || entry.name.startsWith('display_'))
      ) {
        filesToScan.push(path.join(datasourceDir, entry.name))
      }
    }
  } catch {
    return refs
  }

  const templatesDir = path.join(datasourceDir, TEMPLATES_SUBDIR)
  try {
    const names = await fs.readdir(templatesDir, { withFileTypes: true })
    for (const entry of names) {
      if (entry.isFile() && entry.name.endsWith('.json')) {
        filesToScan.push(path.join(templatesDir, entry.name))
      }
    }
  } catch {
    /* templates dir may not exist yet */
  }

  await Promise.all(
    filesToScan.map(async (filePath) => {
      try {
        const raw = JSON.parse(await fs.readFile(filePath, 'utf8')) as unknown
        collectScreenshotRefs(raw, refs)
      } catch {
        /* ignore malformed files */
      }
    }),
  )

  return refs
}

async function cleanupUnusedScreenshots(
  datasourceDir: string,
  screenshotsDir: string,
): Promise<void> {
  let entries: Awaited<ReturnType<typeof fs.readdir>>
  try {
    entries = await fs.readdir(screenshotsDir, { withFileTypes: true })
  } catch (e: unknown) {
    const err = e as NodeJS.ErrnoException
    if (err.code === 'ENOENT') return
    throw e
  }

  const referenced = await collectReferencedScreenshotPaths(datasourceDir)
  const now = Date.now()
  let removed = 0
  let inspected = 0

  for (const entry of entries) {
    if (entry.isFile()) {
      const rel = entry.name
      inspected += 1
      if (referenced.has(rel)) continue
      const full = path.join(screenshotsDir, entry.name)
      let stat: Awaited<ReturnType<typeof fs.stat>>
      try {
        stat = await fs.stat(full)
      } catch (e: unknown) {
        const err = e as NodeJS.ErrnoException
        if (err.code === 'ENOENT') continue
        throw e
      }
      if (now - stat.mtimeMs < SCREENSHOT_CLEANUP_RETENTION_MS) continue
      try {
        await fs.unlink(full)
      } catch (e: unknown) {
        const err = e as NodeJS.ErrnoException
        if (err.code === 'ENOENT') continue
        throw e
      }
      removed += 1
      continue
    }
    if (!entry.isDirectory()) continue
    const bucket = entry.name
    const bucketDir = path.join(screenshotsDir, bucket)
    let files: Awaited<ReturnType<typeof fs.readdir>>
    try {
      files = await fs.readdir(bucketDir, { withFileTypes: true })
    } catch {
      continue
    }
    for (const fileEntry of files) {
      if (!fileEntry.isFile()) continue
      const rel = `${bucket}/${fileEntry.name}`
      inspected += 1
      if (referenced.has(rel)) continue
      const full = path.join(bucketDir, fileEntry.name)
      let stat: Awaited<ReturnType<typeof fs.stat>>
      try {
        stat = await fs.stat(full)
      } catch (e: unknown) {
        const err = e as NodeJS.ErrnoException
        if (err.code === 'ENOENT') continue
        throw e
      }
      if (now - stat.mtimeMs < SCREENSHOT_CLEANUP_RETENTION_MS) continue
      try {
        await fs.unlink(full)
      } catch (e: unknown) {
        const err = e as NodeJS.ErrnoException
        if (err.code === 'ENOENT') continue
        throw e
      }
      removed += 1
    }
  }

  if (removed > 0) {
    console.info(
      `[datasource-api] removed ${removed} unreferenced screenshot(s) (inspected ${inspected})`,
    )
  }
}

const TEMPLATES_SUBDIR = 'templates'

/** Filenames written by PUT template (UUID + .json). */
const SAFE_TEMPLATE_FILENAME =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.json$/i

interface TemplateFilePayload {
  templateName: string
  savedAt: string
  document: unknown
}

function isTemplatePayload(x: unknown): x is TemplateFilePayload {
  if (typeof x !== 'object' || x === null) return false
  const o = x as Record<string, unknown>
  return (
    typeof o.templateName === 'string' &&
    typeof o.savedAt === 'string' &&
    o.document !== null &&
    typeof o.document === 'object'
  )
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x)
}

/** `?slug=` → `display_<slug>.json`; omit → legacy `display.json`. */
function resolveDisplayJsonFile(
  datasourceDir: string,
  reqUrl: string | undefined,
): { ok: true; filePath: string } | { ok: false; status: number; body: string } {
  try {
    const u = new URL(reqUrl ?? '/', 'http://vite.datasource')
    const slug = u.searchParams.get('slug')
    if (slug === null || slug === '') {
      return { ok: true, filePath: path.join(datasourceDir, 'display.json') }
    }
    if (!isDisplayFileSlug(slug)) {
      return { ok: false, status: 400, body: JSON.stringify({ error: 'invalid_display_slug' }) }
    }
    return { ok: true, filePath: path.join(datasourceDir, `display_${slug}.json`) }
  } catch {
    return { ok: true, filePath: path.join(datasourceDir, 'display.json') }
  }
}

async function sendScreenshotFile(
  nodeRes: ServerResponse,
  baseDir: string,
  filename: string,
): Promise<void> {
  if (!SAFE_SCREENSHOT_FILENAME.test(filename)) {
    nodeRes.statusCode = 400
    nodeRes.end()
    return
  }
  try {
    const baseReal = await fs.realpath(baseDir)
    const candidate = path.resolve(baseDir, filename)
    let fileReal: string
    try {
      fileReal = await fs.realpath(candidate)
    } catch {
      nodeRes.statusCode = 404
      nodeRes.end()
      return
    }
    const rel = path.relative(baseReal, fileReal)
    if (rel.startsWith('..') || path.isAbsolute(rel)) {
      nodeRes.statusCode = 403
      nodeRes.end()
      return
    }
    const buf = await fs.readFile(fileReal)
    nodeRes.setHeader('Content-Type', contentTypeForScreenshotFilename(filename))
    nodeRes.setHeader('Cache-Control', 'no-store')
    nodeRes.end(buf)
  } catch (e: unknown) {
    const err = e as NodeJS.ErrnoException
    nodeRes.statusCode = err.code === 'ENOENT' ? 404 : 500
    nodeRes.end()
  }
}

function contentTypeForScreenshotFilename(filename: string): string {
  const lower = filename.toLowerCase()
  if (lower.endsWith('.png')) return 'image/png'
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg'
  if (lower.endsWith('.webp')) return 'image/webp'
  return 'application/octet-stream'
}

/**
 * Dev-only HTTP helpers for the repo-root `datasource/` folder (e.g. `display.json`).
 * Not available in production static hosting.
 */
export function datasourceApiPlugin(): Plugin {
  const datasourceDir = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../datasource',
  )
  const screenshotsDir = path.join(datasourceDir, 'screenshots')
  const templatesDir = path.join(datasourceDir, TEMPLATES_SUBDIR)
  const placeholderDir = path.join(datasourceDir, 'placeholder')

  return {
    name: 'vite-plugin-datasource-api',
    configureServer(server) {
      server.watcher.add(datasourceDir)
      server.watcher.on('change', (file) => {
        const base = path.basename(file)
        if (base.startsWith('display_') && base.endsWith('.json')) {
          server.ws.send({ type: 'full-reload' })
        }
      })

      void (async () => {
        try {
          await fs.mkdir(datasourceDir, { recursive: true })
          await fs.mkdir(screenshotsDir, { recursive: true })
          await cleanupUnusedScreenshots(datasourceDir, screenshotsDir)
        } catch (e) {
          console.warn('[datasource-api] startup screenshot cleanup failed', e)
        }
      })()

      server.middlewares.use(async (req, res, next) => {
        const pathname = (req.url ?? '').split('?')[0]
        const nodeRes = res as ServerResponse

        try {
          await fs.mkdir(datasourceDir, { recursive: true })
          await fs.mkdir(screenshotsDir, { recursive: true })
          await fs.mkdir(templatesDir, { recursive: true })
          await fs.mkdir(placeholderDir, { recursive: true })
        } catch {
          /* ignore */
        }

        // GET /__api/datasource/placeholder/<file>
        if (req.method === 'GET' && pathname.startsWith(PLACEHOLDER_PREFIX)) {
          const filename = pathname.slice(PLACEHOLDER_PREFIX.length)
          await sendScreenshotFile(nodeRes, placeholderDir, filename)
          return
        }

        // GET /__api/datasource/screenshots/<file> or …/screenshots/<bucket>/<file>
        if (req.method === 'GET' && pathname.startsWith(SCREENSHOTS_PREFIX)) {
          const rest = pathname.slice(SCREENSHOTS_PREFIX.length)
          const segments = rest.split('/').filter(Boolean)
          if (segments.length === 1) {
            await sendScreenshotFile(nodeRes, screenshotsDir, segments[0]!)
            return
          }
          if (segments.length === 2) {
            const bucket = segments[0]!
            const filename = segments[1]!
            if (!isAllowedScreenshotBucket(bucket)) {
              nodeRes.statusCode = 404
              nodeRes.end()
              return
            }
            const bucketDir = path.join(screenshotsDir, bucket)
            await sendScreenshotFile(nodeRes, bucketDir, filename)
            return
          }
          nodeRes.statusCode = 404
          nodeRes.end()
          return
        }

        // POST /__api/datasource/screenshots
        if (req.method === 'POST' && pathname === '/__api/datasource/screenshots') {
          await handleScreenshotUpload(req, nodeRes, screenshotsDir, req.url)
          return
        }

        if (pathname === '/__api/screenshot-designer/session') {
          try {
            if (req.method !== 'GET') {
              nodeRes.statusCode = 405
              nodeRes.end('Method not allowed')
              return
            }
            const url = new URL(req.url ?? '/', 'http://vite.datasource')
            const canvasSize = url.searchParams.get('canvasSize') ?? undefined
            const presetId = url.searchParams.get('presetId') ?? undefined
            const sessionArtboard = url.searchParams.get('artboard') ?? undefined
            const cookieHeader = typeof req.headers.cookie === 'string' ? req.headers.cookie : undefined
            let cookieArtboard: string | undefined
            if (cookieHeader) {
              for (const part of cookieHeader.split(';')) {
                const idx = part.indexOf('=')
                if (idx === -1) continue
                if (part.slice(0, idx).trim() !== DESIGNER_ARTBOARD_COOKIE) continue
                let v = part.slice(idx + 1).trim()
                if (!v) break
                try {
                  v = decodeURIComponent(v)
                } catch {
                  /* keep raw */
                }
                cookieArtboard = v
                break
              }
            }
            let refererArtboard: string | undefined
            const ref = req.headers.referer
            if (typeof ref === 'string' && ref.length > 0) {
              try {
                refererArtboard = new URL(ref).searchParams.get('artboard') ?? undefined
              } catch {
                /* ignore malformed Referer */
              }
            }
            const session = getScreenshotDesignerSession(
              canvasSize,
              presetId,
              sessionArtboard,
              cookieArtboard,
              refererArtboard,
            )
            nodeRes.setHeader('Content-Type', 'application/json')
            nodeRes.end(JSON.stringify({ ok: true, ...session }))
          } catch (e: unknown) {
            const err = e as Error
            nodeRes.statusCode = 400
            nodeRes.setHeader('Content-Type', 'application/json')
            nodeRes.end(JSON.stringify({ error: String(err?.message ?? e) }))
          }
          return
        }

        if (pathname === '/__api/screenshot-designer/execute') {
          try {
            if (req.method !== 'POST') {
              nodeRes.statusCode = 405
              nodeRes.end('Method not allowed')
              return
            }
            const body = await readBody(req as IncomingMessage)
            const parsed = JSON.parse(body) as Record<string, unknown>
            const operation = String(parsed.operation ?? '')
            const args =
              typeof parsed.args === 'object' && parsed.args !== null
                ? (parsed.args as Record<string, unknown>)
                : {}
            const result = await screenshotDesignerExecuteOperation(
              path.dirname(fileURLToPath(import.meta.url)),
              operation,
              args,
            )
            nodeRes.setHeader('Content-Type', 'application/json')
            nodeRes.end(JSON.stringify(result))
          } catch (e: unknown) {
            const err = e as Error
            nodeRes.statusCode = 400
            nodeRes.setHeader('Content-Type', 'application/json')
            nodeRes.end(JSON.stringify({ error: String(err?.message ?? e) }))
          }
          return
        }

        if (pathname === '/__api/screenshot-designer/save-display') {
          try {
            if (req.method !== 'POST') {
              nodeRes.statusCode = 405
              nodeRes.end('Method not allowed')
              return
            }
            const body = await readBody(req as IncomingMessage)
            const parsed = JSON.parse(body) as Record<string, unknown>
            const presetId = typeof parsed.presetId === 'string' ? parsed.presetId : undefined
            const result = await saveDisplayDocument(datasourceDir, presetId)
            nodeRes.setHeader('Content-Type', 'application/json')
            nodeRes.end(JSON.stringify({ ok: true, ...result }))
          } catch (e: unknown) {
            const err = e as Error
            nodeRes.statusCode = 400
            nodeRes.setHeader('Content-Type', 'application/json')
            nodeRes.end(JSON.stringify({ error: String(err?.message ?? e) }))
          }
          return
        }

        if (pathname === '/__api/datasource/templates') {
          try {
            if (req.method === 'GET') {
              const u = new URL(req.url ?? '/', 'http://vite.datasource')
              const id = u.searchParams.get('id')
              if (id !== null && id !== '') {
                if (!SAFE_TEMPLATE_FILENAME.test(id)) {
                  nodeRes.statusCode = 400
                  nodeRes.setHeader('Content-Type', 'application/json')
                  nodeRes.end(JSON.stringify({ error: 'invalid_template_id' }))
                  return
                }
                const filePath = path.join(templatesDir, id)
                const text = await fs.readFile(filePath, 'utf8')
                nodeRes.setHeader('Content-Type', 'application/json')
                nodeRes.end(text)
                return
              }

              const names = await fs.readdir(templatesDir)
              const templates: { id: string; name: string; savedAt: string }[] = []
              for (const name of names) {
                if (!name.endsWith('.json') || !SAFE_TEMPLATE_FILENAME.test(name)) continue
                try {
                  const raw = JSON.parse(
                    await fs.readFile(path.join(templatesDir, name), 'utf8'),
                  ) as unknown
                  if (!isTemplatePayload(raw)) continue
                  templates.push({
                    id: name,
                    name: raw.templateName,
                    savedAt: raw.savedAt,
                  })
                } catch {
                  /* skip corrupt */
                }
              }
              templates.sort((a, b) => b.savedAt.localeCompare(a.savedAt))
              nodeRes.setHeader('Content-Type', 'application/json')
              nodeRes.end(JSON.stringify({ templates }))
              return
            }

            if (req.method === 'PUT') {
              const body = await readBody(req as IncomingMessage)
              const parsed: unknown = JSON.parse(body)
              if (!isRecord(parsed)) {
                nodeRes.statusCode = 400
                nodeRes.setHeader('Content-Type', 'application/json')
                nodeRes.end(JSON.stringify({ error: 'invalid_body' }))
                return
              }
              const nameIn = parsed.name
              const docIn = parsed.document
              if (typeof nameIn !== 'string' || nameIn.trim() === '') {
                nodeRes.statusCode = 400
                nodeRes.setHeader('Content-Type', 'application/json')
                nodeRes.end(JSON.stringify({ error: 'invalid_template_name' }))
                return
              }
              if (docIn === null || typeof docIn !== 'object') {
                nodeRes.statusCode = 400
                nodeRes.setHeader('Content-Type', 'application/json')
                nodeRes.end(JSON.stringify({ error: 'invalid_document' }))
                return
              }
              const docObj = docIn as Record<string, unknown>
              if (docObj.version !== 1 || !Array.isArray(docObj.fabricObjects)) {
                nodeRes.statusCode = 400
                nodeRes.setHeader('Content-Type', 'application/json')
                nodeRes.end(JSON.stringify({ error: 'invalid_display_document' }))
                return
              }
              const id = `${randomUUID()}.json`
              const savedAt = new Date().toISOString()
              const payload: TemplateFilePayload = {
                templateName: nameIn.trim().slice(0, 120),
                savedAt,
                document: docIn,
              }
              await fs.writeFile(
                path.join(templatesDir, id),
                JSON.stringify(payload, null, 2),
                'utf8',
              )
              nodeRes.setHeader('Content-Type', 'application/json')
              nodeRes.end(
                JSON.stringify({
                  ok: true,
                  id,
                  name: payload.templateName,
                  savedAt,
                }),
              )
              return
            }

            if (req.method === 'DELETE') {
              const u = new URL(req.url ?? '/', 'http://vite.datasource')
              const id = u.searchParams.get('id')
              if (id === null || id === '' || !SAFE_TEMPLATE_FILENAME.test(id)) {
                nodeRes.statusCode = 400
                nodeRes.setHeader('Content-Type', 'application/json')
                nodeRes.end(JSON.stringify({ error: 'invalid_template_id' }))
                return
              }
              const filePath = path.join(templatesDir, id)
              await fs.unlink(filePath)
              nodeRes.setHeader('Content-Type', 'application/json')
              nodeRes.end(JSON.stringify({ ok: true }))
              return
            }

            nodeRes.statusCode = 405
            nodeRes.end('Method not allowed')
          } catch (e: unknown) {
            const err = e as NodeJS.ErrnoException
            if (err.code === 'ENOENT') {
              nodeRes.statusCode = 404
              nodeRes.setHeader('Content-Type', 'application/json')
              nodeRes.end(JSON.stringify({ error: 'not_found' }))
              return
            }
            nodeRes.statusCode = 500
            nodeRes.setHeader('Content-Type', 'application/json')
            nodeRes.end(JSON.stringify({ error: String(err?.message ?? e) }))
          }
          return
        }

        if (
          pathname !== '/__api/datasource/display' &&
          pathname !== '/__api/datasource/list'
        ) {
          next()
          return
        }

        try {
          if (req.method === 'GET' && pathname === '/__api/datasource/list') {
            const names = await fs.readdir(datasourceDir)
            const files = names.filter((n) => n.endsWith('.json')).sort()
            nodeRes.setHeader('Content-Type', 'application/json')
            nodeRes.end(JSON.stringify({ files }))
            return
          }

          if (req.method === 'GET' && pathname === '/__api/datasource/display') {
            const resolved = resolveDisplayJsonFile(datasourceDir, req.url)
            if (!resolved.ok) {
              nodeRes.statusCode = resolved.status
              nodeRes.setHeader('Content-Type', 'application/json')
              nodeRes.end(resolved.body)
              return
            }
            const text = await fs.readFile(resolved.filePath, 'utf8')
            nodeRes.setHeader('Content-Type', 'application/json')
            nodeRes.end(text)
            return
          }

          if (req.method === 'PUT' && pathname === '/__api/datasource/display') {
            const resolved = resolveDisplayJsonFile(datasourceDir, req.url)
            if (!resolved.ok) {
              nodeRes.statusCode = resolved.status
              nodeRes.setHeader('Content-Type', 'application/json')
              nodeRes.end(resolved.body)
              return
            }
            const body = await readBody(req as IncomingMessage)
            JSON.parse(body)
            await fs.writeFile(resolved.filePath, body, 'utf8')
            nodeRes.setHeader('Content-Type', 'application/json')
            nodeRes.end(JSON.stringify({ ok: true }))
            return
          }

          nodeRes.statusCode = 405
          nodeRes.end('Method not allowed')
        } catch (e: unknown) {
          const err = e as NodeJS.ErrnoException
          if (err.code === 'ENOENT') {
            nodeRes.statusCode = 404
            nodeRes.setHeader('Content-Type', 'application/json')
            nodeRes.end(JSON.stringify({ error: 'not_found' }))
            return
          }
          nodeRes.statusCode = 500
          nodeRes.setHeader('Content-Type', 'application/json')
          nodeRes.end(JSON.stringify({ error: String(err?.message ?? e) }))
        }
      })
    },
  }
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body))
}

async function handleScreenshotUpload(
  req: IncomingMessage,
  res: ServerResponse,
  screenshotsDir: string,
  reqUrl: string | undefined,
): Promise<void> {
  const contentType = req.headers['content-type'] ?? ''
  if (!contentType.toLowerCase().startsWith('multipart/form-data')) {
    sendJson(res, 415, { error: 'expected_multipart' })
    return
  }

  let uploadBucket: string | null = null
  try {
    const u = new URL(reqUrl ?? '/', 'http://vite.datasource')
    const b = u.searchParams.get('bucket')
    if (b !== null && b !== '') {
      if (!isAllowedScreenshotBucket(b)) {
        sendJson(res, 400, { error: 'invalid_bucket' })
        return
      }
      uploadBucket = b
    }
  } catch {
    /* ignore malformed URL */
  }

  const targetDir =
    uploadBucket !== null ? path.join(screenshotsDir, uploadBucket) : screenshotsDir
  await fs.mkdir(targetDir, { recursive: true })

  let fileHandled = false
  let savePromise: Promise<void> = Promise.resolve()
  let clientError: string | null = null
  let savedUrl: string | null = null

  const bb = busboy({
    headers: req.headers,
    limits: { files: 2, fileSize: 30 * 1024 * 1024 },
  })

  bb.on('file', (name, file, info) => {
    if (name !== 'file') {
      file.resume()
      return
    }
    if (fileHandled) {
      file.resume()
      return
    }
    fileHandled = true

    const mime = info.mimeType.split(';')[0]?.trim().toLowerCase() ?? ''
    const ext = ALLOWED_MIME_EXT[mime]
    if (!ext) {
      file.resume()
      clientError = clientError ?? 'unsupported_type'
      return
    }

    savePromise = new Promise<void>((resolveSave) => {
      const chunks: Buffer[] = []
      let limitHit = false
      file.on('data', (c: Buffer) => {
        chunks.push(Buffer.from(c))
      })
      file.on('limit', () => {
        limitHit = true
      })
      file.on('end', async () => {
        try {
          if (limitHit) {
            clientError = clientError ?? 'file_too_large'
            resolveSave()
            return
          }
          if (clientError && clientError !== 'unsupported_type') {
            resolveSave()
            return
          }
          const filename = `${randomUUID()}${ext}`
          await fs.writeFile(path.join(targetDir, filename), Buffer.concat(chunks))
          savedUrl =
            uploadBucket !== null
              ? `${SCREENSHOTS_PREFIX}${uploadBucket}/${filename}`
              : `${SCREENSHOTS_PREFIX}${filename}`
        } catch {
          clientError = clientError ?? 'write_failed'
        }
        resolveSave()
      })
    })
  })

  bb.on('error', () => {
    clientError = clientError ?? 'parse_error'
  })

  bb.on('close', async () => {
    await savePromise
    if (savedUrl) {
      sendJson(res, 200, { url: savedUrl })
      return
    }
    const err =
      clientError ??
      (fileHandled ? 'empty_or_invalid' : 'no_file')
    sendJson(res, 400, { error: err })
  })

  req.pipe(bb)
}
