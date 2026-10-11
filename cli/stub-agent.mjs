/**
 * A fake designer. No model, no API key, no cost.
 *
 * It copies the tracked fixture composer/test/bio-strip.html into
 * strips/<target>/ -- schema-valid, and its only asset reference is the
 * tracked composer/test/screen.svg, so it renders in a fresh clone with no
 * input/ at all. That makes the whole pipeline smoke-testable in CI.
 *
 * The fixture is an iPhone strip. For any target listed in
 * composer/targets.json it is scaled to fit that target's panel and the panel
 * box is set to the exact size, so every target exports PNGs of its own size.
 * A folder name the file does not list keeps the fixture's size.
 *
 *   STUB_MODE=ok           write a strip and exit 0        (default)
 *   STUB_MODE=noop         write nothing and exit 0        -> exercises exit 3
 *   STUB_MODE=fail         exit 7                          -> exercises exit 4
 *   STUB_MODE=hang         sleep forever                   -> exercises exit 124
 *   STUB_MODE=needs-input  print NEEDS_INPUT and exit 0    -> exercises exit 5
 *   STUB_MODE=broken       write an invalid strip          -> exercises exit 1
 */
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { panelFor } from '../composer/targets.mjs'
import { readCatalogue } from '../composer/pick-frame.mjs'
import { detectPanelSize, scaleStyleLengths } from './retarget.mjs'

const target = process.argv[2]
const mode = process.env.STUB_MODE || 'ok'
const toolkitRoot = process.env.DESIGN_SS_TOOLKIT_ROOT || process.cwd()
const stripsDir = process.env.DESIGN_SS_OUTPUT || path.join(process.cwd(), 'strips')
const out = path.join(stripsDir, target)

console.error(`stub-agent: mode=${mode} target=${target}`)

if (mode === 'fail') process.exit(7)
if (mode === 'needs-input') { console.log('NEEDS_INPUT: input/app.md has no panel copy'); process.exit(0) }
if (mode === 'hang') { setInterval(() => {}, 1000); console.error('stub-agent: hanging on purpose'); }
else if (mode === 'noop') { console.error('stub-agent: deliberately wrote nothing'); process.exit(0) }
else {
  await fs.mkdir(out, { recursive: true })
  if (mode === 'broken') {
    await fs.writeFile(path.join(out, 'strip.html'), '<!doctype html><div class="strip"><section data-panel></section></div>')
  } else {
    // The fixture is a *schema* fixture, and two things about it have to be
    // fixed before it is a *renderable* strip:
    //
    //   1. check-schema requires the frame pack's type to equal the
    //      strips/<folder> name, so swap in a pack of the right type when
    //      smoke-testing a target other than iphone. The catalogue is read
    //      with pick-frame's parser: index.json is { devices: [...] }, and an
    //      earlier hand-rolled read treated it as a list, threw, and silently
    //      left the iPhone pack in every target.
    //   2. it references poses (isometric-right, angled-left, tilted-right,
    //      isometric-left) that the shipped packs do not contain -- the packs
    //      here ship `front` only. check-schema does not validate data-pose
    //      against the pack, so the fixture passes the checker and then fails
    //      at render with `pose "..." not found in pack`. Normalise every pose
    //      to one the pack actually has.
    let html = await fs.readFile(path.join(toolkitRoot, 'composer/test/bio-strip.html'), 'utf8')
    let packId = 'iphone_12_pro'
    try {
      const match = (await readCatalogue()).find((p) => p.type === target)
      if (match) { html = html.replaceAll(packId, match.id); packId = match.id }
    } catch (err) { console.error(`stub-agent: catalogue unreadable, pack left as ${packId}: ${err.message}`) }
    try {
      const pack = JSON.parse(await fs.readFile(path.join(toolkitRoot, 'composer/device-frames', packId, 'frame.json'), 'utf8'))
      const poses = (pack.frames || []).map((f) => f.name)
      if (poses.length) {
        html = html.replace(/data-pose="([^"]*)"/g, (whole, pose) => poses.includes(pose) ? whole : `data-pose="${poses[0]}"`)
      }
    } catch { /* leave the poses alone */ }
    html = fitToTarget(html, target)
    await fs.writeFile(path.join(out, 'strip.html'), html)
  }
  console.error(`stub-agent: wrote ${path.join(out, 'strip.html')}`)
  process.exit(0)
}

/**
 * Scale the fixture to fit inside `target`'s panel, then set the panel box to
 * that exact size. Scaled by the smaller of the two ratios so no block falls
 * off the panel; the leftover band is empty background, which is fine for a
 * smoke test. The panel box is the first `width: …px; height: …px` pair, the
 * same rule retarget relies on.
 */
function fitToTarget(html, target) {
  const panel = panelFor(target)
  const from = detectPanelSize(html)
  if (!panel || !from) return html
  const k = Math.min(panel.width / from.w, panel.height / from.h)
  const scaled = scaleStyleLengths(html, k)
  return scaled.replace(/width:(\s*)\d+(?:\.\d+)?px;(\s*)height:(\s*)\d+(?:\.\d+)?px/,
    `width:$1${panel.width}px;$2height:$3${panel.height}px`)
}
