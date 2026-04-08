import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin } from 'vite'

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (c) => chunks.push(Buffer.from(c)))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
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

  return {
    name: 'vite-plugin-datasource-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const pathname = (req.url ?? '').split('?')[0]
        if (
          pathname !== '/__api/datasource/display' &&
          pathname !== '/__api/datasource/list'
        ) {
          next()
          return
        }

        const nodeRes = res as ServerResponse

        try {
          await fs.mkdir(datasourceDir, { recursive: true })
        } catch {
          /* ignore */
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
