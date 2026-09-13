import { existsSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { EXIT } from './exit-codes.mjs'

/**
 * What Chromium is on this machine, and whether it is the one *this* playwright
 * asks for.
 *
 * A leaf module on purpose -- node builtins and the exit codes, nothing that
 * spawns a process -- because `strip_editor/vite-plugin-editor-api.ts` imports
 * it to preflight the Export button. `browser.mjs` re-exports all of it, so CLI
 * callers see one module as before.
 *
 * ## Why a revision and not a boolean
 *
 * Every playwright release pins one Chromium revision and looks for it in a
 * directory named after it: `chromium-1243`, not `chromium`. So a machine can
 * have a complete, working Chromium and still fail to launch -- which is what
 * "Executable doesn't exist at .../chromium_headless_shell-1228" means. The
 * number is not corrupt and the folder is not misnamed: it is a *different
 * playwright's* revision. Until this module existed, the CLI could only say
 * "none" or "ready" and the user was left to work that out from a stack trace.
 *
 * The revision is read out of `chromium.executablePath()` rather than from
 * `playwright-core/browsers.json`: the manifest is not published in that
 * package's exports map (`ERR_PACKAGE_PATH_NOT_EXPORTED` on 1.61.1), while
 * executablePath() is public API and encodes both facts we need --
 * `<registry>/chromium-<revision>/<platform>/<binary>`.
 */

const DEFAULT_TOOLKIT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/** `<registry>/chromium-1243/chrome-mac/…` → `{ registry, rev }`, or null if that layout ever changes. */
export function parseExecutablePath(exe) {
  if (!exe) return null
  const parts = String(exe).split(path.sep)
  const i = parts.findIndex((p) => /^chromium-\d+$/.test(p))
  if (i <= 0) return null
  return { registry: parts.slice(0, i).join(path.sep), rev: parts[i].slice('chromium-'.length) }
}

/**
 * Resolution is anchored to an explicit toolkit root, never to this file's own
 * location. The editor loads this module through Vite, which bundles the config
 * graph into a temp file elsewhere on disk; `createRequire(import.meta.url)`
 * would then resolve playwright from the wrong `node_modules` and report "no
 * playwright" on a machine that has one.
 */
export async function browserState({ toolkitRoot = DEFAULT_TOOLKIT_ROOT } = {}) {
  let exe = null
  try {
    exe = createRequire(path.join(toolkitRoot, 'package.json'))('playwright').chromium.executablePath()
  } catch { /* playwright is not reachable from this toolkit */ }

  const parsed = parseExecutablePath(exe)
  const rev = parsed?.rev ?? null
  const registry = parsed?.registry ?? null
  const present = registry && existsSync(registry)
    ? readdirSync(registry).filter((n) => n.startsWith('chromium')).sort()
    : []

  return {
    playwright: Boolean(exe),
    exe,
    rev,
    registry,
    present,
    headed: Boolean(exe) && existsSync(exe),
    // Headless launches through a *second* binary -- chrome-headless-shell, in
    // its own revision directory -- and executablePath() names the headed one.
    // Checked by directory, because the binary's name is platform-specific and
    // the directory's is not. Cheap, and still only a file check: the proof
    // that a launch works is a launch, which `design install` now performs.
    shell: Boolean(rev) && Boolean(registry) && existsSync(path.join(registry, `chromium_headless_shell-${rev}`)),
    // A published tarball carries no root package-lock.json (npm strips it), so
    // one being here means this is a working copy -- where a stale node_modules
    // is the likelier cause than a missing download.
    clone: existsSync(path.join(toolkitRoot, 'package-lock.json')),
  }
}

const WORKS_WITHOUT = `  check, frames, retarget --no-render and editor work without it.`

/**
 * What `design`, `gate`, `render`, `retarget` and the editor's export decide
 * before launching a browser, as a function of one object, so every case can be
 * tested without owning the machine that produces it.
 */
export function browserPreflight(state) {
  const { playwright, rev, registry, present = [], headed, shell, clone } = state ?? {}

  if (!playwright) {
    return {
      code: EXIT.USAGE,
      lines: [
        `playwright is not reachable from this toolkit — reinstall design-ss`,
        `  from a clone:  npm ci`,
      ],
    }
  }
  if (headed && shell) return { code: null, lines: [] }

  const ours = (n) => n === `chromium-${rev}` || n === `chromium_headless_shell-${rev}`
  const others = present.filter((n) => !ours(n))
  const lines = []

  if (present.length === 0) {
    lines.push(`the renderer needs Chromium ${rev} and this machine has none`)
  } else if (others.length && !headed && !shell) {
    // The case that reads like a bug and is not: a complete install of the
    // wrong revision. Name both numbers, because the difference between them
    // is the entire diagnosis.
    lines.push(`the renderer needs Chromium ${rev} and this machine has ${others.map((n) => n.replace(/^chromium[-_]?(headless_shell-)?/, '')).filter((v, i, a) => a.indexOf(v) === i).join(', ')}`)
    lines.push(`  a revision mismatch, not a missing download: the playwright in this toolkit decides the number.`)
  } else {
    lines.push(`the Chromium ${rev} install is incomplete — ${headed ? 'the headless shell is missing' : 'the browser binary is missing'}`)
    lines.push(`  headless renders through chrome-headless-shell, a second binary in its own revision directory.`)
  }

  if (registry) lines.push(`  cache: ${registry}${present.length ? `  (${present.join(', ')})` : ''}`)
  if (process.env.PLAYWRIGHT_BROWSERS_PATH) {
    lines.push(`  PLAYWRIGHT_BROWSERS_PATH=${process.env.PLAYWRIGHT_BROWSERS_PATH} — the install and this run must agree on it.`)
  }

  // Ordered by what is likely to be true of the reader: in a working copy a
  // stale tree comes first, for an installed user there is only one step.
  if (clone) lines.push(`  node_modules behind package-lock.json?  npm ci      (then no download is needed)`)
  lines.push(`  run:  design-ss design install      (~150 MB, once)`)
  lines.push(WORKS_WITHOUT)

  return { code: EXIT.USAGE, lines }
}

/**
 * Translate a launch failure that playwright words as a bug into the step that
 * fixes it. Takes the state so the message can name the revisions rather than
 * guess; pure, so the wording is tested without a machine.
 */
export function browserAdvice(output, state) {
  if (!/Executable doesn't exist|playwright install/i.test(String(output ?? ''))) return []
  const pre = browserPreflight(state)
  if (pre.code !== null) {
    return [`that is a browser problem, not a problem with the strip.`, ...pre.lines]
  }
  // Both directories are on disk and it still would not launch: a partial or
  // hand-made install is the only thing left, and only --force replaces it.
  return [
    `that is a browser problem, not a problem with the strip.`,
    `  Chromium ${state?.rev} is on disk but would not launch — the install looks partial.`,
    `  run:  design-ss design install --force`,
  ]
}
