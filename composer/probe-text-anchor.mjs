/**
 * Probe v2: is the snapshot measurement live or frozen, and does the offset
 * depend on position or on creation order?
 * Run with dev server + designer tab open (hard-reloaded):
 *   node composer/probe-text-anchor.mjs
 * WARNING: clears all user layers.
 */
const argv = process.argv
const api = argv.includes('--api') ? argv[argv.indexOf('--api') + 1] : 'http://localhost:4713'
const preset = argv.includes('--preset') ? argv[argv.indexOf('--preset') + 1] : 'appstore_iphone_portrait'
const base = `${api.replace(/\/$/, '')}/__api/screenshot-designer`

async function apiJson(url, init) {
  const res = await fetch(url, init)
  const t = await res.text()
  let b; try { b = t ? JSON.parse(t) : {} } catch { b = { raw: t } }
  if (!res.ok) throw new Error(`${init?.method ?? 'GET'} ${url} → ${res.status} ${JSON.stringify(b)}`)
  return b
}
const enq = async (operation, args) => {
  await apiJson(`${base}/enqueue-command?artboard=${encodeURIComponent(preset)}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ operation, args }),
  })
  await new Promise((r) => setTimeout(r, 350))
}
let lastStamp = null
async function snapAll(label) {
  await enq('capture_panel_preview_data', { panel_indexes: [0] })
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 250))
    const s = await apiJson(`${base}/agent-preview-data`).catch(() => null)
    if (!s) continue
    const stamp = s.capturedAt ?? JSON.stringify(s.panels)
    if (stamp !== lastStamp) {
      lastStamp = stamp
      const texts = (s.panels?.[0]?.layers ?? []).filter((l) => l.kind === 'text')
        .map((l) => ({ id: l.layer_id.slice(0, 6), c: String(l.content).slice(0, 10), x: l.x, y: l.y, w: l.width, h: l.height }))
      console.log(label.padEnd(34), JSON.stringify(texts))
      return s
    }
  }
  console.log(label.padEnd(34), 'SNAPSHOT TIMEOUT')
  return null
}
const textId = (s, content) =>
  (s.panels?.[0]?.layers ?? []).find((l) => l.kind === 'text' && String(l.content).startsWith(content))?.layer_id

await apiJson(`${base}/mode`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'agent', holder: 'probe' }) })
await enq('clear_user_layers', {})

// A: plain preset text, default everything, snapped grid (baseline sanity)
await enq('add_text', { panel_index: 0, x: 112, y: 192, content: 'AAA plain', color: '#111111', font: 'title1' })
let s = await snapAll('A add (112,192) defaults')

// B: the import-style add (no_snap + font_family + size)
await enq('add_text', { panel_index: 0, x: 110, y: 800, content: 'BBB styled', color: '#111111', font: 'title1', size: 132, weight: '700', align: 'left', no_snap: true, font_family: 'Georgia' })
s = await snapAll('B add (110,800) styled')

// Move B far away — does the reported value track?
const bId = textId(s, 'BBB')
await enq('move_layer', { layer_id: bId, panel_index: 0, x: 600, y: 1500, no_snap: true })
s = await snapAll('B moved to (600,1500)')

// Delta move B — different code path
await enq('move_layer', { layer_id: bId, dx: 100, dy: 100 })
s = await snapAll('B delta +100,+100')

// C: third text — then re-read A and B (creation-order / cumulative effects)
await enq('add_text', { panel_index: 0, x: 110, y: 2200, content: 'CCC third', color: '#111111', font: 'title1', no_snap: true })
s = await snapAll('C add (110,2200); re-read all')

await apiJson(`${base}/mode`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'human' }) })
console.log('done')
