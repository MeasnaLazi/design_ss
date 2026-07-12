/**
 * Composer render CLI: strip HTML → export-size PNGs via headless Chromium.
 *
 * Usage (from repo root or composer/):
 *   node composer/render.mjs --strip output/strips/appstore_strip.html --out output/strips/rendered
 *
 * Flags:
 *   --strip <path>            strip HTML file (relative to repo root or absolute)  [required]
 *   --out <dir>               output directory (default: output/strips/rendered)
 *   --panel-selector <sel>    panel elements to screenshot (default: [data-panel])
 *   --full                    also save the whole strip as strip.png
 *   --scale <n>               deviceScaleFactor (default 1 — panels are authored at export size)
 *   --timeout <ms>            ready-wait timeout (default 30000)
 *
 * The page is served over a local static file server rooted at the repo root,
 * so strip HTML can reference /web_ui/public/**, /datasource/**, /composer/**.
 * Waits for window.__composerReady (set by device-frames.mjs) when the page
 * uses composer runtime; otherwise waits for load + fonts.
 */
import http from 'node:http'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '..')

const MIME = {
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

function parseArgs(argv) {
  const args = { out: 'output/strips/rendered', panelSelector: '[data-panel]', scale: 1, timeout: 30000, full: false }
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--strip') args.strip = argv[++i]
    else if (a === '--out') args.out = argv[++i]
    else if (a === '--panel-selector') args.panelSelector = argv[++i]
    else if (a === '--full') args.full = true
    else if (a === '--scale') args.scale = Number(argv[++i])
    else if (a === '--timeout') args.timeout = Number(argv[++i])
    else throw new Error(`unknown flag: ${a}`)
  }
  if (!args.strip) throw new Error('--strip <file.html> is required')
  return args
}

function startStaticServer(root) {
  const server = http.createServer(async (req, res) => {
    try {
      let urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname)
      // Alias the dev-server datasource API route to the repo folder so strip
      // HTML works with either /datasource/... or /__api/datasource/... URLs.
      if (urlPath.startsWith('/__api/datasource/')) urlPath = urlPath.replace('/__api/datasource/', '/datasource/')
      const filePath = path.normalize(path.join(root, urlPath))
      if (!filePath.startsWith(root)) { res.writeHead(403).end(); return }
      const data = await fs.readFile(filePath)
      res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream' })
      res.end(data)
    } catch {
      res.writeHead(404).end('not found')
    }
  })
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }))
  })
}

