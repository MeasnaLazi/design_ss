/**
 * Import verification harness: proves whether the canvas matches the strip.
 *
 * For each panel it collects:
 *   1. the strip's headless render        → verify/strip_panel<N>.png
 *   2. the live canvas's preview crop     → verify/canvas_panel<N>.png
 *   3. layer geometry diff (strip HTML model vs canvas snapshot)
 * and writes verify/report.json + verify/compare.html (side-by-side).
 *
 * Run AFTER an import, with the dev server up and the designer tab open:
 *   node composer/verify-import.mjs --strip <file.html> [--preset ...] [--api ...]
 */
import http from 'node:http'
import crypto from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '..')
const MIME = {
  '.html': 'text/html; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
}

function parseArgs(argv) {
  const a = { preset: 'appstore_iphone_portrait', api: 'http://localhost:4713', out: 'output/strips/verify' }
  for (let i = 2; i < argv.length; i++) {
    const f = argv[i]
    if (f === '--strip') a.strip = argv[++i]
    else if (f === '--preset') a.preset = argv[++i]
    else if (f === '--api') a.api = argv[++i]
    else if (f === '--out') a.out = argv[++i]
    else throw new Error(`unknown flag: ${f}`)
  }
  if (!a.strip) throw new Error('--strip <file.html> is required')
  return a
}

function startStaticServer(root) {
  const server = http.createServer(async (req, res) => {
    try {
      let urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname)
      if (urlPath.startsWith('/__api/datasource/')) urlPath = urlPath.replace('/__api/datasource/', '/datasource/')
      const p = path.normalize(path.join(root, urlPath))
      if (!p.startsWith(root)) { res.writeHead(403).end(); return }
      const data = await fs.readFile(p)
      res.writeHead(200, { 'Content-Type': MIME[path.extname(p).toLowerCase()] ?? 'application/octet-stream' })
      res.end(data)
    } catch { res.writeHead(404).end() }
  })
  return new Promise((r) => server.listen(0, '127.0.0.1', () => r({ server, port: server.address().port })))
}

const base = (api) => `${api.replace(/\/$/, '')}/__api/screenshot-designer`

async function apiJson(url, init) {
  const res = await fetch(url, init)
  const text = await res.text()
  let body; try { body = text ? JSON.parse(text) : {} } catch { body = { raw: text } }
  if (!res.ok) throw new Error(`${init?.method ?? 'GET'} ${url} → ${res.status} ${body?.error ?? res.statusText}`)
  return body
}

