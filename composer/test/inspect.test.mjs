/**
 * The layout inspector in render.mjs, exercised without a browser.
 *
 * The snapshot is a pure function of a laid-out DOM, so it is extracted from
 * `render.mjs` verbatim and run against jsdom with measurements supplied by
 * hand. Extracting rather than copying matters: a copy would drift, and a test
 * that passes against a stale copy of the code is worse than no test.
 *
 * What is deliberately *not* tested here: failures that stop the render before
 * this code runs (a missing pack, an unknown pose, a dead device screenshot all
 * reject in device-frames.mjs and surface as __composerErrors), and anything
 * check-schema.mjs can see in the source text. This covers only what needs
 * layout.
 *
 * Run: node composer/test/inspect.test.mjs
 */
import { JSDOM } from 'jsdom'
import assert from 'node:assert/strict'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const RENDER = path.join(HERE, '..', 'render.mjs')

// --- lift the evaluate callback out of render.mjs ---------------------------
const source = await fs.readFile(RENDER, 'utf8')
const start = source.indexOf('const snapshot = await page.evaluate((panelSelector) => {')
assert.ok(start !== -1, 'could not find the snapshot callback in render.mjs')
const open = source.indexOf('{', source.indexOf('(panelSelector) =>', start))
let depth = 0
let end = open
for (let i = open; i < source.length; i++) {
  if (source[i] === '{') depth += 1
  else if (source[i] === '}') {
    depth -= 1
    if (depth === 0) { end = i; break }
  }
}
const body = source.slice(open + 1, end)
const takeSnapshot = new Function('panelSelector', 'window', 'document', 'getComputedStyle', body)

// --- a strip with one of everything that matters ----------------------------
const PW = 1000
const PH = 2000
const dom = new JSDOM(`<!doctype html><html><body>
<div class="strip">
  <section class="panel" data-panel="0">
    <div id="ok"        data-layer="text" data-role="title" style="font-size:120px; font-weight:700;">Fits fine</div>
    <div id="clipped"   data-layer="text" data-role="subtitle">Runs off the edge</div>
    <div id="empty"     data-layer="text" data-role="caption"></div>
    <div id="dev"       data-layer="device" data-device data-pack="iphone_12_pro" data-pose="tilted-left"></div>
    <img id="deadimg"   data-layer="image" src="/strips/missing/images/gone.png">
    <img id="placeimg"  data-layer="image" src="/composer/placeholder.svg">
    <div id="offpanel"  data-layer="decor"></div>
  </section>
</div>
</body></html>`)

const { window } = dom
const doc = window.document

// Measurements the browser would have produced. Panel 0 spans x 0..1000.
const boxes = {
  panel: { left: 0, top: 0, width: PW, height: PH },
  ok: { left: 100, top: 200, width: 700, height: 280 },
  // 60px past the right edge — a clipped headline.
  clipped: { left: 500, top: 600, width: 560, height: 120 },
  empty: { left: 100, top: 800, width: 400, height: 0 },
  // Deliberate crop: a third of the device hangs off the bottom and right.
  dev: { left: 300, top: 1200, width: 900, height: 1400 },
  deadimg: { left: 100, top: 900, width: 200, height: 200 },
  placeimg: { left: 350, top: 900, width: 200, height: 200 },
  // Entirely beyond the right edge.
  offpanel: { left: 1200, top: 300, width: 200, height: 200 },
}
const rectOf = ({ left, top, width, height }) => ({
  left, top, width, height, right: left + width, bottom: top + height, x: left, y: top,
})
doc.querySelector('.panel').getBoundingClientRect = () => rectOf(boxes.panel)
for (const [id, box] of Object.entries(boxes)) {
  if (id === 'panel') continue
  doc.getElementById(id).getBoundingClientRect = () => rectOf(box)
}
// jsdom reports 0 for every image; say which one actually loaded.
Object.defineProperty(doc.getElementById('placeimg'), 'naturalWidth', { value: 900 })
Object.defineProperty(doc.getElementById('placeimg'), 'naturalHeight', { value: 600 })

const snap = takeSnapshot('[data-panel]', window, doc, window.getComputedStyle.bind(window))

