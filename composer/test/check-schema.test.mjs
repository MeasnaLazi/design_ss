/**
 * check-schema.mjs, against markup designed to break it.
 *
 * The rule under most scrutiny here is the unlabelled-child check. It has to
 * fire on a bare `<div>` sitting in a panel — an element that renders perfectly
 * and is invisible to the editor — while staying silent about the shapes nested
 * *inside* a decor block, which are that block's own business. A checker that
 * cried wolf about nested markup would be turned off within a day, so the
 * negative cases below matter more than the positive one.
 *
 * Run: node composer/test/check-schema.test.mjs
 */
import assert from 'node:assert/strict'
import { checkStrip } from '../check-schema.mjs'

const wrap = (panelBody, extra = '') => `<!doctype html><html><head>
<script type="module" src="/composer/device-frames.mjs"></script>
</head><body>
<div class="strip">
  <section class="panel" data-panel="0">
${panelBody}
  </section>
${extra}
</div>
</body></html>`

const TEXT = '<div data-layer="text" data-role="title" style="position:absolute; left:10px; top:10px;">Hi</div>'

let failures = 0
async function check(label, html, { errors = [], noErrors = [] }) {
  const res = await checkStrip(html, label)
  const joined = res.errors.join(' | ')
  const missing = errors.filter((e) => !joined.includes(e))
  const spurious = noErrors.filter((e) => joined.includes(e))
  if (missing.length || spurious.length) {
    failures += 1
    console.log(`FAIL  ${label}`)
    for (const m of missing) console.log(`        expected an error containing: ${m}`)
    for (const s of spurious) console.log(`        should NOT have errored on: ${s}`)
    console.log(`        actual: ${joined || '(none)'}`)
  } else {
    console.log(`PASS  ${label}`)
  }
}

// --- the bug this rule exists for ------------------------------------------
await check('bare div in a panel is caught', wrap(`${TEXT}\n<div class="badge"></div>`), {
  errors: ['class="badge"', 'no data-layer'],
})

await check('inline <svg> in a panel is caught', wrap(`${TEXT}\n<svg viewBox="0 0 10 10"><circle r="5"/></svg>`), {
  errors: ['<svg>', 'no data-layer'],
})

await check('bare <img> in a panel is caught', wrap(`${TEXT}\n<img src="/datasource/images/x.png">`), {
  errors: ['<img>', 'no data-layer'],
})

// --- the negatives that decide whether anyone keeps it on -------------------
await check(
  'shapes NESTED inside a decor block are left alone',
  wrap(`${TEXT}
<div data-layer="decor" class="card" style="position:absolute; left:0; top:0;">
  <div class="ring"></div>
  <div class="ring2"><span class="dot"></span></div>
  <svg viewBox="0 0 10 10"><circle r="5"/></svg>
</div>`),
  { noErrors: ['class="ring"', 'class="ring2"', 'class="dot"', '<svg>'] },
)

await check(
  'a void element inside decor does not break depth tracking',
  wrap(`${TEXT}
<div data-layer="decor" style="position:absolute; left:0; top:0;">
  <img src="/composer/placeholder.svg"><br><hr>
</div>
<div class="after"></div>`),
  { errors: ['class="after"'], noErrors: ['<img>', '<br>', '<hr>'] },
)

await check(
  'a self-closed element inside decor does not break depth tracking',
  wrap(`${TEXT}
<div data-layer="decor" style="position:absolute; left:0; top:0;">
  <svg viewBox="0 0 4 4"><rect width="4" height="4"/></svg>
</div>
<div class="after"></div>`),
  { errors: ['class="after"'], noErrors: ['<rect>'] },
)

await check('a device block is not reported as unlabelled', wrap(`${TEXT}
<div data-layer="device" data-device data-pack="iphone_12_pro" data-pose="front"
     style="position:absolute; left:0; top:0; width:900px;"></div>`), {
  noErrors: ['no data-layer'],
})

await check('a <style> block inside a panel is not a layer', wrap(`${TEXT}\n<style>.x{color:red}</style>`), {
  noErrors: ['no data-layer'],
})

