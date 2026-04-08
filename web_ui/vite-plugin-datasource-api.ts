import { randomUUID } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin } from 'vite'
import busboy from 'busboy'

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

        // GET /__api/datasource/screenshots/<filename>
        if (req.method === 'GET' && pathname.startsWith(SCREENSHOTS_PREFIX)) {
          const filename = pathname.slice(SCREENSHOTS_PREFIX.length)
          if (!filename || filename.includes('/') || filename.includes('\\')) {
            nodeRes.statusCode = 404
            nodeRes.end()
            return
          }
          if (!SAFE_SCREENSHOT_FILENAME.test(filename)) {
            nodeRes.statusCode = 400
            nodeRes.end()
            return
          }
          try {
            const baseReal = await fs.realpath(screenshotsDir)
            const candidate = path.resolve(screenshotsDir, filename)
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
          return
        }

        // POST /__api/datasource/screenshots
        if (req.method === 'POST' && pathname === '/__api/datasource/screenshots') {
          await handleScreenshotUpload(req, nodeRes, screenshotsDir)
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
            const text = await fs.readFile(
              path.join(datasourceDir, 'display.json'),
              'utf8',
            )
            nodeRes.setHeader('Content-Type', 'application/json')
            nodeRes.end(text)
            return
          }

          if (req.method === 'PUT' && pathname === '/__api/datasource/display') {
            const body = await readBody(req as IncomingMessage)
            JSON.parse(body)
            await fs.writeFile(
              path.join(datasourceDir, 'display.json'),
              body,
              'utf8',
            )
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
): Promise<void> {
  const contentType = req.headers['content-type'] ?? ''
  if (!contentType.toLowerCase().startsWith('multipart/form-data')) {
    sendJson(res, 415, { error: 'expected_multipart' })
    return
  }

  await fs.mkdir(screenshotsDir, { recursive: true })

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
          await fs.writeFile(path.join(screenshotsDir, filename), Buffer.concat(chunks))
          savedUrl = `${SCREENSHOTS_PREFIX}${filename}`
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
