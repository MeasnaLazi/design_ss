/**
 * The stub writes a strip every target can gate: the right panel size from
 * composer/targets.json, a frame pack of the target's own type, and a clean
 * schema check. It used to leave the iPhone pack and size in every folder, so
 * `design --agent stub --target ipad` failed the gate.
 *
 * Run: node cli/test/stub-agent.test.mjs
 */
import { execFileSync } from 'node:child_process'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { TARGET_NAMES, TARGETS } from '../../composer/targets.mjs'
import { readCatalogue } from '../../composer/pick-frame.mjs'
import { checkStrip } from '../../composer/check-schema.mjs'
import { detectPanelSize } from '../retarget.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const TOOLKIT = path.resolve(HERE, '../..')
const STUB = path.join(TOOLKIT, 'cli/stub-agent.mjs')

let failures = 0
const check = (label, cond, detail = '') => {
  if (!cond) { failures += 1; console.log(`FAIL  ${label}${detail ? `  — ${detail}` : ''}`) }
  else console.log(`PASS  ${label}`)
}

const typeOf = new Map((await readCatalogue()).map((p) => [p.id, p.type]))
const work = await fs.mkdtemp(path.join(os.tmpdir(), 'design-ss-stub-'))
const stripsDir = path.join(work, 'strips')

const runStub = (target) => execFileSync(process.execPath, [STUB, target], {
  cwd: work,
  stdio: 'pipe',
  env: { ...process.env, STUB_MODE: 'ok', DESIGN_SS_TOOLKIT_ROOT: TOOLKIT, DESIGN_SS_OUTPUT: stripsDir },
})

try {
  for (const target of TARGET_NAMES) {
    runStub(target)
    const html = await fs.readFile(path.join(stripsDir, target, 'strip.html'), 'utf8')
    const want = TARGETS[target].panel
    const got = detectPanelSize(html)
    check(`${target}: panel is ${want.width}x${want.height}`,
      got?.w === want.width && got?.h === want.height, `got ${got ? `${got.w}x${got.h}` : 'none'}`)

    const packs = [...new Set([...html.matchAll(/data-pack="([^"]*)"/g)].map((m) => m[1]))]
    check(`${target}: every frame pack is type ${target}`,
      packs.length > 0 && packs.every((id) => typeOf.get(id) === target), `packs ${packs.join(', ')}`)

    const res = await checkStrip(html, `strips/${target}/strip.html`)
    check(`${target}: schema check is clean`, res.errors.length === 0, res.errors.join(' | '))
  }

  // A folder name targets.json does not list keeps the fixture as it is.
  runStub('my.app')
  const custom = detectPanelSize(await fs.readFile(path.join(stripsDir, 'my.app', 'strip.html'), 'utf8'))
  check('an unlisted target keeps the fixture size', custom?.w === TARGETS.iphone.panel.width && custom?.h === TARGETS.iphone.panel.height,
    `got ${custom ? `${custom.w}x${custom.h}` : 'none'}`)
} finally {
  await fs.rm(work, { recursive: true, force: true })
}

console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL PASS')
process.exit(failures ? 1 : 0)
