/**
 * A decor block drawn as an inline `<svg>` must index like any other.
 *
 * Regression: `labelFor` read `el.className.trim()`. On an HTML element that is
 * a string; on an **SVG** element it is an `SVGAnimatedString`, which has no
 * `.trim` — so a strip containing a perfectly legal inline `<svg>` crashed the
 * layer tree with "el.className.trim is not a function". The strip was fine;
 * the editor's assumption was not.
 *
 * Run: node test/svg-decor.test.mjs   (from strip_editor/)
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { JSDOM } from 'jsdom'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const EDITOR = path.resolve(HERE, '..')

const out = mkdtempSync(path.join(tmpdir(), 'svg-decor-'))
try {
  execFileSync(process.execPath, [
    path.join(EDITOR, 'node_modules/typescript/bin/tsc'),
    path.join(EDITOR, 'src/editor/blockRegistry.ts'),
    '--outDir', out, '--module', 'esnext', '--target', 'es2022',
    '--moduleResolution', 'bundler', '--skipLibCheck',
  ], { stdio: 'pipe' })
} catch (e) {
  if (!e.stdout?.toString().includes('error TS')) throw e
}
// tsc emits extensionless relative imports, which Node's ESM loader rejects.
for (const f of readdirSync(out).filter((n) => n.endsWith('.js'))) {
  const p = path.join(out, f)
  writeFileSync(p, readFileSync(p, 'utf8').replace(/(from '\.[^']*?)(')/g, (m, a, b) => (a.endsWith('.js') ? m : `${a}.js${b}`)))
}
const { indexStrip, classNameOf } = await import(path.join(out, 'blockRegistry.js'))

const dom = new JSDOM(`<!doctype html><html><body><div class="strip">
  <section class="panel" data-panel="0">
    <div data-layer="text" data-role="title" style="position:absolute;">Hello</div>
    <svg data-layer="decor" class="ring glow" viewBox="0 0 10 10" style="position:absolute;">
      <circle cx="5" cy="5" r="4"/>
    </svg>
    <div data-layer="decor" class="badge" style="position:absolute;"></div>
    <svg data-layer="decor" viewBox="0 0 10 10" style="position:absolute;"></svg>
  </section>
</div></body></html>`)

const doc = dom.window.document
for (const el of doc.querySelectorAll('*')) {
  el.getBoundingClientRect = () => ({ left: 0, top: 0, right: 10, bottom: 10, width: 10, height: 10, x: 0, y: 0 })
}

// The crash was here: indexing derives a label for every block.
const nodes = indexStrip({ contentDocument: doc, contentWindow: dom.window }, { fresh: true })

const decor = nodes.filter((n) => n.kind === 'decor')
assert.equal(decor.length, 3, `expected 3 decor blocks, got ${decor.length}`)
console.log('PASS  an <svg> decor block indexes without crashing')

const svgWithClass = decor.find((n) => n.tagName.toLowerCase() === 'svg' && n.className.includes('ring'))
assert.ok(svgWithClass, 'the classed <svg> should be indexed')
assert.equal(svgWithClass.label, 'decor · ring', `label was ${JSON.stringify(svgWithClass.label)}`)
console.log('PASS  its label uses the first class, like any decor block')

assert.equal(typeof svgWithClass.className, 'string', 'className must be a string, not SVGAnimatedString')
assert.equal(svgWithClass.className, 'ring glow')
console.log('PASS  className is a plain string (the inspector renders it directly)')

const svgNoClass = decor.find((n) => n.tagName.toLowerCase() === 'svg' && n.className === '')
assert.ok(svgNoClass, 'an unclassed <svg> should still index')
assert.equal(svgNoClass.label, 'decor')
console.log('PASS  an unclassed <svg> falls back to "decor"')

assert.equal(classNameOf(doc.querySelector('.badge')), 'badge')
assert.equal(classNameOf(doc.querySelector('svg[data-layer]')), 'ring glow')
console.log('PASS  classNameOf works for both HTML and SVG')

rmSync(out, { recursive: true, force: true })
console.log('\nALL PASS')
