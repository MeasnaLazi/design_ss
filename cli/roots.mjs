import path from 'node:path'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

/**
 * Two roots, and the rule between them is: READ FROM ANYWHERE, WRITE WHERE YOU ARE.
 *
 *   toolkitRoot  where design-ss is installed: composer/, fonts, frame packs,
 *                the skill. Read-only as far as a run is concerned.
 *   workRoot     the project being worked on. Everything a run writes lands
 *                here -- strips/ and .design-ss/ -- and nowhere else.
 *
 * Input is the one thing that may live outside both, because it is the only
 * thing a run reads and never writes: a pinned clone of another repo, a
 * read-only mount, a folder a build step just fetched. Hence --input and no
 * --output. `cd` is the --output flag -- with one narrow exception, in
 * {@link workRootFor}: where there is no project to cd into, an explicit
 * --input names its own parent rather than letting strips/ land in whatever
 * directory you happened to be standing in.
 */
export const TOOLKIT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const MARKERS = ['design-ss.config.json', 'input']

/**
 * The nearest ancestor holding a marker, or null when there is none.
 *
 * Split out from {@link findWorkRoot} because "found a project" and "gave up and
 * used the cwd" were indistinguishable in its return value, and the difference
 * is exactly what {@link workRootFor} needs to decide on.
 */
export function markedRoot(from = process.cwd()) {
  let dir = path.resolve(from)
  for (;;) {
    if (MARKERS.some((m) => existsSync(path.join(dir, m)))) return dir
    const parent = path.dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
}

/**
 * Found the way git finds a repository -- walk up for a marker -- so running
 * from a subfolder writes to the project root instead of scattering a strips/
 * directory wherever you happened to be standing.
 */
export function findWorkRoot(from = process.cwd()) {
  return markedRoot(from) ?? path.resolve(from)
}

/**
 * Where a run writes, when an explicit `--input` was named.
 *
 * The marker walk above stops `strips/` from landing wherever you were standing
 * -- but only while a marker is somewhere above you, and `--input` is used
 * precisely when it is not. `design-ss design --input ~/clients/acme/input` from
 * a home directory used to read from the client's folder and write `strips/`
 * into `~`. Measured, not imagined: from `/tmp` it wrote `/tmp/strips`.
 *
 * So: **a marked project always wins**, and only when there is none does an
 * explicit input decide, by naming its own parent. That keeps `roots.mjs`'s rule
 * -- `cd` is the `--output` flag -- true wherever a project exists, and gives an
 * answer nobody has to guess at where one does not.
 *
 * Deliberately the *flag* only, never `DESIGN_SS_INPUT` and never the config's
 * `paths.input`. The environment variable is set by `design.mjs` for the agent
 * it spawns, so honouring it here would let a nested run relocate the work root
 * out from under the run that spawned it; a configured path is already relative
 * to a work root, so using it to find one would be circular.
 */
export function workRootFor({ cwd = process.cwd(), inputFlag = null } = {}) {
  const marked = markedRoot(cwd)
  if (marked) return { workRoot: marked, from: 'marker' }
  if (inputFlag) return { workRoot: path.dirname(path.resolve(cwd, inputFlag)), from: 'input-parent' }
  return { workRoot: path.resolve(cwd), from: 'cwd' }
}

/** --input > DESIGN_SS_INPUT > config paths.input > <workRoot>/input */
export function resolveRoots({ cwd = process.cwd(), workRoot = null, inputFlag = null, config = null } = {}) {
  workRoot = workRoot ?? findWorkRoot(cwd)
  const flag = inputFlag || process.env.DESIGN_SS_INPUT || null
  const configured = config?.paths?.input || null
  const inputDir = flag
    ? path.resolve(cwd, flag)                       // a flag is relative to where you typed it
    : configured
      ? path.resolve(workRoot, configured)          // config is relative to the project
      : path.join(workRoot, 'input')
  return {
    toolkitRoot: TOOLKIT_ROOT,
    workRoot,
    inputDir,
    stripsDir: path.join(workRoot, 'strips'),
    stateDir: path.join(workRoot, '.design-ss'),
  }
}

/**
 * A target is one folder directly under strips/.
 *
 * The name is joined into paths that are read, written and -- in the clean step
 * -- deleted recursively, so `..` would clean the work root and `.` every strip.
 * Resolving and comparing, rather than matching a character class, refuses
 * exactly the names that leave strips/ and nothing else.
 */
export function isTarget(roots, target) {
  const dir = path.resolve(roots.stripsDir, String(target))
  return path.dirname(dir) === path.resolve(roots.stripsDir) && path.basename(dir) === String(target)
}

/** Where a target's strip lives, and the label the checker infers the target from. */
export const stripPath = (roots, target) => path.join(roots.stripsDir, target, 'strip.html')
export const stripLabel = (target) => path.join('strips', target, 'strip.html')
