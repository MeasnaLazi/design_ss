/**
 * The editor's block templates must satisfy `composer/strip-schema.md`.
 *
 * `schema.ts` and the schema document are two encodings of one contract, and
 * they have drifted before: the document required a `framesRoot` line that the
 * editor's blank-strip template had already stopped writing. Nothing caught it,
 * because nothing connected them.
 *
 * This does. Every block the editor can insert is dropped into the *document's
 * own skeleton* and run through the same structural checker the agent uses, so
 * a change to either side that breaks the other fails here.
 *
 * Run: node test/schema-contract.test.mjs   (from strip_editor/)
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

// --- compile schema.ts so the real templates are exercised, not a copy -------
const out = mkdtempSync(path.join(tmpdir(), 'schema-contract-'))
try {
  execFileSync(
    process.execPath,
    [
      path.join(EDITOR, 'node_modules/typescript/bin/tsc'),
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
  // tsc exits non-zero on type errors it still emitted through; only a missing
  // output file is fatal here.
  if (!e.stdout?.toString().includes('error TS')) throw e
}

const { blockTemplate, blankStripTemplate, IMAGE_PLACEHOLDER_SRC } = await import(
  path.join(out, 'schema.js')
)
const { checkStrip } = await import(path.join(REPO, 'composer/check-schema.mjs'))

// --- the document's skeleton, as the single source of document shape --------
const doc = readFileSync(path.join(REPO, 'composer/strip-schema.md'), 'utf8')
const skeleton = [...doc.matchAll(/```html\n([\s\S]*?)```/g)]
  .map((m) => m[1])
  .find((b) => b.includes('<!doctype html>'))
assert.ok(skeleton, 'composer/strip-schema.md must contain a full-document example')

/** Put `markup` alone in panel 0 of the skeleton. */
function documentWith(markup) {
  const emptied = skeleton.replace(
    /(<section class="panel" data-panel="0">)[\s\S]*?(<\/section>)/,
    `$1\n${markup}\n  $2`,
  )
  assert.notEqual(emptied, skeleton, 'failed to substitute panel 0')
  return emptied
}

let failures = 0
const check = async (label, html, { allowWarnings = [] } = {}) => {
  const { errors, warnings } = await checkStrip(html, label)
  const unexpected = warnings.filter((w) => !allowWarnings.some((a) => w.includes(a)))
  if (errors.length || unexpected.length) {
    failures += 1
    console.log(`FAIL  ${label}`)
    for (const e of errors) console.log(`        error: ${e}`)
    for (const w of unexpected) console.log(`        warn:  ${w}`)
  } else {
    console.log(`PASS  ${label}`)
  }
}

// --- every insertable block --------------------------------------------------
const at = { left: 120, top: 240 }
for (const role of ['title', 'subtitle', 'caption']) {
  await check(`blockTemplate text/${role}`, documentWith(blockTemplate({ kind: 'text', role, ...at })))
}
await check(
  'blockTemplate device',
  documentWith(blockTemplate({ kind: 'device', ...at, screenshot: undefined })),
)
await check(
  'blockTemplate image (placeholder)',
  // The placeholder warning is the point of the placeholder, not a defect.
  documentWith(blockTemplate({ kind: 'image', ...at })),
  { allowWarnings: ['still shows the editor placeholder'] },
)
await check('blockTemplate decor', documentWith(blockTemplate({ kind: 'decor', ...at })))

// --- the blank strip the editor creates from "New strip" --------------------
await check(
  'blankStripTemplate',
  blankStripTemplate('Contract test', 2, 1290, 2796),
  { allowWarnings: ['no layer blocks found'] },
)

// --- the placeholder it references must exist -------------------------------
const placeholderPath = path.join(REPO, IMAGE_PLACEHOLDER_SRC.replace(/^\/+/, ''))
assert.ok(readFileSync(placeholderPath).length > 0, `${IMAGE_PLACEHOLDER_SRC} must exist in the repo`)
console.log(`PASS  ${IMAGE_PLACEHOLDER_SRC} resolves on disk`)

rmSync(out, { recursive: true, force: true })
console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`)
process.exit(failures ? 1 : 0)