// --- img mislabelled as decor ----------------------------------------------
// Warning, not error: it exports correctly and decor is free HTML, so the file
// is legal. But the editor gives it the decor inspector — background and border,
// no src field — so the picture is the one thing you cannot change about it.
async function warns(label, html, { warnings = [], noWarnings = [], noErrors = [] }) {
  const res = await checkStrip(html, label)
  const w = res.warnings.join(' | ')
  const e = res.errors.join(' | ')
  const missing = warnings.filter((x) => !w.includes(x))
  const spurious = [...noWarnings.filter((x) => w.includes(x)), ...noErrors.filter((x) => e.includes(x))]
  if (missing.length || spurious.length) {
    failures += 1
    console.log(`FAIL  ${label}`)
    for (const m of missing) console.log(`        expected a warning containing: ${m}`)
    for (const s of spurious) console.log(`        should not have reported: ${s}`)
    console.log(`        warnings: ${w || '(none)'}\n        errors: ${e || '(none)'}`)
  } else {
    console.log(`PASS  ${label}`)
  }
}

const IMG_DECOR = '<img data-layer="decor" src="/composer/placeholder.svg" style="position:absolute; left:0; top:0;">'
const IMG_IMAGE = '<img data-layer="image" src="/composer/placeholder.svg" style="position:absolute; left:0; top:0;">'

await warns('an <img> labelled decor is warned about', wrap(`${TEXT}\n${IMG_DECOR}`), {
  warnings: ['labelled decor'],
  noErrors: ['no data-layer'],
})

await warns('an <img> labelled image is left alone', wrap(`${TEXT}\n${IMG_IMAGE}`), {
  noWarnings: ['labelled decor'],
})

await warns(
  'a <div> decor block is not confused with an image',
  wrap(`${TEXT}\n<div data-layer="decor" style="position:absolute; left:0; top:0; width:40px; height:40px;"></div>`),
  { noWarnings: ['labelled decor'] },
)

await warns(
  'an <img> nested inside a decor block is that block’s business',
  wrap(`${TEXT}
<div data-layer="decor" style="position:absolute; left:0; top:0;">
  <img src="/composer/placeholder.svg">
</div>`),
  { noWarnings: ['labelled decor'], noErrors: ['no data-layer'] },
)

// --- groups -----------------------------------------------------------------
// A group is the one container whose children are layers. Everything here is
// about the boundary between it and decor: decor hides its innards, a group
// exposes them, and the rules follow from that one difference.
const GROUP = (children) =>
  `<div data-layer="group" style="position:absolute; left:10px; top:10px;">${children}</div>`

await check(
  'an unlabelled child of a group is caught',
  wrap(`${TEXT}\n${GROUP('<span>hi</span>')}`),
  { errors: ['<span>', 'inside a group has no data-layer'] },
)

await check(
  'a labelled child of a group is fine',
  wrap(`${TEXT}\n${GROUP('<div data-layer="text" data-role="caption">hi</div>')}`),
  { noErrors: ['no data-layer', 'not absolutely positioned'] },
)

await check(
  'a group child need not be absolutely positioned — the group lays it out',
  wrap(`${TEXT}\n${GROUP('<img data-layer="image" src="/composer/placeholder.svg" style="width:40px;">')}`),
  { noErrors: ['not absolutely positioned'] },
)

await check(
  'a block sitting directly in a panel still must be absolutely positioned',
  wrap(`${TEXT}\n<div data-layer="decor" style="width:40px; height:40px;"></div>`),
  { errors: ['not absolutely positioned'] },
)

await check(
  'an unlabelled child of a DECOR block is still that block’s business',
  wrap(`${TEXT}\n<div data-layer="decor" style="position:absolute; left:0; top:0;"><span>hi</span></div>`),
  { noErrors: ['no data-layer', 'inside a group'] },
)

await check('group is a valid data-layer kind', wrap(`${TEXT}\n${GROUP('')}`), {
  noErrors: ['unknown data-layer kind'],
})

// --- multiple panels are attributed correctly -------------------------------
const twoPanels = `<!doctype html><html><head>
<script type="module" src="/composer/device-frames.mjs"></script>
</head><body><div class="strip">
  <section class="panel" data-panel="0">${TEXT}</section>
  <section class="panel" data-panel="1">${TEXT}<div class="stray"></div></section>
</div></body></html>`
const res = await checkStrip(twoPanels, 'two panels')
assert.ok(
  res.errors.some((e) => e.includes('panel 1') && e.includes('class="stray"')),
  `expected the stray to be attributed to panel 1, got: ${res.errors.join(' | ')}`,
)
assert.ok(!res.errors.some((e) => e.includes('panel 0:')), 'panel 0 is clean and must not be blamed')
console.log('PASS  the offending panel is named correctly')

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`)
process.exit(failures ? 1 : 0)
