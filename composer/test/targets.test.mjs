/**
 * targets.mjs — the size table loads, answers lookups exactly, and refuses a
 * table in which two targets share a panel size.
 *
 * Run: node composer/test/targets.test.mjs
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { TARGETS, TARGET_NAMES, panelFor, targetForSize, validateTargets } from '../targets.mjs'

let failures = 0
const check = (label, cond, detail = '') => {
  if (!cond) { failures += 1; console.log(`FAIL  ${label}${detail ? `  — ${detail}` : ''}`) }
  else console.log(`PASS  ${label}`)
}
const throws = (fn) => { try { fn(); return false } catch { return true } }

check('the file declares at least one target', TARGET_NAMES.length > 0)

// Every target round-trips: its own size finds it, and nothing else.
for (const name of TARGET_NAMES) {
  const { width, height } = TARGETS[name].panel
  check(`${name} is found by its size ${width}x${height}`, targetForSize(width, height) === name)
  check(`${name} is not found one pixel off`, targetForSize(width + 1, height) !== name && targetForSize(width, height - 1) !== name)
  check(`panelFor(${name}) is its panel`, panelFor(name) === TARGETS[name].panel)
}

check('an unknown size is null', targetForSize(1, 1) === null)
check('an unknown name is null', panelFor('no_such_target') === null)
check('an inherited key is not a target', panelFor('toString') === null)

// --- validation -------------------------------------------------------------
const ok = { name: 'A', store: 'S', panel: { width: 100, height: 200 } }
check('a valid table passes', !throws(() => validateTargets({ a: ok })))
check('two targets sharing a size are refused',
  throws(() => validateTargets({ a: ok, b: { ...ok, name: 'B' } })))
check('the same width with a different height is allowed',
  !throws(() => validateTargets({ a: ok, b: { ...ok, panel: { width: 100, height: 300 } } })))
check('a missing panel is refused', throws(() => validateTargets({ a: { name: 'A', store: 'S' } })))
check('a fractional size is refused', throws(() => validateTargets({ a: { ...ok, panel: { width: 100.5, height: 200 } } })))
check('a missing name is refused', throws(() => validateTargets({ a: { store: 'S', panel: ok.panel } })))
check('an empty table is refused', throws(() => validateTargets({})))

// --- the README table -------------------------------------------------------
// The one prose copy of the sizes, kept because it is the npm landing page.
// Rows look like: | `iphone` | 1290 × 2796 | App Store |
const readme = readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '../../README.md'), 'utf8')
const rows = [...readme.matchAll(/^\| `([\w.-]+)` \| (\d+) × (\d+) \| ([^|]+?) \|$/gm)]
  .map((m) => ({ name: m[1], width: Number(m[2]), height: Number(m[3]), store: m[4] }))
check('README.md lists exactly the targets in targets.json, in order',
  JSON.stringify(rows.map((r) => r.name)) === JSON.stringify(TARGET_NAMES),
  `README has ${rows.map((r) => r.name).join(', ') || '(no rows found)'}`)
for (const r of rows) {
  const t = TARGETS[r.name]
  check(`README.md row for ${r.name} matches targets.json`,
    Boolean(t) && t.panel.width === r.width && t.panel.height === r.height && t.store === r.store,
    `README says ${r.width} × ${r.height}, ${r.store}`)
}

console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL PASS')
process.exit(failures ? 1 : 0)
