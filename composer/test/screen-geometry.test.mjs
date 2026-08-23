/**
 * screen-geometry.mjs — the module that stopped the measuring tool and the
 * shipping renderer from disagreeing.
 *
 * The cases that matter are the ones that used to differ. `device-frames.mjs`
 * read `getAttribute('d')`, so a `<rect>`-based `#screen` returned null and it
 * silently substituted a rounded quad; `mask_analysis` converted the rect and
 * measured the real aperture. Half the catalogue is `<rect>`. So: rect handling
 * with and without `rx`, ancestor transforms, and the containment predicate that
 * makes the contract checkable, are all tested against hand-computed answers.
 *
 * The catalogue itself is exercised too — not for taste, but because these
 * functions exist to describe *those* six files, and a refactor that keeps the
 * unit tests green while breaking every real pack would be worthless.
 *
 * Run: node composer/test/screen-geometry.test.mjs
 */
import assert from 'node:assert/strict'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  screenGeometry,
  screenOutline,
  screenClipPathD,
  sampleScreenPath,
  containmentReport,
  enclosingQuad,
  isIdentityAffine,
  applyAffine,
  parseTransformAttribute,
  rectToPathD,
} from '../screen-geometry.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const FRAMES = path.join(HERE, '..', 'device-frames')

let failures = 0
function check(label, fn) {
  try {
    fn()
    console.log(`PASS  ${label}`)
  } catch (err) {
    failures += 1
    console.log(`FAIL  ${label}`)
    console.log(`        ${err.message.split('\n').slice(0, 6).join('\n        ')}`)
  }
}

const svg = (body, attrs = 'viewBox="0 0 100 200"') => `<svg xmlns="http://www.w3.org/2000/svg" ${attrs}>${body}</svg>`

// --- the bug this module exists for ----------------------------------------

check('a <rect> #screen yields path data, where getAttribute("d") yielded null', () => {
  const geo = screenGeometry(svg('<rect id="screen" x="10" y="20" width="80" height="160"/>'))
  assert.equal(geo.tag, 'rect')
  assert.ok(geo.d, 'a rect must produce a `d`')
  assert.deepEqual(geo.problems, [])
  const pts = sampleScreenPath(geo.d)
  const xs = pts.map((p) => p[0])
  const ys = pts.map((p) => p[1])
  assert.equal(Math.min(...xs), 10)
  assert.equal(Math.max(...xs), 90)
  assert.equal(Math.min(...ys), 20)
  assert.equal(Math.max(...ys), 180)
})

check('a <rect> with rx rounds the corners instead of ignoring them', () => {
  const square = sampleScreenPath(rectToPathD({ x: 0, y: 0, width: 100, height: 100 }))
  const round = sampleScreenPath(rectToPathD({ x: 0, y: 0, width: 100, height: 100, rx: 20 }))
  // The sharp corner (0, 0) is on the square outline and off the rounded one.
  const hasOrigin = (pts) => pts.some(([x, y]) => Math.abs(x) < 1e-6 && Math.abs(y) < 1e-6)
  assert.ok(hasOrigin(square), 'square rect must include its corner')
  assert.ok(!hasOrigin(round), 'rounded rect must not include the sharp corner')
  // ...and the rounded outline stays inside the square one.
  for (const [x, y] of round) {
    assert.ok(x >= -1e-6 && x <= 100 + 1e-6 && y >= -1e-6 && y <= 100 + 1e-6)
  }
})

check('rx is clamped to half the side, as SVG requires', () => {
  const pts = sampleScreenPath(rectToPathD({ x: 0, y: 0, width: 40, height: 100, rx: 999 }))
  const xs = pts.map((p) => p[0])
  assert.ok(Math.min(...xs) >= -1e-6 && Math.max(...xs) <= 40 + 1e-6)
})

check('an unsupported #screen shape is reported, never guessed', () => {
  const geo = screenGeometry(svg('<circle id="screen" cx="50" cy="100" r="40"/>'))
  assert.equal(geo.d, null)
  assert.match(geo.problems.join(' '), /circle/)
})

check('a missing #screen is reported, never guessed', () => {
  const geo = screenGeometry(svg('<rect x="0" y="0" width="10" height="10"/>'))
  assert.equal(geo.d, null)
  assert.match(geo.problems.join(' '), /no element with id="screen"/)
})

