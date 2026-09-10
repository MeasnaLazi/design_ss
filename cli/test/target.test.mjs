/**
 * --target names one folder under strips/, and nothing else.
 *
 * The name is joined into a path the clean step deletes recursively, before the
 * agent even starts. `design-ss design --target ..` used to remove the whole
 * work root, .git included. The rule is asserted, and so is the delete itself:
 * a file beside strips/ must survive a clean aimed outside it.
 *
 * Run: node cli/test/target.test.mjs
 */
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { isTarget, resolveRoots } from '../roots.mjs'
import { cleanOutput, exists } from '../gate.mjs'

let failures = 0
const check = (label, cond) => {
  if (!cond) { failures += 1; console.log(`FAIL  ${label}`) }
  else console.log(`PASS  ${label}`)
}

const workRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'design-ss-target-'))
const roots = resolveRoots({ workRoot })

try {
  // Every real target, and a name a project might plausibly choose.
  for (const t of ['iphone', 'ipad', 'phone', 'tablet_7', 'tablet_10', 'my.app']) {
    check(`accepts ${t}`, isTarget(roots, t))
  }

  // Everything that resolves somewhere other than one folder under strips/.
  for (const t of ['..', '.', '../..', 'a/b', 'iphone/', 'x/../iphone', path.join(roots.stripsDir, 'iphone')]) {
    check(`refuses ${JSON.stringify(t)}`, !isTarget(roots, t))
  }

  await fs.mkdir(path.join(roots.stripsDir, 'iphone'), { recursive: true })
  await fs.writeFile(path.join(workRoot, 'keep.txt'), 'must survive')

  let threw = false
  try { await cleanOutput(roots, '..') } catch { threw = true }
  check('cleanOutput refuses ..', threw)
  check('the work root survives a clean aimed at ..', await exists(path.join(workRoot, 'keep.txt')))

  await cleanOutput(roots, 'iphone')
  check('a real target is still cleaned', !await exists(path.join(roots.stripsDir, 'iphone')))
} finally {
  await fs.rm(workRoot, { recursive: true, force: true })
}

console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL PASS')
process.exit(failures ? 1 : 0)
