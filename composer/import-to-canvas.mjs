/**
 * Import a composer strip (HTML) into the live Fabric canvas as native,
 * editable layers — the Phase 4c handoff artifact (docs/implementation-plan.md).
 *
 * Strategy: op-sequence replay. The strip is rendered headlessly to measure
 * geometry and rasterize non-native visuals, then rebuilt in the open Web UI
 * tab through the standard agent ops (`set_background`, `add_image`,
 * `add_text`, `add_device_frame`, `apply_screenshot_to_device`, …). The UI's
 * auto-save then persists `datasource/display_<slug>.json`.
 *
 * Fidelity:
 * - text  → native textboxes (preset by data-role, exact size/color/weight/align/position)
 * - device→ native device groups + real screenshot baked into the screen
 * - panel backgrounds and decor blocks → rasterized PNGs uploaded to
 *   datasource and imported as image layers (backgrounds full-panel at z 0)
 * - creation order = z-order (bottom → top); device drop-shadows live in the
 *   background raster, not on the device layer
 *
 * Requirements: web_ui dev server running, a designer tab open on the target
 * artboard (SSE subscriber), composer deps installed.
 *
 * Usage:
 *   node composer/import-to-canvas.mjs --strip output/strips/appstore_strip.html \
 *     [--preset appstore_iphone_portrait] [--api http://localhost:4713] [--end-mode human]
 */
import http from 'node:http'
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
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.otf': 'font/otf',
}

const ROLE_TO_PRESET = { title: 'title1', subtitle: 'headline', caption: 'callout' }

function parseArgs(argv) {
  const a = { preset: 'appstore_iphone_portrait', api: 'http://localhost:4713', endMode: 'human', rasterCropped: false }
  for (let i = 2; i < argv.length; i++) {
    const f = argv[i]
    if (f === '--strip') a.strip = argv[++i]
    else if (f === '--preset') a.preset = argv[++i]
    else if (f === '--api') a.api = argv[++i]
    else if (f === '--end-mode') a.endMode = argv[++i]
    else if (f === '--raster-cropped-devices') a.rasterCropped = true
    else if (f === '--no-fresh') a.noFresh = true
    else throw new Error(`unknown flag: ${f}`)
  }
  if (!a.strip) throw new Error('--strip <file.html> is required')
  if (!['human', 'agent'].includes(a.endMode)) throw new Error('--end-mode must be human|agent')
  return a
}

function startStaticServer(root) {
  const server = http.createServer(async (req, res) => {
    try {
      let urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname)
      if (urlPath.startsWith('/__api/datasource/')) urlPath = urlPath.replace('/__api/datasource/', '/datasource/')
      const filePath = path.normalize(path.join(root, urlPath))
      if (!filePath.startsWith(root)) { res.writeHead(403).end(); return }
      const data = await fs.readFile(filePath)
      res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream' })
      res.end(data)
    } catch { res.writeHead(404).end() }
  })
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port })))
}

// --- designer API helpers --------------------------------------------------

function designerBase(api) { return `${api.replace(/\/$/, '')}/__api/screenshot-designer` }

async function apiJson(url, init) {
  const res = await fetch(url, init)
  const text = await res.text()
  let body
  try { body = text ? JSON.parse(text) : {} } catch { body = { raw: text } }
  if (!res.ok) {
    const msg = body?.error ?? body?.message ?? res.statusText
    throw new Error(`${init?.method ?? 'GET'} ${url} → ${res.status} ${msg}`)
  }
  return body
}

async function setMode(api, mode) {
  return apiJson(`${designerBase(api)}/mode`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode, holder: 'composer-import' }),
  })
}

function makeEnqueuer(api, preset) {
  const url = `${designerBase(api)}/enqueue-command?artboard=${encodeURIComponent(preset)}`
  return async (operation, args) => {
    const out = await apiJson(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ operation, args }),
    })
    // Small settle delay: ops apply asynchronously in the browser tab.
    await new Promise((r) => setTimeout(r, 250))
    return out
  }
}

/** Enqueue capture_panel_preview_data and poll until a fresh snapshot lands.
 * Freshness = new capturedAt (every capture stamps one); layer ids/positions
 * alone are NOT a freshness signal (a reconcile move keeps ids identical). */