// --- transforms -------------------------------------------------------------

check('ancestor transforms accumulate root -> element', () => {
  const geo = screenOutline(
    svg('<g transform="translate(10,20)"><g transform="scale(2)"><rect id="screen" x="0" y="0" width="10" height="10"/></g></g>'),
  )
  assert.ok(!isIdentityAffine(geo.worldMatrix))
  // (0,0) -> translate(10,20) then scale(2) applied inside: 10 + 2*0 = 10
  assert.deepEqual(applyAffine(geo.worldMatrix, [0, 0]).map(Math.round), [10, 20])
  assert.deepEqual(applyAffine(geo.worldMatrix, [10, 10]).map(Math.round), [30, 40])
})

check('a transform on the #screen element itself counts', () => {
  const geo = screenGeometry(svg('<rect id="screen" transform="translate(5,7)" x="0" y="0" width="10" height="10"/>'))
  assert.deepEqual(applyAffine(geo.worldMatrix, [0, 0]).map(Math.round), [5, 7])
})

check('rotate(a, cx, cy) rotates about the given centre', () => {
  const m = parseTransformAttribute('rotate(90, 10, 10)')
  assert.deepEqual(applyAffine(m, [10, 10]).map(Math.round), [10, 10])
  assert.deepEqual(applyAffine(m, [20, 10]).map(Math.round), [10, 20])
})

check('an identity chain keeps the original curves; a transform falls back to a polygon', () => {
  const curvy = '<path id="screen" d="M0,0 C10,0 20,10 20,20 L0,20 Z"/>'
  const plain = screenClipPathD(svg(curvy))
  assert.equal(plain.exact, true)
  assert.match(plain.d, /C/, 'an untransformed clip keeps its cubic commands')

  const moved = screenClipPathD(svg(`<g transform="translate(3,4)">${curvy}</g>`))
  assert.equal(moved.exact, false)
  assert.doesNotMatch(moved.d, /C/, 'a transformed clip is baked to a polygon')
  assert.match(moved.d, /^M3,4/, 'and it is baked in the right place')
})

// --- <style> and comments must not desynchronise the scanner ----------------

check('a CSS child combinator inside <style> does not break the element stack', () => {
  const geo = screenGeometry(
    svg('<style>.a > .b { fill: red; }</style><g transform="translate(1,2)"><rect id="screen" x="0" y="0" width="4" height="4"/></g>'),
  )
  assert.equal(geo.tag, 'rect')
  assert.deepEqual(applyAffine(geo.worldMatrix, [0, 0]).map(Math.round), [1, 2])
})

check('a commented-out #screen is not mistaken for the real one', () => {
  const geo = screenGeometry(svg('<!-- <rect id="screen" x="9" y="9" width="1" height="1"/> --><rect id="screen" x="0" y="0" width="10" height="10"/>'))
  const pts = sampleScreenPath(geo.d)
  assert.equal(Math.max(...pts.map((p) => p[0])), 10)
})

// --- viewBox ----------------------------------------------------------------

check('viewBox is read, with width/height as the fallback', () => {
  assert.deepEqual(screenGeometry(svg('<rect id="screen" x="0" y="0" width="1" height="1"/>')).viewBox,
    { x: 0, y: 0, width: 100, height: 200 })
  assert.deepEqual(screenGeometry(svg('<rect id="screen" x="0" y="0" width="1" height="1"/>', 'width="300" height="400"')).viewBox,
    { x: 0, y: 0, width: 300, height: 400 })
})

// --- containment: the contract ----------------------------------------------

const unitSquare = [[0, 0], [10, 0], [10, 10], [0, 10]]

check('a quad that encloses the outline passes, and reports its margin', () => {
  const quad = [[-1, -1], [11, -1], [11, 11], [-1, 11]]
  const r = containmentReport(quad, unitSquare)
  assert.equal(r.ok, true)
  assert.equal(r.outsideCount, 0)
  assert.equal(Math.round(-r.maxOutside), 1, 'margin is 1 unit on every side')
})

check('a quad the outline escapes fails, and says by how much and where', () => {
  const quad = [[2, 0], [10, 0], [10, 10], [2, 10]] // 2 units too far right
  const r = containmentReport(quad, unitSquare)
  assert.equal(r.ok, false)
  assert.ok(r.outsideCount > 0)
  assert.equal(Math.round(r.maxOutside), 2)
  assert.deepEqual(r.worstPoint, [0, 0])
})

