/**
 * targets.mjs — the size table loads, answers lookups exactly, and refuses a
 * table in which two targets share a panel size.
 *
 * Run: node composer/test/targets.test.mjs
 */
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

console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL PASS')
process.exit(failures ? 1 : 0)
