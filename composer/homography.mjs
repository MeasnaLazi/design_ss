/**
 * 4-point homography solver → CSS matrix3d.
 *
 * Shared module (Node + browser). Mirrors the math the Fabric canvas uses
 * (the editor's screenshot bake step) so both renderers fit
 * screenshots into the same `frame.json` screen quads identically.
 *
 * Coordinate convention: quads are in the device pose's SVG viewBox space,
 * corners ordered { tl, tr, br, bl } as [x, y] pairs (frame.json `corners`
 * uses uppercase TL/TR/BR/BL — see `quadFromFrameCorners`).
 */

/**
 * Solve the projective transform H (3x3, h33 = 1) mapping 4 source points
 * onto 4 destination points via direct linear transform + Gaussian elimination.
 * @param {Array<[number, number]>} src - 4 source points
 * @param {Array<[number, number]>} dst - 4 destination points
 * @returns {number[]} [a,b,c,d,e,f,g,h] where X=(ax+by+c)/(gx+hy+1), Y=(dx+ey+f)/(gx+hy+1)
 */
export function solveProjection(src, dst) {
  if (src.length !== 4 || dst.length !== 4) throw new Error('need exactly 4 point pairs')
  // Build 8x9 augmented matrix.
  const m = []
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i]
    const [X, Y] = dst[i]
    m.push([x, y, 1, 0, 0, 0, -x * X, -y * X, X])
    m.push([0, 0, 0, x, y, 1, -x * Y, -y * Y, Y])
  }
  // Gaussian elimination with partial pivoting.
  for (let col = 0; col < 8; col++) {
    let pivot = col
    for (let r = col + 1; r < 8; r++) {
      if (Math.abs(m[r][col]) > Math.abs(m[pivot][col])) pivot = r
    }
    if (Math.abs(m[pivot][col]) < 1e-12) throw new Error('degenerate quad (singular system)')
    if (pivot !== col) [m[col], m[pivot]] = [m[pivot], m[col]]
    for (let r = 0; r < 8; r++) {
      if (r === col) continue
      const f = m[r][col] / m[col][col]
      if (f === 0) continue
      for (let c = col; c < 9; c++) m[r][c] -= f * m[col][c]
    }
  }
  return m.map((row, i) => row[8] / row[i])
}

/**
 * CSS matrix3d() string for a homography that maps an element of layout size
 * `w` x `h` (transform-origin MUST be `0 0`) onto `quad` in the parent's
 * coordinate space.
 * @param {number} w - source element layout width (px)
 * @param {number} h - source element layout height (px)
 * @param {{tl:[number,number],tr:[number,number],br:[number,number],bl:[number,number]}} quad
 * @param {{srcRect?: {x:number,y:number,w:number,h:number}}} [opts] - map only this
 *   sub-rectangle of the source onto the quad (used for cover-crop fits).
 */
export function matrix3dForQuad(w, h, quad, opts = {}) {
  const r = opts.srcRect ?? { x: 0, y: 0, w, h }
  const src = [
    [r.x, r.y],
    [r.x + r.w, r.y],
    [r.x + r.w, r.y + r.h],
    [r.x, r.y + r.h],
  ]
  const dst = [quad.tl, quad.tr, quad.br, quad.bl]
  const [a, b, c, d, e, f, g, hh] = solveProjection(src, dst)
  // Column-major 4x4 embedding of the 3x3 homography (z passthrough).
  const n = (v) => (Object.is(v, -0) ? 0 : v)
  return `matrix3d(${[
    n(a), n(d), 0, n(g),
    n(b), n(e), 0, n(hh),
    0, 0, 1, 0,
    n(c), n(f), 0, 1,
  ].join(', ')})`
}

/**
 * frame.json `corners` ({ TL, TR, BR, BL }) → quad ({ tl, tr, br, bl }).
 */
export function quadFromFrameCorners(corners) {
  return { tl: corners.TL, tr: corners.TR, br: corners.BR, bl: corners.BL }
}

/**
 * Average width/height of a quad (used for cover-fit aspect and radius scaling).
 */
export function quadSize(quad) {
  const d = (p, q) => Math.hypot(q[0] - p[0], q[1] - p[1])
  return {
    width: (d(quad.tl, quad.tr) + d(quad.bl, quad.br)) / 2,
    height: (d(quad.tl, quad.bl) + d(quad.tr, quad.br)) / 2,
  }
}

/**
 * Centered cover-crop of a `w` x `h` source for a target aspect ratio.
 * @returns {{x:number,y:number,w:number,h:number}}
 */
export function coverCropRect(w, h, targetAspect) {
  const srcAspect = w / h
  if (srcAspect > targetAspect) {
    const cw = h * targetAspect
    return { x: (w - cw) / 2, y: 0, w: cw, h }
  }
  const ch = w / targetAspect
  return { x: 0, y: (h - ch) / 2, w, h: ch }
}

/**
 * Rounded-quad SVG path `d` in viewBox coordinates. Direct port of
 * the editor's rounded-quad path builder so HTML
 * clipping matches canvas clipping exactly. Radii order: [tl, tr, br, bl].
 */
export function roundedQuadPathD(quad, radiiPx) {
  const points = [quad.tl, quad.tr, quad.br, quad.bl]
  if (radiiPx.every((r) => r <= 0)) {
    return `M ${quad.tl[0]} ${quad.tl[1]} L ${quad.tr[0]} ${quad.tr[1]} L ${quad.br[0]} ${quad.br[1]} L ${quad.bl[0]} ${quad.bl[1]} Z`
  }
  const normalize = (x, y) => {
    const len = Math.hypot(x, y)
    return len < 1e-6 ? [0, 0] : [x / len, y / len]
  }
  const cornerData = points.map((corner, i) => {
    const radiusPx = radiiPx[i]
    const prev = points[(i + 3) % 4]
    const next = points[(i + 1) % 4]
    const toPrev = normalize(prev[0] - corner[0], prev[1] - corner[1])
    const toNext = normalize(next[0] - corner[0], next[1] - corner[1])
    const lenPrev = Math.hypot(prev[0] - corner[0], prev[1] - corner[1])
    const lenNext = Math.hypot(next[0] - corner[0], next[1] - corner[1])
    const localRadius = Math.min(radiusPx, lenPrev * 0.45, lenNext * 0.45)
    const start = [corner[0] + toPrev[0] * localRadius, corner[1] + toPrev[1] * localRadius]
    const end = [corner[0] + toNext[0] * localRadius, corner[1] + toNext[1] * localRadius]
    return { corner, start, end }
  })
  const [first, ...rest] = cornerData
  const segments = [`M ${first.end[0]} ${first.end[1]}`]
  for (const c of rest) {
    segments.push(`L ${c.start[0]} ${c.start[1]}`)
    segments.push(`Q ${c.corner[0]} ${c.corner[1]} ${c.end[0]} ${c.end[1]}`)
  }
  segments.push(`L ${first.start[0]} ${first.start[1]}`)
  segments.push(`Q ${first.corner[0]} ${first.corner[1]} ${first.end[0]} ${first.end[1]}`)
  segments.push('Z')
  return segments.join(' ')
}