async function main() {
  const args = parseArgs(process.argv)
  const stripAbs = path.isAbsolute(args.strip) ? args.strip : path.resolve(REPO_ROOT, args.strip)
  const rel = path.relative(REPO_ROOT, stripAbs)
  if (rel.startsWith('..')) throw new Error(`strip must live inside the repo root (${REPO_ROOT})`)
  const outDir = path.isAbsolute(args.out) ? args.out : path.resolve(REPO_ROOT, args.out)
  await fs.mkdir(outDir, { recursive: true })

  const { server, port } = await startStaticServer(REPO_ROOT)
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1200 }, deviceScaleFactor: args.scale })
    page.on('console', (msg) => { if (msg.type() === 'error') console.error('[page]', msg.text()) })
    page.on('pageerror', (err) => console.error('[page]', err.message))

    await page.goto(`http://127.0.0.1:${port}/${rel.split(path.sep).join('/')}`, { waitUntil: 'load' })

    // Wait for composer runtime (if present) and fonts.
    await page.waitForFunction(
      () => (typeof window.__composerReady === 'undefined' ? document.readyState === 'complete' : window.__composerReady === true),
      undefined,
      { timeout: args.timeout },
    )
    await page.evaluate(() => document.fonts.ready)

    const errors = await page.evaluate(() => window.__composerErrors ?? [])
    if (errors.length) {
      console.error(JSON.stringify({ ok: false, errors }, null, 2))
      process.exitCode = 1
      return
    }

    // Size viewport to full document so nothing is virtualized/clipped.
    const size = await page.evaluate(() => ({
      w: Math.ceil(Math.max(document.documentElement.scrollWidth, document.body.scrollWidth)),
      h: Math.ceil(Math.max(document.documentElement.scrollHeight, document.body.scrollHeight)),
    }))
    await page.setViewportSize({ width: Math.min(size.w, 20000), height: Math.min(size.h, 20000) })

    const panels = await page.locator(args.panelSelector).all()
    const results = []
    for (let i = 0; i < panels.length; i++) {
      const el = panels[i]
      const name = (await el.getAttribute('data-panel')) || String(i)
      const file = path.join(outDir, `panel${name}.png`)
      await el.screenshot({ path: file })
      const box = await el.boundingBox()
      results.push({ panel: name, file, width: Math.round(box?.width ?? 0) * args.scale, height: Math.round(box?.height ?? 0) * args.scale })
    }

    let stripFile = null
    if (args.full) {
      stripFile = path.join(outDir, 'strip.png')
      await page.screenshot({ path: stripFile, fullPage: true })
    }

    // Emit an AgentPanelPreviewData v1 snapshot (same shape as the canvas's
    // capture_panel_preview_data) so composer strips can run
    // `designer.py validate-rules --tier safety` unchanged.
    const snapshot = await page.evaluate((panelSelector) => {
      const toHex = (rgb) => {
        const m = rgb.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/)
        if (!m) return '#000000'
        return '#' + [m[1], m[2], m[3]].map((v) => Number(v).toString(16).padStart(2, '0')).join('')
      }
      const panels = []
      const panelEls = [...document.querySelectorAll(panelSelector)]
      panelEls.forEach((panelEl, pi) => {
        const pr = panelEl.getBoundingClientRect()
        const layers = []
        let n = 0
        for (const el of panelEl.querySelectorAll('[data-layer]')) {
          const kind = el.getAttribute('data-layer')
          const r = el.getBoundingClientRect()
          const cs = getComputedStyle(el)
          const zRaw = Number.parseInt(cs.zIndex, 10)
          const z = Number.isFinite(zRaw) ? zRaw : n
          n += 1
          if (kind === 'text') {
            const align = cs.textAlign === 'start' ? 'left' : cs.textAlign === 'end' ? 'right' : cs.textAlign
            const clone = el.cloneNode(true)
            for (const br of clone.querySelectorAll('br')) br.replaceWith('\n')
            const content = (clone.textContent ?? '')
              .split('\n').map((s) => s.replace(/\s+/g, ' ').trim()).join('\n').trim()
            layers.push({
              layer_id: el.dataset.layerId ?? `text_${pi}_${n}`,
              kind: 'text', z_index: z,
              content,
              size: Number.parseFloat(cs.fontSize) || 0,
              color: toHex(cs.color),
              align, weight: String(cs.fontWeight),
              x: r.left - pr.left, y: r.top - pr.top,
              width: r.width, height: r.height,
            })
          } else if (kind === 'device' || el.hasAttribute('data-device')) {
            layers.push({
              layer_id: el.dataset.layerId ?? `device_${pi}_${n}`,
              kind: 'device', z_index: z,
              x: r.left - pr.left + r.width / 2,   // snapshot convention: center
              y: r.top - pr.top + r.height / 2,
              width: r.width, height: r.height,
              angle: 0,
              frame: el.dataset.pose ?? '',
              pack_id: el.dataset.pack ?? '',
            })
          }
          // image / decor blocks are invisible to the rules validator.
        }
        layers.sort((a, b) => a.z_index - b.z_index)
        panels.push({
          panel_index: pi,
          panel_width: Math.round(pr.width), panel_height: Math.round(pr.height),
          panel_x: Math.round(pr.left), panel_y: Math.round(pr.top),
          layers,
        })
      })
      let gap = 0
      const strip = document.querySelector('.strip')
      if (strip) gap = Number.parseFloat(getComputedStyle(strip).columnGap) || 0
      return {
        version: 1, gap,
        workspace_width: Math.ceil(document.documentElement.scrollWidth),
        workspace_height: Math.ceil(document.documentElement.scrollHeight),
        panels,
      }
    }, args.panelSelector)
    const dataFile = path.join(outDir, 'strip-data.json')
    await fs.writeFile(dataFile, JSON.stringify(snapshot, null, 2))

    console.log(JSON.stringify({ ok: true, panels: results, strip: stripFile, panelData: dataFile, document: size }, null, 2))
  } finally {
    await browser.close()
    server.close()
  }
}

main().catch((err) => {
  console.error(JSON.stringify({ ok: false, error: String(err.message ?? err) }))
  process.exit(1)
})
