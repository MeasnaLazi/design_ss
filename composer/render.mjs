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
 * so strip HTML can reference /composer/** (device frames, the runtime) and
 * /datasource/** (screenshots).
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
      // Device frames moved from web_ui/public/ to composer/. Strips authored
      // before the move hardcode `framesRoot: '/web_ui/public'`, and many of
      // them live in gitignored output/ where a bad rewrite is unrecoverable —
      // so the old prefix is aliased rather than the files being rewritten.
      if (urlPath.startsWith('/web_ui/public/device-frames/')) {
        urlPath = urlPath.replace('/web_ui/public/device-frames/', '/composer/device-frames/')
      }
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

    // Emit strip-data.json: measured layout for every block, plus the problems
    // that only a laid-out page can reveal.
    //
    // Scope is deliberately narrow. Anything the *static* checker can see —
    // dead asset paths, a device given a height, a text block full of markup —
    // belongs in composer/check-schema.mjs, which needs no browser. Anything
    // that makes a device fail to build is already fatal above, at
    // __composerErrors. What is left, and what this is for, is geometry: where
    // blocks actually landed once the browser had its say, and whether any of
    // them fell off the panel.
    //
    // Coordinates are panel-relative and **top-left**, matching the CSS the
    // editor writes and the schema documents. (v1 stored device x/y as the
    // block centre, a canvas convention whose only consumer was the importer.)
    const snapshot = await page.evaluate((panelSelector) => {
      const toHex = (rgb) => {
        const m = rgb.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/)
        if (!m) return '#000000'
        return '#' + [m[1], m[2], m[3]].map((v) => Number(v).toString(16).padStart(2, '0')).join('')
      }
      const round = (n) => Math.round(n * 10) / 10
      const problems = []
      const flag = (severity, panel, layer, message) => problems.push({ severity, panel, layer, message })

      const panels = []
      const panelEls = [...document.querySelectorAll(panelSelector)]
      panelEls.forEach((panelEl, pi) => {
        const pr = panelEl.getBoundingClientRect()
        const layers = []
        let n = 0

        for (const el of panelEl.querySelectorAll('[data-layer], [data-device]')) {
          const kind = el.getAttribute('data-layer') ?? (el.hasAttribute('data-device') ? 'device' : 'unknown')
          const r = el.getBoundingClientRect()
          const cs = getComputedStyle(el)
          const zRaw = Number.parseInt(cs.zIndex, 10)
          const z = Number.isFinite(zRaw) ? zRaw : n
          n += 1
          const id = el.dataset.layerId ?? `${kind}_${pi}_${n}`

          // How far the block sits beyond each panel edge. Zero means inside.
          // Overhang is legitimate — cropping a device at a panel edge is the
          // standard pattern — so this is reported as measurement, and only
          // becomes a problem below for the kinds where it means damage.
          const outside = {
            left: round(Math.max(0, pr.left - r.left)),
            top: round(Math.max(0, pr.top - r.top)),
            right: round(Math.max(0, r.right - pr.right)),
            bottom: round(Math.max(0, r.bottom - pr.bottom)),
          }

          const layer = {
            id,
            kind,
            z,
            x: round(r.left - pr.left),
            y: round(r.top - pr.top),
            width: round(r.width),
            height: round(r.height),
            outside,
          }

          // Entirely past an edge: it contributes nothing to the export, and
          // that is almost never deliberate.
          if (r.right <= pr.left || r.left >= pr.right || r.bottom <= pr.top || r.top >= pr.bottom) {
            flag('warning', pi, id, 'lies entirely outside its panel and will not appear in the export')
          }

          if (kind === 'text') {
            const clone = el.cloneNode(true)
            for (const br of clone.querySelectorAll('br')) br.replaceWith('\n')
            const content = (clone.textContent ?? '')
              .split('\n').map((s) => s.replace(/\s+/g, ' ').trim()).join('\n').trim()
            layer.text = content
            layer.role = el.dataset.role ?? null
            layer.font_size = Number.parseFloat(cs.fontSize) || 0
            layer.font_family = cs.fontFamily
            layer.color = toHex(cs.color)
            layer.align = cs.textAlign === 'start' ? 'left' : cs.textAlign === 'end' ? 'right' : cs.textAlign
            layer.weight = String(cs.fontWeight)

            if (!content) flag('warning', pi, id, 'text block is empty')
            // Clipped copy is the one overhang that is nearly always a mistake:
            // a device cropped at the edge reads as design, half a word does not.
            const cut = Object.entries(outside).filter(([, v]) => v > 1)
            if (cut.length) {
              const where = cut.map(([edge, v]) => `${v}px past the ${edge}`).join(', ')
              flag('warning', pi, id, `text is clipped by the panel edge (${where})`)
            }
          } else if (kind === 'device') {
            layer.pack = el.dataset.pack ?? null
            layer.pose = el.dataset.pose ?? null
            layer.screenshot = el.dataset.screenshot ?? null
            layer.fit = el.dataset.fit ?? 'cover'
            layer.screen_fallback = el.dataset.screenFallback ?? null
            // A device that reached here built successfully — a failure would
            // have stopped the render at __composerErrors.
            layer.blank_screen = !el.dataset.screenshot
          } else if (kind === 'image') {
            layer.src = el.getAttribute('src')
            layer.natural_width = el.naturalWidth ?? 0
            layer.natural_height = el.naturalHeight ?? 0
            // Unlike a device screenshot, a plain <img> that 404s fails
            // silently: no runtime is involved, so nothing throws and the
            // export simply has a hole in it.
            if (!layer.natural_width) {
              flag('error', pi, id, `image did not load: ${layer.src ?? '(no src)'}`)
            }
            if ((layer.src ?? '').includes('placeholder.svg')) {
              flag('warning', pi, id, 'image is still the editor placeholder')
            }
          } else if (kind === 'decor') {
            layer.children = el.childElementCount
          }

          layers.push(layer)
        }

        layers.sort((a, b) => a.z - b.z)
        panels.push({
          index: pi,
          width: Math.round(pr.width),
          height: Math.round(pr.height),
          layers,
        })
      })

      const strip = document.querySelector('.strip')
      return {
        version: 2,
        strip: {
          width: Math.ceil(document.documentElement.scrollWidth),
          height: Math.ceil(document.documentElement.scrollHeight),
          gap: strip ? Number.parseFloat(getComputedStyle(strip).columnGap) || 0 : 0,
          panels: panelEls.length,
        },
        panels,
        problems,
      }
    }, args.panelSelector)
    const dataFile = path.join(outDir, 'strip-data.json')
    await fs.writeFile(dataFile, JSON.stringify(snapshot, null, 2))

    // Problems ride in the summary as well as the file. An agent reads stdout;
    // making it open strip-data.json to discover that a panel is broken is one
    // indirection too many, and the one most likely to be skipped.
    console.log(JSON.stringify({
      ok: true,
      panels: results,
      strip: stripFile,
      panelData: dataFile,
      document: size,
      problems: snapshot.problems,
    }, null, 2))
  } finally {
    await browser.close()
    server.close()
  }
}

main().catch((err) => {
  console.error(JSON.stringify({ ok: false, error: String(err.message ?? err) }))
  process.exit(1)
})