function makeSnapshotter(api, preset, enqueue, panelCount) {
  let lastStamp = null
  return async () => {
    await enqueue('capture_panel_preview_data', { panel_indexes: [...Array(panelCount).keys()] })
    const url = `${designerBase(api)}/agent-preview-data`
    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 250))
      try {
        const snap = await apiJson(url)
        const stamp = snap.capturedAt ?? JSON.stringify(snap.panels)
        if (stamp !== lastStamp) { lastStamp = stamp; return snap }
      } catch { /* not ready yet */ }
    }
    throw new Error('timed out waiting for fresh panel snapshot')
  }
}

async function uploadPng(api, preset, buffer, name) {
  const fd = new FormData()
  fd.append('file', new Blob([buffer], { type: 'image/png' }), name)
  const out = await apiJson(`${api.replace(/\/$/, '')}/__api/datasource/screenshots?bucket=${encodeURIComponent(preset)}`, {
    method: 'POST', body: fd,
  })
  const url = out?.url ?? out?.path ?? null
  if (!url) throw new Error(`upload response missing url: ${JSON.stringify(out)}`)
  return url
}

// --- main ------------------------------------------------------------------

async function main() {
  const args = parseArgs(process.argv)
  const api = args.api
  const stripAbs = path.isAbsolute(args.strip) ? args.strip : path.resolve(REPO_ROOT, args.strip)
  const rel = path.relative(REPO_ROOT, stripAbs)
  if (rel.startsWith('..')) throw new Error(`strip must live inside the repo root (${REPO_ROOT})`)

  // Preflight: dev server + subscriber expectations surface early.
  await apiJson(`${designerBase(api)}/session`)
  await setMode(api, 'agent')

  const { server, port } = await startStaticServer(REPO_ROOT)
  const browser = await chromium.launch()
  const report = { ok: true, panels: [], warnings: [] }
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

    // Tag layers with import indexes and extract the structured model.
    const model = await page.evaluate(() => {
      const toHex = (rgb) => {
        const m = rgb.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/)
        return m ? '#' + [m[1], m[2], m[3]].map((v) => Number(v).toString(16).padStart(2, '0')).join('') : '#000000'
      }
      // textContent drops <br> entirely ("Capture in<br>Any Form" → "Capture inAny Form").
      // Preserve author line breaks as \n; collapse other whitespace per line.
      const textWithBreaks = (el) => {
        const clone = el.cloneNode(true)
        for (const br of clone.querySelectorAll('br')) br.replaceWith('\n')
        return (clone.textContent ?? '')
          .split('\n')
          .map((s) => s.replace(/\s+/g, ' ').trim())
          .filter((s, i, arr) => s !== '' || (i > 0 && i < arr.length - 1))
          .join('\n')
          .trim()
      }
      const panels = []
      const panelEls = [...document.querySelectorAll('[data-panel]')]
      panelEls.forEach((panelEl, pi) => {
        const pr = panelEl.getBoundingClientRect()
        const entry = {
          panel_index: pi,
          width: Math.round(pr.width), height: Math.round(pr.height),
          pageX: pr.left + window.scrollX, pageY: pr.top + window.scrollY,
          layers: [],
        }
        let idx = 0
        for (const el of panelEl.querySelectorAll('[data-layer]')) {
          const kind = el.getAttribute('data-layer')
          const r = el.getBoundingClientRect()
          const cs = getComputedStyle(el)
          const importId = `imp_${pi}_${idx}`
          el.setAttribute('data-import-id', importId)
          idx += 1
          const base = { importId, x: r.left - pr.left, y: r.top - pr.top, w: r.width, h: r.height }
          if (kind === 'text') {
            const align = cs.textAlign === 'start' ? 'left' : cs.textAlign === 'end' ? 'right' : cs.textAlign
            const fontSize = Number.parseFloat(cs.fontSize) || 0
            const lineHeightPx = Number.parseFloat(cs.lineHeight)
            const letterSpacingPx = Number.parseFloat(cs.letterSpacing)
            const family = (cs.fontFamily.split(',')[0] ?? '').trim().replace(/^["']|["']$/g, '')
            entry.layers.push({
              kind: 'text', role: el.getAttribute('data-role') ?? 'title',
              content: textWithBreaks(el),
              size: fontSize, color: toHex(cs.color),
              weight: String(cs.fontWeight), align: ['left', 'center', 'right'].includes(align) ? align : 'left',
              fontFamily: family || null,
              lineHeight: Number.isFinite(lineHeightPx) && fontSize > 0 ? lineHeightPx / fontSize : null,
              // Fabric charSpacing is thousandths of an em.
              letterSpacing: Number.isFinite(letterSpacingPx) && fontSize > 0 ? Math.round((letterSpacingPx * 1000) / fontSize) : null,
              ...base,
            })
          } else if (kind === 'device' || el.hasAttribute('data-device')) {
            entry.layers.push({
              kind: 'device', pack: el.dataset.pack ?? '', pose: el.dataset.pose ?? '',
              screenshot: el.dataset.screenshot ?? '', ...base,
            })
          } else if (kind === 'image') {
            entry.layers.push({ kind: 'image', src: el.getAttribute('src') ?? '', ...base })
          } else {
            entry.layers.push({ kind: 'decor', ...base })
          }
        }
        panels.push(entry)
      })
      return panels
    })

    // Rasterize panel backgrounds (all [data-layer] hidden) and decor blocks.
    const hideLayers = (hidden) => page.evaluate((h) => {
      for (const el of document.querySelectorAll('[data-layer]')) el.style.visibility = h ? 'hidden' : ''
    }, hidden)

    await hideLayers(true)
    const bgShots = []
    for (const p of model) {
      const loc = page.locator(`[data-panel="${p.panel_index}"]`).first()
      bgShots.push(await loc.screenshot())
    }
    await hideLayers(false)

    const showOnly = (id) => page.evaluate((theId) => {
      document.documentElement.style.background = 'transparent'
      document.body.style.background = 'transparent'
      for (const el of document.querySelectorAll('[data-panel], .strip')) el.style.background = 'transparent'
      for (const el of document.querySelectorAll('[data-layer]')) {
        el.style.visibility = el.getAttribute('data-import-id') === theId ? '' : 'hidden'
      }
    }, id)

    const decorShots = new Map()
    const croppedDeviceShots = new Map()
    const EPS = 2
    for (const p of model) {
      for (const layer of p.layers) {
        if (layer.kind === 'decor') {
          await showOnly(layer.importId)
          decorShots.set(layer.importId, await page.locator(`[data-import-id="${layer.importId}"]`).screenshot({ omitBackground: true }))
          continue
        }
        if (layer.kind !== 'device' || !args.rasterCropped) continue
        const cropped =
          layer.x < -EPS || layer.y < -EPS ||
          layer.x + layer.w > p.width + EPS || layer.y + layer.h > p.height + EPS
        if (!cropped) continue
        // Cropped/overhanging devices cannot be native canvas layers: the
        // canvas clamps device groups inside the panel (and overhang would
        // bleed into the neighbor panel's export). Rasterize the visible
        // portion instead — screenshot + frame + shadow, pixel-identical.
        const ix = Math.max(0, layer.x)
        const iy = Math.max(0, layer.y)
        const iw = Math.min(layer.x + layer.w, p.width) - ix
        const ih = Math.min(layer.y + layer.h, p.height) - iy
        if (iw <= 0 || ih <= 0) { report.warnings.push(`panel ${p.panel_index}: device ${layer.importId} entirely outside panel — skipped`); continue }
        await showOnly(layer.importId)
        const shot = await page.screenshot({
          omitBackground: true,
          clip: { x: p.pageX + ix, y: p.pageY + iy, width: iw, height: ih },
        })
        croppedDeviceShots.set(layer.importId, { shot, x: ix, y: iy, w: iw })
      }
    }

    // --- replay into the canvas ---------------------------------------------
    const enqueue = makeEnqueuer(api, args.preset)
    const snapshot = makeSnapshotter(api, args.preset, enqueue, model.length)

    // Clean slate: re-running the importer on a populated canvas would stack
    // duplicate layers on top of the previous import. Default: clear first.
    if (!args.noFresh) {
      await enqueue('clear_user_layers', {})
      report.clearedCanvasFirst = true
    }

    const knownIds = new Set()
    const idsOfKind = (snap, kind) =>
      (snap.panels ?? []).flatMap((p) => (p.layers ?? []).filter((l) => l.kind === kind).map((l) => l.layer_id))
    const findNewId = (snap, kind) => idsOfKind(snap, kind).find((id) => !knownIds.has(id)) ?? null
    const rememberAll = (snap) => { for (const p of snap.panels ?? []) for (const l of p.layers ?? []) knownIds.add(l.layer_id) }

    rememberAll(await snapshot().catch(() => ({ panels: [] })))

    for (const p of model) {
      const done = { texts: 0, devices: 0, images: 0, decors: 0 }

      // 1. Background raster at z-bottom for this panel.
      const bgUrl = await uploadPng(api, args.preset, bgShots[p.panel_index], `import_bg_${p.panel_index}.png`)
      await enqueue('add_image', { panel_index: p.panel_index, url: bgUrl, x: 0, y: 0, width: p.width, layer_name: `BG panel ${p.panel_index}` })

      // 2. Layers in DOM order (author-declared stacking, bottom → top).
      for (const layer of p.layers) {
        if (layer.kind === 'decor') {
          const shot = decorShots.get(layer.importId)
          if (!shot) continue
          const url = await uploadPng(api, args.preset, shot, `import_decor_${layer.importId}.png`)
          await enqueue('add_image', { panel_index: p.panel_index, url, x: layer.x, y: layer.y, width: layer.w, layer_name: `Decor ${layer.importId}` })
          done.decors += 1
        } else if (layer.kind === 'image') {
          await enqueue('add_image', { panel_index: p.panel_index, url: layer.src, x: layer.x, y: layer.y, width: layer.w })
          done.images += 1
        } else if (layer.kind === 'device' && croppedDeviceShots.has(layer.importId)) {
          const { shot, x, y, w } = croppedDeviceShots.get(layer.importId)
          const url = await uploadPng(api, args.preset, shot, `import_device_${layer.importId}.png`)
          await enqueue('add_image', { panel_index: p.panel_index, url, x, y, width: w, layer_name: `Device (cropped) ${layer.pose}` })
          report.warnings.push(
            `panel ${p.panel_index}: device "${layer.pose}" overhangs the panel — imported as a rasterized image layer (canvas clamps native devices inside panels)`,
          )
          done.devices += 1
        } else if (layer.kind === 'device') {
          await enqueue('add_device_frame', {
            panel_index: p.panel_index,
            path: `/device-frames/${layer.pack}/frame/${layer.pose}.svg`,
            frame: layer.pose,
          })
          const snap = await snapshot()
          const id = findNewId(snap, 'device')
          rememberAll(snap)
          if (!id) { report.warnings.push(`panel ${p.panel_index}: could not resolve new device layer id`); continue }
          await enqueue('device_set_size', { layer_id: id, width: Math.round(layer.w) })
          const wantX = Math.round(layer.x + layer.w / 2)
          const wantY = Math.round(layer.y + layer.h / 2)
          await enqueue('device_set_position', { layer_id: id, panel_index: p.panel_index, x: wantX, y: wantY })
          if (layer.screenshot) {
            // Strip URLs are repo-root paths (/datasource/...); the designer
            // tab can only fetch them via the dev-server API route.
            const diskPath = path.join(REPO_ROOT, decodeURIComponent(layer.screenshot.replace(/^\//, '')))
            const tabUrl = layer.screenshot.startsWith('/datasource/')
              ? `/__api${layer.screenshot}`
              : layer.screenshot
            let exists = true
            try { await fs.access(diskPath) } catch { exists = false }
            if (exists) {
              await enqueue('apply_screenshot_to_device', { layer_id: id, url: tabUrl })
            } else {
              report.warnings.push(
                `panel ${p.panel_index}: screenshot ${layer.screenshot} does not exist on disk — device keeps the placeholder screen (restore the file and re-import)`,
              )
            }
          }
          // The canvas clamps device groups inside their panel — measure how
          // far the intended (possibly overhanging) position was displaced.
          try {
            for (let round = 0; round < 2; round++) {
              const after = await snapshot()
              rememberAll(after)
              const placed = (after.panels?.[p.panel_index]?.layers ?? []).find((l) => l.layer_id === id)
              if (!placed) break
              const dx = Math.round(placed.x - wantX)
              const dy = Math.round(placed.y - wantY)
              if (Math.abs(dx) <= 4 && Math.abs(dy) <= 4) break
              if (round === 0) {
                await enqueue('device_set_position', { layer_id: id, panel_index: p.panel_index, x: wantX, y: wantY })
              } else {
                report.warnings.push(
                  `panel ${p.panel_index}: canvas clamp holds device "${layer.pose}" (${dx}, ${dy}) px off the strip position — ` +
                  'horizontal overhang is not possible for native devices; adjust in the canvas or use --raster-cropped-devices',
                )
              }
            }
          } catch { /* drift check is best-effort */ }
          done.devices += 1
        } else if (layer.kind === 'text') {
          await enqueue('add_text', {
            panel_index: p.panel_index, x: Math.round(layer.x), y: Math.round(layer.y),
            content: layer.content, color: layer.color,
            font: ROLE_TO_PRESET[layer.role] ?? 'body',
            size: Math.round(layer.size), align: layer.align, weight: layer.weight,
            no_snap: true,
            ...(layer.fontFamily ? { font_family: layer.fontFamily } : {}),
          })
          const snap = await snapshot()
          const id = findNewId(snap, 'text')
          rememberAll(snap)
          if (id) {
            if (layer.lineHeight != null) {
              await enqueue('text_set_line_height', { layer_id: id, line_height: layer.lineHeight })
            }
            if (layer.letterSpacing != null && layer.letterSpacing !== 0) {
              await enqueue('text_set_letter_spacing', { layer_id: id, letter_spacing: layer.letterSpacing })
            }
            await enqueue('layer_patch', {
              layer_id: id, panel_index: p.panel_index,
              patch: { width: Math.round(layer.w), height: Math.round(layer.h) },
            })
            // Reconcile: width/height patching can re-anchor the textbox
            // (Fabric origin semantics). Measure and pin back to the strip's
            // exact top-left, up to 2 correction rounds.
            for (let round = 0; round < 2; round++) {
              const after = await snapshot()
              rememberAll(after)
              const placed = (after.panels?.[p.panel_index]?.layers ?? []).find((l) => l.layer_id === id)
              if (!placed) break
              const dx = Math.round(placed.x - layer.x)
              const dy = Math.round(placed.y - layer.y)
              if (Math.abs(dx) <= 2 && Math.abs(dy) <= 2) break
              await enqueue('move_layer', {
                layer_id: id, panel_index: p.panel_index,
                x: Math.round(layer.x), y: Math.round(layer.y), no_snap: true,
              })
              report.warnings.push(`panel ${p.panel_index}: reconcile round ${round} moved text "${layer.content.slice(0, 20)}" (was off ${dx}, ${dy})`)
              if (round === 1) report.warnings.push(`panel ${p.panel_index}: text "${layer.content.slice(0, 20)}…" still off by (${dx}, ${dy}) after reconcile`)
            }
          } else {
            report.warnings.push(`panel ${p.panel_index}: could not resolve new text layer id ("${layer.content.slice(0, 24)}…")`)
          }
          done.texts += 1
        }
      }
      report.panels.push({ panel_index: p.panel_index, ...done })
    }

    report.note =
      'CSS-only device effects (drop-shadow/glow filters) are not imported — re-add in the UI if needed. ' +
      'Decor shadows extending beyond the block bbox are clipped. Save the design in the UI to persist.'
  } catch (e) {
    report.ok = false
    report.error = String(e?.message ?? e)
    process.exitCode = 1
  } finally {
    await browser.close()
    server.close()
    try { await setMode(api, args.endMode) } catch { /* dev server gone */ }
  }
  console.log(JSON.stringify(report, null, 2))
}

main().catch((err) => {
  console.error(JSON.stringify({ ok: false, error: String(err?.message ?? err) }))
  process.exit(1)
})
