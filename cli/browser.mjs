import { existsSync } from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { EXIT } from './exit-codes.mjs'
import { run } from './proc.mjs'
import { TOOLKIT_ROOT } from './roots.mjs'
import { browserState, browserPreflight, browserAdvice, parseExecutablePath } from './browser-state.mjs'

/**
 * Chromium, as an explicit step -- `design-ss design install`.
 *
 * Two reasons it is not a postinstall, and the second is why it is not an
 * automatic fetch either.
 *
 * It cannot be a postinstall. `npm install -g <a git spec>` symlinks the
 * package into npm's cache and then deletes the target, so the script runs with
 * a working directory that no longer exists: `node scripts/postinstall.mjs`
 * cannot resolve its own relative path and node dies before its first line.
 * Measured on npm 10.9.8 with a seven-line package that has nothing but a bin
 * and a postinstall. Making the script survive is worse, not better -- npm then
 * reports success and leaves the package a dangling symlink.
 *
 * And it is not fetched behind your back. A command that downloads 150 MB
 * because you asked it to render a strip is a command you cannot predict, and
 * it spends the time at the moment you were least expecting to. So the browser
 * follows the same rule as the editor: install is its own step, the commands
 * that need it check and name the missing step, and nothing downloads unasked.
 *
 * Which *revision* is needed is decided by the playwright in this toolkit, and
 * that is why `package.json` pins it exactly rather than with a caret. Under a
 * range, two people installing design-ss a week apart need two different
 * Chromium revisions, and an upgrade silently invalidates a browser the user
 * already downloaded. `browser-state.mjs` explains what that failure looks like.
 */

const say = (msg) => process.stderr.write(`design-ss: ${msg}\n`)

const PLAYWRIGHT_CLI = path.join(TOOLKIT_ROOT, 'node_modules', 'playwright', 'cli.js')

export { browserState, browserPreflight, browserAdvice, parseExecutablePath }

/** Where playwright expects the browser, or null if playwright itself is unreachable. */
export async function chromiumPath() {
  return (await browserState()).exe
}

/**
 * Both binaries of the pinned revision, not "a file exists".
 *
 * The old check was `existsSync(chromium.executablePath())`, which is true for a
 * headed-only install and true for the wrong revision's neighbour directory --
 * so `design install` could print "Chromium ready" at a path that is really
 * there while every render still failed to launch.
 */
export async function hasChromium() {
  const s = await browserState()
  return s.headed && s.shell
}

/** Used by the render paths: true to proceed, false after saying what to run. */
export async function requireChromium() {
  const pre = browserPreflight(await browserState())
  if (pre.code === null) return true
  for (const l of pre.lines) say(l)
  return false
}

/** `design-ss design install` -- the one command in this pipeline allowed to be slow. */
export async function installBrowser({ force = false } = {}) {
  const before = await browserState()
  if (before.headed && before.shell && !force) {
    say(`Chromium ${before.rev} is already installed at ${before.registry}`)
    say(`reinstall it with: design-ss design install --force`)
    return EXIT.OK
  }
  // Say what is about to change before it changes: on a revision mismatch the
  // number in the error is not the number being fetched, and that is confusing
  // to watch in silence.
  if (before.playwright && before.present.length && !(before.headed && before.shell)) {
    say(`this toolkit's playwright wants Chromium ${before.rev}; ${before.registry} has ${before.present.join(', ')}`)
  }

  const skip = process.env.PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD
  if (skip && skip !== '0') {
    say(`PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD is set — not fetching anything.`)
    say(`  unset it, or install the browser yourself: npx playwright install chromium`)
    return EXIT.USAGE
  }

  // A plain file check, not require.resolve: playwright's exports map does not
  // publish every internal path (browsers.json already taught us that), and the
  // CLI is only ever invoked by path anyway.
  if (!existsSync(PLAYWRIGHT_CLI)) {
    say(`playwright is not installed in ${TOOLKIT_ROOT} — reinstall design-ss`)
    return EXIT.USAGE
  }

  say(`fetching Chromium ${before.rev ?? ''} (~150 MB, once)`.replace(/\s+/g, ' '))
  // playwright's own CLI, by path rather than through npx: this runs with the
  // work root as its cwd, where `playwright` does not resolve.
  const r = await run(process.execPath, [PLAYWRIGHT_CLI, 'install', 'chromium'], { cwd: TOOLKIT_ROOT })

  // The exit code is playwright's self-report; the file on disk is the fact --
  // and a file on disk is still not proof that a headless launch works. Only a
  // launch is, so this is the one place that pays the second for it. It is also
  // the only check that covers the half of the install executablePath() cannot
  // name: chrome-headless-shell.
  const after = await browserState()
  const launched = after.headed && after.shell ? await canLaunch() : { ok: false, error: 'binaries missing' }
  if (r.code !== 0 || !launched.ok) {
    say(`could not install Chromium${r.code === 0 ? ' (playwright reported success)' : ` (exited ${r.code})`}`)
    if (launched.error) say(`  ${launched.error}`)
    say(`  PLAYWRIGHT_BROWSERS_PATH decides where it lands, if this machine keeps browsers elsewhere.`)
    return EXIT.USAGE
  }
  say(`Chromium ${after.rev} ready at ${after.registry} (launched headless once to prove it)`)
  return EXIT.OK
}

/** The only statement about a browser that cannot be a self-report. */
async function canLaunch() {
  try {
    const { chromium } = createRequire(path.join(TOOLKIT_ROOT, 'package.json'))('playwright')
    const browser = await chromium.launch()
    await browser.close()
    return { ok: true, error: null }
  } catch (error) {
    return { ok: false, error: String(error?.message ?? error).split('\n')[0] }
  }
}

