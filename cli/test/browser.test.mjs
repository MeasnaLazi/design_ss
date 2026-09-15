/**
 * Where Chromium comes from. The interesting part is not the download, it is
 * the decision -- and the decision is about a *revision*, not a boolean.
 *
 * Run: node cli/test/browser.test.mjs
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { browserPreflight, browserAdvice, parseExecutablePath, browserArgs } from '../browser.mjs'
import { chromeCandidates, chromePath } from '../browser-state.mjs'

let failures = 0
const check = (label, cond, detail = '') => {
  if (!cond) { failures += 1; console.log(`FAIL  ${label}${detail ? `  — ${detail}` : ''}`) }
  else console.log(`PASS  ${label}`)
}

const sep = path.sep
const state = (over = {}) => ({
  playwright: true,
  exe: `${sep}cache${sep}ms-playwright${sep}chromium-1243${sep}chrome-mac${sep}Chromium`,
  rev: '1243',
  registry: `${sep}cache${sep}ms-playwright`,
  present: ['chromium-1243', 'chromium_headless_shell-1243'],
  headed: true,
  shell: true,
  clone: false,
  ...over,
})

check('a complete install of the pinned revision lets the render proceed',
  browserPreflight(state()).code === null)

// The same rule the editor follows: the command that needs the thing never
// installs it. A render that quietly downloads 150 MB is a render you cannot
// predict, and it spends the time when you were least expecting to.
const missing = browserPreflight(state({ present: [], headed: false, shell: false }))
check('a missing browser stops the render rather than fetching one', missing.code === 2, `got ${missing.code}`)
check('...and names the command that fixes it',
  missing.lines.join(' ').includes('design-ss design install'), missing.lines.join(' | '))
check('...and says what still works without a browser',
  /check.*frames.*retarget --no-render/.test(missing.lines.join(' ')), missing.lines.join(' | '))

// The failure this module exists for. A complete, working Chromium of the WRONG
// revision is indistinguishable from a missing one to `existsSync`, and
// playwright words it as "Executable doesn't exist at .../chromium_headless_
// shell-1228" -- a number the user never chose, on a machine whose cache
// plainly contains a chromium folder. The diagnosis is the difference between
// the two numbers, so both have to be in the message.
const mismatch = browserPreflight(state({
  present: ['chromium-1228', 'chromium_headless_shell-1228'], headed: false, shell: false,
}))
check('a wrong-revision cache is reported as a mismatch, not as "none"',
  /mismatch/i.test(mismatch.lines.join(' ')), mismatch.lines.join(' | '))
check('...and names both revisions',
  mismatch.lines.join(' ').includes('1243') && mismatch.lines.join(' ').includes('1228'),
  mismatch.lines.join(' | '))
// A registry can hold folders with no revision number (a plain `chromium`
// symlink); they are not "another revision" and must not become an empty name.
const unnumbered = browserPreflight(state({
  present: ['chromium', 'chromium-1194', 'chromium_headless_shell-1194'], headed: false, shell: false,
}))
check('an unnumbered chromium folder is not listed as a revision',
  unnumbered.lines[0] === 'the renderer needs Chromium 1243 and this machine has 1194', unnumbered.lines[0])
check('a registry with only unnumbered folders reads as none, not as incomplete',
  /has none/.test(browserPreflight(state({ present: ['chromium'], headed: false, shell: false })).lines[0]))

check('...and names the directory it looked in',
  mismatch.lines.join(' ').includes(`${sep}cache${sep}ms-playwright`), mismatch.lines.join(' | '))

// In a working copy the likelier cause is a node_modules behind the lockfile,
// and npm ci needs no download at all -- so it goes first, and only there. A
// published tarball carries no root lockfile, which is what `clone` reads.
check('a working copy is told about npm ci first',
  browserPreflight(state({ present: [], headed: false, shell: false, clone: true }))
    .lines.findIndex((l) => l.includes('npm ci')) <
  browserPreflight(state({ present: [], headed: false, shell: false, clone: true }))
    .lines.findIndex((l) => l.includes('design-ss design install')))
check('an installed toolkit is not', !mismatch.lines.join(' ').includes('npm ci'), mismatch.lines.join(' | '))

// A present executablePath() is not proof the render can launch: playwright runs
// headless through chrome-headless-shell, a second binary in its own revision
// directory. The old check tested only the headed one, so `design install` could
// print "Chromium ready" while every render failed.
const halfInstalled = browserPreflight(state({ present: ['chromium-1243'], shell: false }))
check('a headed-only install does not pass as ready', halfInstalled.code === 2)
check('...and is named as incomplete rather than missing',
  /incomplete/.test(halfInstalled.lines.join(' ')) && /headless shell/.test(halfInstalled.lines.join(' ')),
  halfInstalled.lines.join(' | '))

check('no playwright at all is a reinstall, not a download',
  /reinstall design-ss/.test(browserPreflight(state({ playwright: false })).lines.join(' ')))

// The revision is read out of the executable path rather than browsers.json:
// that file is not in playwright-core's exports map (ERR_PACKAGE_PATH_NOT_
// EXPORTED on 1.61.1), and executablePath() is public API.
const parsed = parseExecutablePath(state().exe)
check('the revision and the cache directory come out of the executable path',
  parsed?.rev === '1243' && parsed?.registry === `${sep}cache${sep}ms-playwright`, JSON.stringify(parsed))
check('an unrecognised layout degrades to null rather than guessing',
  parseExecutablePath('/somewhere/else/chrome') === null)

check('a launch failure is translated into the fix',
  browserAdvice("browserType.launch: Executable doesn't exist at .../chrome-headless-shell",
    state({ present: ['chromium-1228'], headed: false, shell: false }))
    .join(' ').includes('design-ss design install'))
check('...and --force is reserved for the case the files are all there',
  browserAdvice("browserType.launch: Executable doesn't exist at .../chrome-headless-shell", state())
    .join(' ').includes('design-ss design install --force'))
check('a real strip failure is left alone',
  browserAdvice('{"ok":false,"problems":[{"level":"error","message":"panel 2 overflows"}]}', state()).length === 0)

// ---- Google Chrome, when the pinned Chromium is not there -------------------
//
// Managed machines block the download or remove it overnight while the Chrome IT
// installed stays. The pinned revision still wins; Chrome is the fallback, and
// never a silent one: its version is not pinned and its headless mode is not
// chrome-headless-shell.
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

check('a complete pinned Chromium wins even when Chrome is installed',
  browserPreflight(state({ chrome: CHROME })).browser === 'chromium')
check('...and says nothing about it',
  browserPreflight(state({ chrome: CHROME })).lines.length === 0)

const fallback = browserPreflight(state({ present: [], headed: false, shell: false, chrome: CHROME }))
check('a missing Chromium with Chrome on disk proceeds with Chrome',
  fallback.code === null && fallback.browser === 'chrome', JSON.stringify(fallback))
check('...and still says why Chromium was passed over, and where Chrome is',
  /needs Chromium 1243/.test(fallback.lines.join(' ')) && fallback.lines.join(' ').includes(CHROME),
  fallback.lines.join(' | '))
check('...and that its output is not pinned',
  /not pinned/.test(fallback.lines.join(' ')), fallback.lines.join(' | '))
check('...and how to get the pinned renderer back',
  fallback.lines.join(' ').includes('design-ss design install'), fallback.lines.join(' | '))

const mismatchChrome = browserPreflight(state({
  present: ['chromium-1228', 'chromium_headless_shell-1228'], headed: false, shell: false, chrome: CHROME,
}))
check('a revision mismatch falls back too, and keeps its diagnosis',
  mismatchChrome.browser === 'chrome' && /mismatch/i.test(mismatchChrome.lines.join(' ')),
  mismatchChrome.lines.join(' | '))
check('a half install falls back too, and names the missing half',
  /headless shell is missing/.test(browserPreflight(state({ present: ['chromium-1243'], shell: false, chrome: CHROME })).lines.join(' ')))

check('no playwright means no fallback: playwright is what drives Chrome',
  browserPreflight(state({ playwright: false, chrome: CHROME })).code === 2)
check('with neither browser, the refusal says Chrome was looked for',
  /no Google Chrome/.test(missing.lines.join(' ')), missing.lines.join(' | '))

check('the renderer is told chrome only for the fallback',
  browserArgs('chrome').join(' ') === '--browser chrome' && browserArgs('chromium').length === 0)

check('a Chrome that would not start is not advised as a partial Chromium',
  !browserAdvice(`Chromium distribution 'chrome' is not found at ${CHROME}\nRun "npx playwright install chrome"`,
    state({ present: [], headed: false, shell: false, chrome: CHROME })).join(' ').includes('--force'))

// Where playwright itself looks for channel 'chrome' -- and only there.
check('macOS: only /Applications, as playwright does',
  chromeCandidates({ platform: 'darwin' }).join() === CHROME)
check('linux: /opt/google/chrome/chrome',
  chromeCandidates({ platform: 'linux' }).join() === '/opt/google/chrome/chrome')
const win = chromeCandidates({ platform: 'win32', env: { LOCALAPPDATA: 'C:\\Users\\me\\AppData\\Local', PROGRAMFILES: 'C:\\Program Files' } })
check('windows: LOCALAPPDATA before PROGRAMFILES, unset ones skipped',
  win.length === 2 && win[0] === 'C:\\Users\\me\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe', JSON.stringify(win))
check('the first candidate that exists is the answer; none is null',
  chromePath({ platform: 'darwin', exists: () => true }) === CHROME &&
  chromePath({ platform: 'darwin', exists: () => false }) === null)

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'))

// Which Chromium revision design-ss needs must be a property of the design-ss
// VERSION, not of the day someone installed it. npm strips the root lockfile
// from a published tarball, so for every installed user this range is the only
// thing that decides their playwright -- under ^, two people installing a week
// apart need two different browsers and an upgrade invalidates a download the
// user already paid for.
const range = pkg.dependencies?.playwright ?? ''
check('playwright is pinned exactly, not by range', /^\d+\.\d+\.\d+$/.test(range), `found: ${range}`)

// And `npm ci` refuses to run when package.json and the lockfile disagree, so
// the pin has to be in both or a clone cannot install at all.
const lock = JSON.parse(readFileSync(path.join(root, 'package-lock.json'), 'utf8'))
check('...and the lockfile records the same range',
  lock.packages?.['']?.dependencies?.playwright === range,
  `lock: ${lock.packages?.['']?.dependencies?.playwright}`)

// The regression this whole change exists to prevent. `npm install -g <a git
// spec>` symlinks the package into npm's cache and deletes the target, so a
// postinstall runs with no working directory and the install breaks -- measured
// on npm 10.9.8 with a seven-line package. Making the script survive does not
// help: npm then reports success and leaves a dangling symlink. The only shape
// that installs cleanly is no postinstall at all.
check('package.json declares no postinstall',
  !('postinstall' in (pkg.scripts ?? {})),
  `found: ${pkg.scripts?.postinstall}`)
check('...nor any other install hook',
  !['preinstall', 'install', 'prepare'].some((k) => k in (pkg.scripts ?? {})),
  Object.keys(pkg.scripts ?? {}).join(', '))

console.log(failures ? `\n${failures} failure(s)` : '\nall green')
process.exit(failures ? 1 : 0)
