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
 *
 * ## And when the pinned revision is not there: Google Chrome
 *
 * Some machines will not keep a downloaded Chromium -- managed company laptops
 * block the download, or security tooling removes it overnight -- while the
 * Google Chrome that IT installed stays put. So the order is: the pinned
 * Chromium first, then the system Chrome (playwright's `channel: 'chrome'`),
 * then refuse.
 *
 * The fallback gives up the thing the rest of this module is about: Chrome
 * updates itself, so its version is whatever is installed today and nothing
 * here pins it, and its headless mode is not chrome-headless-shell, so a PNG
 * can differ slightly from the pinned renderer's. That is why the fallback is
 * never silent -- every command that uses it says so, with the version -- and
 * why the pinned Chromium still wins whenever it is complete.
 *
 * This module only finds the file. Whether Chrome actually starts (an admin
 * policy can disable headless mode or remote debugging) is decided by a launch,
 * in `browser.mjs`.
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
 * Where playwright looks for `channel: 'chrome'`, and nothing else: a Chrome in
 * ~/Applications is not one playwright would launch, so reporting it would be a
 * promise the render cannot keep. Mirrors `_createChromiumChannel("chrome", …)`
 * in playwright-core 1.63.0 -- re-check it when the pin moves.
 */
export function chromeCandidates({ platform = process.platform, env = process.env } = {}) {
  if (platform === 'darwin') return ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']
  if (platform === 'linux') return ['/opt/google/chrome/chrome']
  if (platform === 'win32') {
    const suffix = path.win32.join('Google', 'Chrome', 'Application', 'chrome.exe')
    return [
      env.LOCALAPPDATA, env.PROGRAMFILES, env['PROGRAMFILES(X86)'],
      env.HOMEDRIVE && `${env.HOMEDRIVE}\\Program Files`,
      env.HOMEDRIVE && `${env.HOMEDRIVE}\\Program Files (x86)`,
    ].filter(Boolean).map((prefix) => path.win32.join(prefix, suffix))
  }
  return []
}

/** The system Chrome playwright would launch, or null. A file check, not proof it starts. */
export function chromePath({ platform, env, exists = existsSync } = {}) {
  return chromeCandidates({ platform, env }).find((p) => exists(p)) ?? null
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
    // The fallback when the pinned revision is not complete. See the header.
    chrome: chromePath(),
  }
}

export const WORKS_WITHOUT = `  check, frames, retarget --no-render and editor work without it.`

/**
 * What `design`, `gate`, `render`, `retarget` and the editor's export decide
 * before launching a browser, as a function of one object, so every case can be
 * tested without owning the machine that produces it.
 *
 * `code: null` means go ahead, and `browser` says with what: `'chromium'` (the
 * pinned revision, silent) or `'chrome'` (the fallback, with `lines` saying why
 * the pinned one was passed over -- callers print them every time).
 */
export function browserPreflight(state) {
  const { playwright, rev, registry, present = [], headed, shell, clone, chrome = null } = state ?? {}

  if (!playwright) {
    return {
      code: EXIT.USAGE,
      lines: [
        `playwright is not reachable from this toolkit — reinstall design-ss`,
        `  from a clone:  npm ci`,
      ],
    }
  }
  // No fallback without playwright: it is what drives Chrome too.
  if (headed && shell) return { code: null, browser: 'chromium', lines: [] }

  const ours = (n) => n === `chromium-${rev}` || n === `chromium_headless_shell-${rev}`
  // Only revision directories count as "another revision". A registry can also
  // hold folders with no number -- playwright's own `chromium` symlink, a
  // `.links` dir -- and reporting those produced "this machine has , 1194".
  const isRevision = (n) => /^chromium(_headless_shell)?-\d+$/.test(n)
  const others = present.filter((n) => isRevision(n) && !ours(n))
  const lines = []

  if (!headed && !shell && others.length === 0) {
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

  if (chrome) {
    lines.push(`  rendering with Google Chrome instead: ${chrome}`)
    lines.push(`  its version is not pinned, so output can differ slightly from the pinned Chromium's.`)
  } else {
    lines.push(`  no Google Chrome was found to fall back on either.`)
  }

  // Ordered by what is likely to be true of the reader: in a working copy a
  // stale tree comes first, for an installed user there is only one step.
  if (clone) lines.push(`  node_modules behind package-lock.json?  npm ci      (then no download is needed)`)
  lines.push(`  run:  design-ss design install      (~150 MB, once)${chrome ? '  to render with the pinned Chromium again' : ''}`)

  if (chrome) return { code: null, browser: 'chrome', chrome, lines }
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
  if (pre.browser === 'chrome') {
    // The render went to the fallback and playwright could not find or start
    // it -- Chrome removed or moved between the check and the launch.
    return [
      `that is a browser problem, not a problem with the strip.`,
      `  the pinned Chromium ${state?.rev} is not installed, and Google Chrome at ${pre.chrome} would not start.`,
      `  run:  design-ss design install      (~150 MB, once)`,
    ]
  }
  // Both directories are on disk and it still would not launch: a partial or
  // hand-made install is the only thing left, and only --force replaces it.
  return [
    `that is a browser problem, not a problem with the strip.`,
    `  Chromium ${state?.rev} is on disk but would not launch — the install looks partial.`,
    `  run:  design-ss design install --force`,
  ]
}
