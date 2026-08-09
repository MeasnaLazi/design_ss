/**
 * Groups: nested indexing, and the resize/move split.
 *
 * Two regressions are pinned here, both from treating a group's child as if it
 * were an ordinary top-level block.
 *
 * 1. **Nesting.** `topLevelLayers` filtered out anything inside another block,
 *    so a group's children were invisible — unselectable, absent from the tree.
 *    Only a `group` opens up: `decor` is free HTML/CSS by contract, and indexing
 *    its innards would make every shape in a composed badge a layer.
 *
 * 2. **Resizable ≠ movable.** A child in flex flow is `position: static`, so
 *    `left`/`top` do nothing — but `width`/`height` apply normally. The editor
 *    gated handles on `movable` and so offered none at all, which made those
 *    blocks look completely inert. A static block keeps the handles that grow
 *    away from its origin and loses the ones that would have to move it.
 *
 * Run: node test/group-layers.test.mjs   (from strip_editor/)
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { JSDOM } from 'jsdom'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const EDITOR = path.resolve(HERE, '..')

const out = mkdtempSync(path.join(tmpdir(), 'group-layers-'))
try {
  execFileSync(process.execPath, [
    path.join(EDITOR, 'node_modules/typescript/bin/tsc'),
    path.join(EDITOR, 'src/editor/blockRegistry.ts'),
    path.join(EDITOR, 'src/editor/geometry.ts'),
    '--outDir', out, '--module', 'esnext', '--target', 'es2022',
    '--moduleResolution', 'bundler', '--skipLibCheck',
  ], { stdio: 'pipe' })
} catch (e) {
  if (!e.stdout?.toString().includes('error TS')) throw e
}
for (const f of readdirSync(out).filter((n) => n.endsWith('.js'))) {
  const p = path.join(out, f)
  writeFileSync(p, readFileSync(p, 'utf8').replace(/(from '\.[^']*?)(')/g, (m, a, b) => (a.endsWith('.js') ? m : `${a}.js${b}`)))
}
const { indexStrip } = await import(path.join(out, 'blockRegistry.js'))
const { handlesFor, resizePolicy } = await import(path.join(out, 'geometry.js'))

const dom = new JSDOM(`<!doctype html><html><body><div class="strip">
  <section class="panel" data-panel="0">
    <div data-layer="text" data-role="title" style="position:absolute;">Hello</div>
    <div data-layer="group" class="chip" style="position:absolute;">
      <img data-layer="image" src="/x.png" style="width:44px;">
      <div data-layer="text" data-role="caption">AI-assisted rewrite</div>
    </div>
    <div data-layer="decor" class="card" style="position:absolute;">
      <div data-layer="text" data-role="caption">not a layer: decor is opaque</div>
      <span class="ring"></span>
    </div>
  </section>
</div></body></html>`)

const doc = dom.window.document
for (const el of doc.querySelectorAll('*')) {
  el.getBoundingClientRect = () => ({ left: 0, top: 0, right: 10, bottom: 10, width: 10, height: 10, x: 0, y: 0 })
}

const nodes = indexStrip({ contentDocument: doc, contentWindow: dom.window }, { fresh: true })
const byLabel = (frag) => nodes.find((n) => n.label.includes(frag))

// --- nesting ----------------------------------------------------------------
const group = nodes.find((n) => n.kind === 'group')
assert.ok(group, 'the group block is indexed')
assert.equal(group.depth, 1, 'a top-level group sits at depth 1')

const children = nodes.filter((n) => n.parentId === group.id)
assert.equal(children.length, 2, `the group's two children are indexed, got ${children.length}`)
assert.deepEqual(
  children.map((c) => c.kind).sort(),
  ['image', 'text'],
  'children keep their own kinds rather than becoming part of the group',
)
assert.ok(children.every((c) => c.depth === 2), 'children sit one level deeper than the group')
console.log('PASS  a group’s children are indexed as sub-layers')

// The decor block's text child must NOT appear: decor is opaque by contract.
const decorTextIsLayer = nodes.some((n) => n.label.includes('not a layer'))
assert.equal(decorTextIsLayer, false, 'a decor block’s children stay unindexed')
console.log('PASS  a decor block’s children stay opaque')

// Ids stay positional, so the same id resolves in a clean parse of the file.
assert.ok(
  children.every((c) => c.id.startsWith(`${group.id}.`)),
  `child ids extend the parent's: ${children.map((c) => c.id).join(', ')}`,
)
console.log('PASS  child ids are positional under the parent')

// --- resizable is not movable ----------------------------------------------
assert.deepEqual(handlesFor('image', { positioned: true }), ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'])
assert.deepEqual(
  handlesFor('image', { positioned: false }),
  ['e', 'se', 's'],
  'a static block keeps only the handles that grow away from its origin',
)
console.log('PASS  a static block is resizable from its right and bottom edges')

// Text is width-only in both cases; static drops the west handle.
assert.deepEqual(handlesFor('text', { positioned: true }), ['w', 'e'])
assert.deepEqual(handlesFor('text', { positioned: false }), ['e'])
console.log('PASS  width-only kinds narrow the same way')

// A device never gets a height handle, positioned or not — the pose owns it.
assert.equal(resizePolicy('device').height, false)
assert.ok(!handlesFor('device', { positioned: false }).some((h) => h.includes('s') || h.includes('n')))
console.log('PASS  a device still never offers a height handle')

// A group resizes on both axes; the hug/fixed distinction lives in the panel.
assert.deepEqual(resizePolicy('group'), { width: true, height: true })
console.log('PASS  a group is resizable on both axes')

console.log('\nALL PASS')
