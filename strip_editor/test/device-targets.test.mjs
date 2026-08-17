/**
 * A strip must come back out of the folder it went into.
 *
 * Two paths write and read the same fact, from opposite ends. **Create** turns a
 * device target into a panel size and writes it into the document; **Load**
 * reads a panel size back out of a document and turns it into a device target.
 * If those two ever disagree, a strip is filed under the wrong device and
 * exports at the wrong size — a failure with no symptom until App Store Connect
 * rejects the upload, by which point nothing points at this code.
 *
 * So the round trip is asserted directly, for every target, against the real
 * template the editor writes and the real parser the server runs.
 *
 * Run: node test/device-targets.test.mjs   (from strip_editor/)
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const EDITOR = path.resolve(HERE, '..')
const REPO = path.resolve(EDITOR, '..')

const out = mkdtempSync(path.join(tmpdir(), 'device-targets-'))
try {
  execFileSync(
    process.execPath,
    [
      path.join(EDITOR, 'node_modules/typescript/bin/tsc'),
      path.join(EDITOR, 'src/editor/devices.ts'),
      path.join(EDITOR, 'src/editor/schema.ts'),
      '--outDir', out,
      '--module', 'esnext',
      '--target', 'es2022',
      '--moduleResolution', 'bundler',
      '--skipLibCheck',
    ],
    { stdio: 'pipe' },
  )
} catch (e) {
  if (!e.stdout?.toString().includes('error TS')) throw e
}

const {
  DEVICE_TARGETS,
  deviceForSize,
  deviceForFolder,
  deviceForStripPath,
  panelSizeFromHtml,
  retargetStripAssets,
  stripDisplayName,
} = await import(path.join(out, 'devices.js'))
const { blankStripTemplate } = await import(path.join(out, 'schema.js'))

let failures = 0
function check(name, fn) {
  try {
    fn()
    console.log(`PASS  ${name}`)
  } catch (e) {
    failures++
    console.log(`FAIL  ${name}\n      ${e.message}`)
  }
}

// --- the round trip ---------------------------------------------------------

for (const target of DEVICE_TARGETS) {
  check(`${target.folder}: a created strip reads back as ${target.folder}`, () => {
    const html = blankStripTemplate(target.folder, 5, target.width, target.height)
    const size = panelSizeFromHtml(html)
    assert.deepEqual(size, { width: target.width, height: target.height })
    assert.equal(deviceForSize(size.width, size.height)?.folder, target.folder)
  })
}

check('the schema document\'s own skeleton measures as a known target', () => {
  const doc = readFileSync(path.join(REPO, 'composer/strip-schema.md'), 'utf8')
  const skeleton = [...doc.matchAll(/```html\n([\s\S]*?)```/g)]
    .map((m) => m[1])
    .find((b) => b.includes('<!doctype html>'))
  assert.ok(skeleton, 'strip-schema.md must contain a full-document example')
  const size = panelSizeFromHtml(skeleton)
  assert.ok(size, 'the skeleton must state a panel size')
  assert.ok(
    deviceForSize(size.width, size.height),
    `the skeleton is ${size.width}×${size.height}, which matches no device target`,
  )
})

// --- the table itself -------------------------------------------------------

check('folders and presets are unique', () => {
  const folders = DEVICE_TARGETS.map((d) => d.folder)
  const presets = DEVICE_TARGETS.map((d) => d.preset)
  assert.equal(new Set(folders).size, folders.length, 'two targets share a folder')
  assert.equal(new Set(presets).size, presets.length, 'two targets share a preset')
})

check('no two targets share a panel size', () => {
  const sizes = DEVICE_TARGETS.map((d) => `${d.width}x${d.height}`)
  assert.equal(new Set(sizes).size, sizes.length, 'a size maps to two folders — load cannot pick')
})

check('deviceForFolder round-trips every target', () => {
  for (const d of DEVICE_TARGETS) assert.equal(deviceForFolder(d.folder)?.preset, d.preset)
})

// --- the parser -------------------------------------------------------------

const rule = (body) => `<style>.panel { ${body} }</style>`

check('an exact size is required, not a near one', () => {
  assert.equal(deviceForSize(1290, 2795), null)
  assert.equal(deviceForSize(1291, 2796), null)
})

check('min-width and max-height are not the panel size', () => {
  const html = rule('min-width: 100px; max-height: 200px; width: 1290px; height: 2796px;')
  assert.deepEqual(panelSizeFromHtml(html), { width: 1290, height: 2796 })
})

check('.panel-inner is not .panel', () => {
  assert.equal(panelSizeFromHtml('<style>.panel-inner { width: 500px; height: 900px; }</style>'), null)
})

check('a later rule wins, as it does in CSS', () => {
  const html = `<style>.panel { width: 1080px; height: 1920px; } .strip .panel { width: 1290px; height: 2796px; }</style>`
  assert.deepEqual(panelSizeFromHtml(html), { width: 1290, height: 2796 })
})

check('a document that states no panel size measures as null', () => {
  assert.equal(panelSizeFromHtml('<html><body><div class="panel"></div></body></html>'), null)
  assert.equal(panelSizeFromHtml(rule('background: #000;')), null)
})

check('a percentage panel is not a pixel panel', () => {
  assert.equal(panelSizeFromHtml(rule('width: 100%; height: 100%;')), null)
})

// --- retargeting ------------------------------------------------------------

check('a strip authored elsewhere is retargeted to its new folder', () => {
  const html = `<img data-layer="image" src="/strips/bio/images/leaf.svg">
    <div data-device data-screenshot="/strips/bio/screenshots/welcome.PNG"></div>`
  const r = retargetStripAssets(html, 'iphone')
  assert.equal(r.changed, 2)
  assert.ok(!r.html.includes('/strips/bio/'), 'no reference may still name the old folder')
  assert.ok(r.html.includes('/strips/iphone/images/leaf.svg'))
  assert.ok(r.html.includes('/strips/iphone/screenshots/welcome.PNG'))
})

check('a strip already in the right folder is left byte-identical', () => {
  const html = `<div data-screenshot="/strips/iphone/screenshots/a.png"></div>`
  const r = retargetStripAssets(html, 'iphone')
  assert.equal(r.changed, 0)
  assert.equal(r.html, html)
})

check('retargeting does not touch other root-relative URLs', () => {
  const html = `<script src="/composer/device-frames.mjs"></script>
    <img src="/datasource/images/x.png">`
  const r = retargetStripAssets(html, 'iphone')
  assert.equal(r.changed, 0)
  assert.equal(r.html, html)
})

check('every device target is a valid retarget destination', () => {
  const html = `<div data-screenshot="/strips/whatever/screenshots/a.png"></div>`
  for (const t of DEVICE_TARGETS) {
    const r = retargetStripAssets(html, t.folder)
    assert.equal(r.changed, 1)
    assert.ok(r.html.includes(`/strips/${t.folder}/screenshots/a.png`))
  }
})

// --- the title-bar name -----------------------------------------------------

check('a strip path resolves to its device', () => {
  for (const t of DEVICE_TARGETS) {
    assert.equal(deviceForStripPath(`strips/${t.folder}/strip.html`)?.folder, t.folder)
    assert.equal(stripDisplayName(`strips/${t.folder}/strip.html`), t.short)
  }
})

check('every target has a distinct display name', () => {
  const shorts = DEVICE_TARGETS.map((d) => d.short)
  assert.equal(new Set(shorts).size, shorts.length, 'two targets would show the same title')
})

check('a fixture falls back to its filename, never a wrong device', () => {
  assert.equal(deviceForStripPath('composer/test/bio-strip.html'), null)
  assert.equal(stripDisplayName('composer/test/bio-strip.html'), 'bio-strip.html')
})

check('an unknown strips/ folder is not claimed by a device', () => {
  assert.equal(deviceForStripPath('strips/bio/strip.html'), null)
  assert.equal(stripDisplayName('strips/bio/strip.html'), 'strip.html')
})

rmSync(out, { recursive: true, force: true })

if (failures) {
  console.log(`\n${failures} FAILED`)
  process.exit(1)
}
console.log('\nALL PASS')
