import { randomUUID } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin } from 'vite'
import busboy from 'busboy'

import { ARTBOARD_PRESET_IDS, isDisplayFileSlug } from './src/constants/artboardPresets'

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (c) => chunks.push(Buffer.from(c)))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

const SCREENSHOTS_PREFIX = '/__api/datasource/screenshots/'
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

  return {
    name: 'vite-plugin-datasource-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const pathname = (req.url ?? '').split('?')[0]
        const nodeRes = res as ServerResponse

        try {
          await fs.mkdir(datasourceDir, { recursive: true })
          await fs.mkdir(screenshotsDir, { recursive: true })
        } catch {
          /* ignore */
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
