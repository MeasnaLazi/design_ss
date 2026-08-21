/**
 * pick-frame.mjs — the catalogue reading, and the one property the random pick
 * must hold.
 *
 * The pick itself is `Math.random()`, so there is nothing to assert about which
 * id comes back. What is worth asserting is that it is always a member of the
 * matching set and never leaks a pack of another type — the failure that would
 * put an iPad body in an iPhone strip, which renders and says nothing.
 *
 * Run: node composer/test/pick-frame.test.mjs
 */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { packsFromCatalogue, packsForTarget, readCatalogue } from '../pick-frame.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const SCRIPT = path.join(HERE, '..', 'pick-frame.mjs')

let failures = 0
const check = (label, cond, detail = '') => {
  if (!cond) { failures += 1; console.log(`FAIL  ${label}${detail ? `  — ${detail}` : ''}`) }
  else console.log(`PASS  ${label}`)
}

// --- catalogue parsing ------------------------------------------------------
// The id is the folder, taken from `path`, because the folder is what
// `data-pack` names — not `name`, which is prose for the editor's dropdown.
const fixture = {
  devices: [
    { name: 'iPhone 12 Pro', type: 'iphone', path: '/device-frames/iphone_12_pro/frame.json' },
    { name: 'iPhone 15 Pro', type: 'iphone', path: '/device-frames/iphone_15_pro/frame.json' },
    { name: 'iPad 13 Pro', type: 'ipad', path: '/device-frames/ipad_13_pro/frame.json' },
    { name: 'broken', type: 'iphone' },
  ],
}
const parsed = packsFromCatalogue(fixture)
check('the id comes from the folder in `path`', parsed[0].id === 'iphone_12_pro', parsed[0].id)
check('an entry with no path is dropped rather than becoming undefined', parsed.length === 3, String(parsed.length))
check('filtering by target is exact', packsForTarget(parsed, 'iphone').length === 2)
check('a target with no packs gives an empty set, not a fallback',
  packsForTarget(parsed, 'tablet').length === 0)

// --- the real catalogue -----------------------------------------------------
const real = await readCatalogue()
check('every pack in the repo catalogue has an id and a type',
  real.every((p) => p.id && p.type), JSON.stringify(real))

// --- the pick ---------------------------------------------------------------
const types = [...new Set(real.map((p) => p.type))]
for (const type of types) {
  const allowed = new Set(packsForTarget(real, type).map((p) => p.id))
  const seen = new Set()
  for (let i = 0; i < 40; i++) {
    seen.add(execFileSync(process.execPath, [SCRIPT, type], { encoding: 'utf8' }).trim())
  }
  check(`every pick for "${type}" is a pack of that type`,
    [...seen].every((id) => allowed.has(id)), [...seen].join(', '))
  if (allowed.size > 1) {
    check(`"${type}" has ${allowed.size} packs and the pick actually varies`,
      seen.size > 1, `40 runs returned only ${[...seen].join(', ')}`)
  }
}

// --- failure is loud --------------------------------------------------------
let threw = false
try {
  execFileSync(process.execPath, [SCRIPT, 'watch'], { encoding: 'utf8', stdio: 'pipe' })
} catch (e) {
  threw = true
  check('an unknown target names the types that do exist',
    String(e.stderr).includes('no frame pack has type "watch"') && String(e.stderr).includes('iphone'),
    String(e.stderr).trim())
}
check('an unknown target exits non-zero', threw)

// --- --list -----------------------------------------------------------------
const listed = execFileSync(process.execPath, [SCRIPT, 'iphone', '--list'], { encoding: 'utf8' })
  .trim().split('\n').map((l) => l.split('\t')[0])
check('--list returns every pack of the type', listed.length === packsForTarget(real, 'iphone').length,
  listed.join(', '))

assert.ok(real.length > 0, 'the catalogue must not be empty')
console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`)
process.exit(failures ? 1 : 0)