check('containment does not depend on the winding of the quad', () => {
  const cw = [[-1, -1], [11, -1], [11, 11], [-1, 11]]
  const ccw = [...cw].reverse()
  assert.equal(containmentReport(cw, unitSquare).ok, true)
  assert.equal(containmentReport(ccw, unitSquare).ok, true)
})

check('a self-intersecting quad is refused rather than measured', () => {
  const bowtie = [[0, 0], [10, 10], [10, 0], [0, 10]]
  assert.equal(containmentReport(bowtie, unitSquare).convex, false)
  assert.equal(containmentReport(bowtie, unitSquare).ok, false)
})

// --- the enclosing quad -----------------------------------------------------

check('the enclosing quad contains a rounded outline that diagonal extremes would clip', () => {
  const pts = sampleScreenPath(rectToPathD({ x: 0, y: 0, width: 100, height: 200, rx: 30 }))

  // What the old export did: the four diagonal extremes of the outline.
  let tl = pts[0], tr = pts[0], br = pts[0], bl = pts[0]
  let minS = Infinity, maxS = -Infinity, maxD = -Infinity, minD = Infinity
  for (const p of pts) {
    const s = p[0] + p[1]
    const d = p[0] - p[1]
    if (s < minS) { minS = s; tl = p }
    if (s > maxS) { maxS = s; br = p }
    if (d > maxD) { maxD = d; tr = p }
    if (d < minD) { minD = d; bl = p }
  }
  const diagonal = containmentReport([tl, tr, br, bl], pts)
  assert.equal(diagonal.ok, false, 'the diagonal-extreme quad must be shown to under-cover')

  const enclosing = containmentReport(enclosingQuad(pts), pts)
  assert.equal(enclosing.ok, true, 'the enclosing quad must cover')
})

check('the outset grows the enclosing quad by the amount asked for', () => {
  const pts = sampleScreenPath(rectToPathD({ x: 0, y: 0, width: 100, height: 200 }))
  const r = containmentReport(enclosingQuad(pts, { outset: 3 }), pts)
  assert.equal(r.ok, true)
  assert.equal(Math.round(-r.maxOutside), 3)
})

// --- the real catalogue -----------------------------------------------------

const catalogue = JSON.parse(await fs.readFile(path.join(FRAMES, 'index.json'), 'utf8')).devices ?? []

check('every pack in the catalogue has a readable #screen and a containing quad', async () => {
  assert.ok(catalogue.length > 0, 'the catalogue must not be empty')
})

for (const dev of catalogue) {
  const id = String(dev.path ?? '').split('/').filter(Boolean)[1]
  if (!id) continue
  const pack = JSON.parse(await fs.readFile(path.join(FRAMES, id, 'frame.json'), 'utf8'))
  for (const frame of pack.frames ?? []) {
    const rel = String(frame.framePath).replace(/^\/device-frames\//, '')
    const svgText = await fs.readFile(path.join(FRAMES, rel), 'utf8')
    const geo = screenOutline(svgText)
    check(`${id}/${frame.name}: #screen reads, and corners contain it`, () => {
      assert.ok(geo.points, `#screen unreadable: ${geo.problems.join('; ')}`)
      assert.equal(geo.viewBox.x, 0)
      assert.equal(geo.viewBox.y, 0)
      const c = frame.corners
      const r = containmentReport([c.TL, c.TR, c.BR, c.BL], geo.points)
      assert.equal(r.ok, true,
        `aperture escapes the quad by ${r.maxOutside.toFixed(2)}u at ${r.outsideCount} points`)
    })
    check(`${id}/${frame.name}: the SVG viewBox is the stage size frame.json claims`, () => {
      assert.ok(Math.abs(frame.viewWidth - geo.viewBox.width) <= 0.5,
        `viewWidth ${frame.viewWidth} vs viewBox ${geo.viewBox.width}`)
      assert.ok(Math.abs(frame.viewHeight - geo.viewBox.height) <= 0.5,
        `viewHeight ${frame.viewHeight} vs viewBox ${geo.viewBox.height}`)
    })
  }
}

console.log(failures ? `\n${failures} FAILED` : '\nALL PASS')
process.exit(failures ? 1 : 0)
