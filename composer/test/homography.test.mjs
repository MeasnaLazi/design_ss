/**
 * Dependency-free checks for homography.mjs: for every pose in every pack,
 * the solved matrix must map the source rect corners exactly onto the
 * frame.json corners quad (round-trip error < 1e-6 px).
 *
 * Run: node composer/test/homography.test.mjs
 */
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { solveProjection, matrix3dForQuad, quadFromFrameCorners, quadSize, coverCropRect } from '../homography.mjs'

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const FRAMES_DIR = path.join(REPO_ROOT, 'composer/device-frames')

function applyH(H, [x, y]) {
  const [a, b, c, d, e, f, g, h] = H
  const w = g * x + h * y + 1
  return [(a * x + b * y + c) / w, (d * x + e * y + f) / w]
}

let failures = 0
const check = (label, cond, detail = '') => {
  if (!cond) { failures++; console.error(`FAIL  ${label} ${detail}`) }
  else console.log(`ok    ${label}`)
}

// Synthetic sanity: identity and pure translation.
{
  const H = solveProjection(
    [[0, 0], [10, 0], [10, 20], [0, 20]],
    [[5, 5], [15, 5], [15, 25], [5, 25]],
  )
  const [x, y] = applyH(H, [10, 20])
  check('translation', Math.hypot(x - 15, y - 25) < 1e-9, `(${x},${y})`)
}

// Every pack, every pose: source rect corners → frame corners.
const packs = (await fs.readdir(FRAMES_DIR, { withFileTypes: true }))
  .filter((d) => d.isDirectory()).map((d) => d.name)

for (const pack of packs) {
  const frameJson = JSON.parse(await fs.readFile(path.join(FRAMES_DIR, pack, 'frame.json'), 'utf8'))
  for (const frame of frameJson.frames) {
    const quad = quadFromFrameCorners(frame.corners)
    const w = 772, h = 1571 // arbitrary source size; solver must be size-agnostic
    const src = [[0, 0], [w, 0], [w, h], [0, h]]
    const dst = [quad.tl, quad.tr, quad.br, quad.bl]
    const H = solveProjection(src, dst)
    let maxErr = 0
    for (let i = 0; i < 4; i++) {
      const p = applyH(H, src[i])
      maxErr = Math.max(maxErr, Math.hypot(p[0] - dst[i][0], p[1] - dst[i][1]))
    }
    check(`${pack}/${frame.name} corner round-trip`, maxErr < 1e-6, `maxErr=${maxErr}`)

    // matrix3d string must be well-formed (16 finite numbers).
    const m = matrix3dForQuad(w, h, quad)
    const nums = m.slice('matrix3d('.length, -1).split(',').map(Number)
    check(`${pack}/${frame.name} matrix3d well-formed`, nums.length === 16 && nums.every(Number.isFinite))

    // Cover crop: crop rect must have the quad's aspect and stay inside source.
    const q = quadSize(quad)
    const r = coverCropRect(w, h, q.width / q.height)
    const aspectErr = Math.abs(r.w / r.h - q.width / q.height)
    const inside = r.x >= -1e-9 && r.y >= -1e-9 && r.x + r.w <= w + 1e-9 && r.y + r.h <= h + 1e-9
    check(`${pack}/${frame.name} cover crop`, aspectErr < 1e-9 && inside, `aspectErr=${aspectErr}`)
  }
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`)
process.exit(failures === 0 ? 0 : 1)