async function enqueue(api, preset, operation, args) {
  const out = await apiJson(`${base(api)}/enqueue-command?artboard=${encodeURIComponent(preset)}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ operation, args }),
  })
  await new Promise((r) => setTimeout(r, 300))
  return out
}

async function pullPreviewChanged(api, prevHash, timeoutMs = 15000) {
  const t0 = Date.now()
  while (Date.now() - t0 < timeoutMs) {
    const res = await fetch(`${base(api)}/agent-preview`)
    if (res.ok) {
      const buf = Buffer.from(await res.arrayBuffer())
      const hash = crypto.createHash('sha1').update(buf).digest('hex')
      if (hash !== prevHash) return { buf, hash }
    }
    await new Promise((r) => setTimeout(r, 300))
  }
  throw new Error('timed out waiting for canvas preview')
}

async function pullSnapshot(api) {
  return apiJson(`${base(api)}/agent-preview-data`)
}

const norm = (s) => String(s ?? '').replace(/\s+/g, ' ').trim().toLowerCase()

async function main() {
  const args = parseArgs(process.argv)
  const outDir = path.resolve(REPO_ROOT, args.out)
  await fs.mkdir(outDir, { recursive: true })
  const stripAbs = path.isAbsolute(args.strip) ? args.strip : path.resolve(REPO_ROOT, args.strip)
  const rel = path.relative(REPO_ROOT, stripAbs)

  // ---- 1. strip side: headless render + model --------------------------------
  const { server, port } = await startStaticServer(REPO_ROOT)
  const browser = await chromium.launch()
  let model
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1200 } })
    await page.goto(`http://127.0.0.1:${port}/${rel.split(path.sep).join('/')}`, { waitUntil: 'load' })
    await page.waitForFunction(
      () => (typeof window.__composerReady === 'undefined' ? document.readyState === 'complete' : window.__composerReady === true),
      undefined, { timeout: 30000 },
    )
    const size = await page.evaluate(() => ({
      w: Math.ceil(document.documentElement.scrollWidth), h: Math.ceil(document.documentElement.scrollHeight),
    }))
    await page.setViewportSize({ width: Math.min(size.w, 20000), height: Math.min(size.h, 20000) })

    model = await page.evaluate(() => {
      const out = []
      document.querySelectorAll('[data-panel]').forEach((panelEl, pi) => {
        const pr = panelEl.getBoundingClientRect()
        const layers = []
        for (const el of panelEl.querySelectorAll('[data-layer]')) {
          const kind = el.getAttribute('data-layer')
          const r = el.getBoundingClientRect()
          const b = { x: Math.round(r.left - pr.left), y: Math.round(r.top - pr.top), w: Math.round(r.width), h: Math.round(r.height) }
          if (kind === 'text') {
            const clone = el.cloneNode(true)
            for (const br of clone.querySelectorAll('br')) br.replaceWith('\n')
            layers.push({ kind: 'text', content: (clone.textContent ?? '').trim(), size: Number.parseFloat(getComputedStyle(el).fontSize), ...b })
          } else if (kind === 'device' || el.hasAttribute('data-device')) {
            layers.push({ kind: 'device', pose: el.dataset.pose ?? '', ...b })
          } else {
            layers.push({ kind: kind === 'image' ? 'image' : 'decor', ...b })
          }
        }
        out.push({ panel_index: pi, width: Math.round(pr.width), height: Math.round(pr.height), layers })
      })
      return out
    })

    const panels = await page.locator('[data-panel]').all()
    for (let i = 0; i < panels.length; i++) {
      await panels[i].screenshot({ path: path.join(outDir, `strip_panel${i}.png`) })
    }
  } finally {
    await browser.close()
    server.close()
  }

  // ---- 2. canvas side: previews + snapshot ------------------------------------
  await apiJson(`${base(args.api)}/session`)
  await enqueue(args.api, args.preset, 'capture_panel_preview_data', { panel_indexes: model.map((p) => p.panel_index) })
  await new Promise((r) => setTimeout(r, 800))
  const snap = await pullSnapshot(args.api)

  let hash = null
  for (const p of model) {
    await enqueue(args.api, args.preset, 'render_panel_preview', { panel_index: p.panel_index, preview_multiplier: 1 })
    const got = await pullPreviewChanged(args.api, hash)
    hash = got.hash
    await fs.writeFile(path.join(outDir, `canvas_panel${p.panel_index}.png`), got.buf)
  }

  // ---- 3. diff ------------------------------------------------------------------
  const diffs = []
  for (const p of model) {
    const sp = (snap.panels ?? []).find((x) => x.panel_index === p.panel_index)
    const canvasLayers = sp?.layers ?? []
    const usedIds = new Set()
    for (const want of p.layers) {
      if (want.kind === 'text') {
        const match = canvasLayers.find((l) => l.kind === 'text' && !usedIds.has(l.layer_id) && norm(l.content) === norm(want.content))
          ?? canvasLayers.find((l) => l.kind === 'text' && !usedIds.has(l.layer_id) && norm(l.content).startsWith(norm(want.content).slice(0, 12)))
        if (!match) { diffs.push({ panel: p.panel_index, kind: 'text', content: want.content.slice(0, 30), status: 'MISSING_ON_CANVAS' }); continue }
        usedIds.add(match.layer_id)
        diffs.push({
          panel: p.panel_index, kind: 'text', content: want.content.slice(0, 30), layer_id: match.layer_id,
          dx: Math.round(match.x - want.x), dy: Math.round(match.y - want.y),
          dw: Math.round(match.width - want.w), dh: Math.round(match.height - want.h),
          size: { want: Math.round(want.size), got: Math.round(match.size) },
          content_exact: norm(match.content) === norm(want.content),
        })
      } else if (want.kind === 'device') {
        const match = canvasLayers.find((l) => l.kind === 'device' && !usedIds.has(l.layer_id) && (l.frame === want.pose || !l.frame))
        if (!match) { diffs.push({ panel: p.panel_index, kind: 'device', pose: want.pose, status: 'MISSING_ON_CANVAS' }); continue }
        usedIds.add(match.layer_id)
        // snapshot device x/y = center; model x/y = top-left box
        diffs.push({
          panel: p.panel_index, kind: 'device', pose: want.pose, layer_id: match.layer_id,
          dx: Math.round(match.x - (want.x + want.w / 2)), dy: Math.round(match.y - (want.y + want.h / 2)),
          dw: Math.round(match.width - want.w), dh: Math.round(match.height - want.h),
        })
      }
    }
    const extraTexts = canvasLayers.filter((l) => l.kind === 'text' && !usedIds.has(l.layer_id))
    const extraDevices = canvasLayers.filter((l) => l.kind === 'device' && !usedIds.has(l.layer_id))
    for (const e of extraTexts) diffs.push({ panel: p.panel_index, kind: 'text', layer_id: e.layer_id, content: String(e.content).slice(0, 30), status: 'EXTRA_ON_CANVAS (duplicate/stale?)' })
    for (const e of extraDevices) diffs.push({ panel: p.panel_index, kind: 'device', layer_id: e.layer_id, frame: e.frame, status: 'EXTRA_ON_CANVAS (duplicate/stale?)' })
  }

  const html = [
    '<!doctype html><meta charset="utf-8"><style>body{background:#222;color:#eee;font-family:sans-serif}img{width:320px;border:1px solid #555;margin:4px}</style>',
    ...model.map((p) => `<h3>panel ${p.panel_index} — strip vs canvas</h3><img src="strip_panel${p.panel_index}.png"><img src="canvas_panel${p.panel_index}.png">`),
  ].join('\n')
  await fs.writeFile(path.join(outDir, 'compare.html'), html)

  const report = { ok: true, out: outDir, snapshotPanels: (snap.panels ?? []).length, diffs }
  await fs.writeFile(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report, null, 2))
}

main().catch((err) => {
  console.error(JSON.stringify({ ok: false, error: String(err?.message ?? err) }))
  process.exit(1)
})
