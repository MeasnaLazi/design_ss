/**
 * Where a run writes, which is not always where you are standing.
 *
 * `strips/` landing in the wrong directory is a failure with no error message:
 * the run succeeds, and the files are somewhere nobody looks. The marker walk
 * prevents that while a project is above you; this file pins what happens when
 * one is not, which is precisely when `--input` gets used.
 *
 * Run: node cli/test/work-root.test.mjs
 */
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { findWorkRoot, markedRoot, resolveRoots, workRootFor } from '../roots.mjs'

let failures = 0
const check = (label, cond, detail = '') => {
  if (!cond) { failures += 1; console.log(`FAIL  ${label}${detail ? `  — ${detail}` : ''}`) }
  else console.log(`PASS  ${label}`)
}

const tmp = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'design-ss-work-root-')))
const project = path.join(tmp, 'project')
const deep = path.join(project, 'a', 'b')
const elsewhere = path.join(tmp, 'elsewhere')
const bare = path.join(tmp, 'bare')
await fs.mkdir(path.join(project, 'input'), { recursive: true })
await fs.mkdir(deep, { recursive: true })
await fs.mkdir(path.join(elsewhere, 'input'), { recursive: true })
await fs.mkdir(bare, { recursive: true })

// --- a project always wins ---------------------------------------------------

const inProject = workRootFor({ cwd: project, inputFlag: path.join(elsewhere, 'input') })
check('a marked project decides, even when --input points somewhere else',
  inProject.workRoot === project && inProject.from === 'marker', JSON.stringify(inProject))
check('...from a subfolder too, as it always has',
  workRootFor({ cwd: deep }).workRoot === project, JSON.stringify(workRootFor({ cwd: deep })))

// --- and only where there is none does the input decide ----------------------

// The case this exists for. `design-ss design --input ~/clients/acme/input` run
// from a home directory used to write strips/ into the home directory.
const byInput = workRootFor({ cwd: bare, inputFlag: path.join(elsewhere, 'input') })
check('with no project anywhere, an explicit --input names its own parent',
  byInput.workRoot === elsewhere && byInput.from === 'input-parent', JSON.stringify(byInput))
check('...and the whole run follows it',
  resolveRoots({ cwd: bare, workRoot: byInput.workRoot, inputFlag: path.join(elsewhere, 'input') }).stripsDir ===
    path.join(elsewhere, 'strips'))
check('a relative --input resolves against where you typed it, not the work root',
  workRootFor({ cwd: elsewhere, inputFlag: './input' }).workRoot === elsewhere)
check('a trailing separator does not shift the answer up a level',
  workRootFor({ cwd: bare, inputFlag: `${path.join(elsewhere, 'input')}${path.sep}` }).workRoot === elsewhere)

// --- the flag, and nothing but the flag --------------------------------------

// DESIGN_SS_INPUT is set by design.mjs for the agent it spawns. If it reached
// this decision, a nested run could move the work root out from under the run
// that started it — mid-build, with files already written to the old one.
const previous = process.env.DESIGN_SS_INPUT
process.env.DESIGN_SS_INPUT = path.join(elsewhere, 'input')
const envOnly = workRootFor({ cwd: bare })
check('the environment variable does not relocate the work root',
  envOnly.workRoot === bare && envOnly.from === 'cwd', JSON.stringify(envOnly))
check('...though it still decides what gets READ, as before',
  resolveRoots({ cwd: bare, workRoot: bare }).inputDir === path.join(elsewhere, 'input'))
if (previous === undefined) delete process.env.DESIGN_SS_INPUT
else process.env.DESIGN_SS_INPUT = previous

// --- nothing about the old behaviour changed ---------------------------------

check('no marker and no flag is still the directory you are in',
  workRootFor({ cwd: bare }).from === 'cwd' && workRootFor({ cwd: bare }).workRoot === bare)
check('findWorkRoot answers exactly as it did: the marked root…',
  findWorkRoot(deep) === project)
check('…or the directory itself when nothing is marked', findWorkRoot(bare) === bare)
check('markedRoot says null rather than guessing', markedRoot(bare) === null, String(markedRoot(bare)))

await fs.rm(tmp, { recursive: true, force: true })

console.log(failures ? `\n${failures} failure(s)` : '\nall green')
process.exit(failures ? 1 : 0)
