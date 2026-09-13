/**
 * Where Chromium comes from. The interesting part is not the download, it is
 * the decision -- and the decision is about a *revision*, not a boolean.
 *
 * Run: node cli/test/browser.test.mjs
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { browserPreflight, browserAdvice, parseExecutablePath } from '../browser.mjs'

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