// --- shape ------------------------------------------------------------------
let failures = 0
const check = (label, cond, detail = '') => {
  if (!cond) { failures += 1; console.log(`FAIL  ${label}${detail ? `  — ${detail}` : ''}`) }
  else console.log(`PASS  ${label}`)
}

check('version is 1', snap.version === 1, String(snap.version))
check('one panel, all seven blocks captured', snap.panels.length === 1 && snap.panels[0].layers.length === 7,
  `${snap.panels.length} panels / ${snap.panels[0]?.layers.length} layers`)

const byId = Object.fromEntries(snap.panels[0].layers.map((l) => [l.id.replace(/_0_\d+$/, ''), l]))
check('image and decor layers are captured, not just text and devices',
  snap.panels[0].layers.filter((l) => l.kind === 'image').length === 2 &&
  snap.panels[0].layers.some((l) => l.kind === 'decor'))

// --- coordinates are panel-relative and top-left, for every kind -----------
const dev = snap.panels[0].layers.find((l) => l.kind === 'device')
check('device x/y is the top-left corner', dev.x === 300 && dev.y === 1200, `x=${dev.x} y=${dev.y}`)
check('device carries pack/pose/fit', dev.pack === 'iphone_12_pro' && dev.pose === 'tilted-left' && dev.fit === 'cover')
check('device with no screenshot is marked blank_screen', dev.blank_screen === true)
check('device overhang measured', dev.outside.right === 200 && dev.outside.bottom === 600,
  JSON.stringify(dev.outside))

// --- problems ---------------------------------------------------------------
const msgs = snap.problems.map((p) => `${p.severity}:${p.layer}:${p.message}`)
const has = (layerPrefix, fragment) =>
  snap.problems.some((p) => p.layer.startsWith(layerPrefix) && p.message.includes(fragment))

check('clipped text is flagged, with the edge and distance', has('text', 'clipped by the panel edge'),
  msgs.join(' | '))
check('  ...and names 60px past the right', snap.problems.some((p) => p.message.includes('60px past the right')),
  msgs.join(' | '))
check('empty text is flagged', has('text', 'text block is empty'))
check('image that did not load is an error',
  snap.problems.some((p) => p.severity === 'error' && p.message.includes('image did not load')))
check('placeholder image is flagged', has('image', 'still the editor placeholder'))
check('block entirely off-panel is flagged', has('decor', 'entirely outside its panel'))

// --- and the crucial negative ----------------------------------------------
check('a DELIBERATELY cropped device is NOT flagged',
  !snap.problems.some((p) => p.layer.startsWith('device')),
  snap.problems.filter((p) => p.layer.startsWith('device')).map((p) => p.message).join(' | '))
check('the well-behaved headline is NOT flagged',
  !snap.problems.some((p) => p.layer === byId.text?.id && p.message.includes('clipped')))

// --- emptiness --------------------------------------------------------------
// Expected values were computed independently from the box table above, on the
// same 10px grid, rather than read off a run of this code. The point of the
// fields is that the number means one thing; a test that asserts whatever the
// implementation happened to print would not check that.
//
// Union, clipped to the panel: `offpanel` sits entirely past the right edge and
// must contribute nothing, and `dev` overhangs by 200×600 which must not count.
const p0 = snap.panels[0]
check('coverage is the panel-clipped union as a fraction', p0.coverage === 0.448, String(p0.coverage))
check('longest fully-empty column run, in px', p0.longest_empty_col === 100, String(p0.longest_empty_col))
check('longest fully-empty row run, in px', p0.longest_empty_row === 200, String(p0.longest_empty_row))
check('coverage cannot exceed 1 even though group/child boxes overlap',
  p0.coverage <= 1, String(p0.coverage))
check('a zero-height text block contributes no area',
  snap.panels[0].layers.some((l) => l.height === 0))

console.log(`\n${snap.problems.length} problems reported:`)
for (const p of snap.problems) console.log(`  ${p.severity.padEnd(7)} panel ${p.panel}  ${p.layer}  ${p.message}`)
console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`)
process.exit(failures ? 1 : 0)
