/**
 * The one definition of "where is the screen" in a device-frame pose SVG.
 *
 * Every tool that needs the screen aperture reads it from here: the runtime
 * that ships (`device-frames.mjs`), the validator (`check-schema.mjs`), and the
 * measuring instrument (`mask_analysis/`). That is the entire point of the
 * module — those three used to each carry a private answer, and the answers
 * disagreed. `device-frames.mjs` read `getAttribute('d')` and so saw *nothing*
 * for a `<rect>`-based `#screen`, falling through to a rounded quad built from
 * `frame.json` corners with a hardcoded radius; `mask_analysis` converted the
 * rect and measured the real aperture. Three of six packs define `#screen` as a
 * `<rect>`, so for half the catalogue the tool you measure with and the runtime
 * you ship were clipping different shapes.
 *
 * ## The contract this module exists to make checkable
 *
 *   `frame.json.corners` is a **warp target** in viewBox space that must fully
 *   contain the `#screen` aperture. The **clip** is always derived from the SVG,
 *   never from `corners`.
 *
 * `containmentReport` is the machine-checkable half of that sentence.
 *
 * ## Why this parses text rather than a DOM
 *
 * `check-schema.mjs` validates from source text with no browser, by design. A
 * geometry check that needed jsdom would either not run there or would drag a
 * devDependency into the validator's runtime path. So the scanner below is a
 * small tag-balance walk over the markup — the same approach `check-schema.mjs`
 * already uses — and the *identical* code then runs in the browser, where a
 * DOMParser was available all along but would have been a second implementation.
 *
 * Coordinate convention: everything is in the pose SVG's own viewBox units,
 * matching `frame.json` `corners` and `homography.mjs` quads.
 */

// ---------------------------------------------------------------------------
// Markup scanning
// ---------------------------------------------------------------------------

/**
 * Blank out comments and the contents of `<style>` / `<script>`, preserving
 * length so nothing downstream has to care.
 *
 * Necessary, not defensive: `iphone_15_pro/frame/front.svg` carries a `<style>`
 * block, and CSS child combinators (`.a > .b`) would otherwise close a tag that
 * was never open and desynchronise the element stack.
 */
function blankNonMarkup(svgText) {
  const blank = (m) => ' '.repeat(m.length)
  return svgText
    .replace(/<!--[\s\S]*?-->/g, blank)
    .replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, blank)
    .replace(/(<style\b[^>]*>)([\s\S]*?)(<\/style\s*>)/gi, (_, a, b, c) => a + blank(b) + c)
    .replace(/(<script\b[^>]*>)([\s\S]*?)(<\/script\s*>)/gi, (_, a, b, c) => a + blank(b) + c)
}

const TAG_RE = /<(\/?)([a-zA-Z][\w:.-]*)((?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)>/g

/** Read one attribute out of a raw attribute string. */
export function attrOf(attrText, name) {
  const m = attrText.match(new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i'))
  return m ? (m[2] ?? m[3]) : null
}

const num = (v, fallback = 0) => {
  const n = Number.parseFloat(v)
  return Number.isFinite(n) ? n : fallback
}

// ---------------------------------------------------------------------------
// Affine transforms (2x3, [a, b, c, d, e, f] as in SVG `matrix(...)`)
// ---------------------------------------------------------------------------

export const IDENTITY = [1, 0, 0, 1, 0, 0]

export function multiplyAffine(m, n) {
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ]
}

export function applyAffine(m, [x, y]) {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]
}

export function isIdentityAffine(m, eps = 1e-9) {
  return m.every((v, i) => Math.abs(v - IDENTITY[i]) < eps)
}

/** Parse an SVG `transform` list: matrix, translate, scale, rotate, skewX, skewY. */
export function parseTransformAttribute(transformStr) {
  let result = IDENTITY
  const re = /([a-zA-Z]+)\s*\(([^)]*)\)/g
  let match
  while ((match = re.exec(transformStr)) !== null) {
    const fn = match[1].toLowerCase()
    const a = match[2].trim().split(/[\s,]+/).filter(Boolean).map(Number)
    let m
    switch (fn) {
      case 'matrix':
        m = [a[0], a[1], a[2], a[3], a[4], a[5]]
        break
      case 'translate':
        m = [1, 0, 0, 1, a[0] ?? 0, a[1] ?? 0]
        break
      case 'scale':
        m = [a[0] ?? 1, 0, 0, a[1] ?? a[0] ?? 1, 0, 0]
        break
      case 'rotate': {
        const rad = ((a[0] ?? 0) * Math.PI) / 180
        const cos = Math.cos(rad)
        const sin = Math.sin(rad)
        const cx = a[1] ?? 0
        const cy = a[2] ?? 0
        m = multiplyAffine(
          multiplyAffine([1, 0, 0, 1, cx, cy], [cos, sin, -sin, cos, 0, 0]),
          [1, 0, 0, 1, -cx, -cy],
        )
        break
      }
      case 'skewx':
        m = [1, 0, Math.tan(((a[0] ?? 0) * Math.PI) / 180), 1, 0, 0]
        break
      case 'skewy':
        m = [1, Math.tan(((a[0] ?? 0) * Math.PI) / 180), 0, 1, 0, 0]
        break
      default:
        continue
    }
    if (m.some((v) => !Number.isFinite(v))) continue
    result = multiplyAffine(result, m)
  }
  return result
}

// ---------------------------------------------------------------------------
// `<rect>` → path
// ---------------------------------------------------------------------------

/**
 * A path `d` equivalent to a `<rect>`, honouring `rx` / `ry`, clockwise from
 * the top-left.
 *
 * Rounded corners are cubic Béziers rather than arcs on purpose: the sampler
 * below walks Béziers properly but only takes the endpoints of an `A` command,
 * so an arc-based rect would sample as a bare rectangle and quietly overstate
 * the aperture at every corner.
 */
export function rectToPathD(attrs) {
  const x = num(attrs.x)
  const y = num(attrs.y)
  const width = num(attrs.width)
  const height = num(attrs.height)

  const hasRx = attrs.rx != null && attrs.rx !== ''
  const hasRy = attrs.ry != null && attrs.ry !== ''
  let rx = hasRx ? num(attrs.rx) : hasRy ? num(attrs.ry) : 0
  let ry = hasRy ? num(attrs.ry) : rx
  rx = Math.min(rx, width / 2)
  ry = Math.min(ry, height / 2)

  if (!(rx > 0) || !(ry > 0)) {
    return `M${x},${y} L${x + width},${y} L${x + width},${y + height} L${x},${y + height} Z`
  }

  const k = 0.5522847498 // cubic-Bézier circle approximation
  const rxK = rx * k
  const ryK = ry * k
  return [
    `M${x + rx},${y}`,
    `L${x + width - rx},${y}`,
    `C${x + width - rx + rxK},${y} ${x + width},${y + ry - ryK} ${x + width},${y + ry}`,
    `L${x + width},${y + height - ry}`,
    `C${x + width},${y + height - ry + ryK} ${x + width - rx + rxK},${y + height} ${x + width - rx},${y + height}`,
    `L${x + rx},${y + height}`,
    `C${x + rx - rxK},${y + height} ${x},${y + height - ry + ryK} ${x},${y + height - ry}`,
    `L${x},${y + ry}`,
    `C${x},${y + ry - ryK} ${x + rx - rxK},${y} ${x + rx},${y}`,
    'Z',
  ].join(' ')
}

// ---------------------------------------------------------------------------
// The entry point
// ---------------------------------------------------------------------------

/**
 * Locate `#screen` in a pose SVG and describe it.
 *
 * @param {string} svgText
 * @returns {{
 *   viewBox: {x:number,y:number,width:number,height:number} | null,
 *   tag: string | null,        // 'path' | 'rect' | whatever carried the id
 *   d: string | null,          // path data in the element's own coordinates
 *   worldMatrix: number[],     // ancestor transforms, root → element, inclusive
 *   problems: string[],        // reasons `d` is null or untrustworthy
 * }}
 */
export function screenGeometry(svgText) {
  const problems = []
  const src = blankNonMarkup(String(svgText ?? ''))

  const rootMatch = /<svg\b((?:[^>"']|"[^"]*"|'[^']*')*?)>/i.exec(src)
  const viewBox = rootMatch ? parseViewBox(rootMatch[1]) : null
  if (!viewBox) problems.push('no <svg> root with a usable viewBox (or width/height)')

  // Walk the tree keeping a stack of open elements, so the transform chain
  // above `#screen` is known the moment it is found.
  const stack = []
  let found = null
  TAG_RE.lastIndex = 0
  let t
  while ((t = TAG_RE.exec(src)) !== null) {
    const [, closing, rawName, attrs, selfClose] = t
    const name = rawName.toLowerCase()
    if (closing) {
      for (let i = stack.length - 1; i >= 0; i -= 1) {
        if (stack[i].name === name) {
          stack.length = i
          break
        }
      }
      continue
    }
    const isScreen = attrOf(attrs, 'id') === 'screen'
    if (isScreen && !found) {
      found = {
        name,
        attrs,
        chain: [...stack.map((s) => s.attrs), attrs],
      }
    }
    if (!selfClose && !VOID_SVG.has(name)) stack.push({ name, attrs })
  }

  if (!found) {
    problems.push('no element with id="screen"')
    return { viewBox, tag: null, d: null, worldMatrix: IDENTITY, problems }
  }

  let worldMatrix = IDENTITY
  for (const attrs of found.chain) {
    const tr = attrOf(attrs, 'transform')
    if (tr) worldMatrix = multiplyAffine(worldMatrix, parseTransformAttribute(tr))
  }

  let d = null
  if (found.name === 'path') {
    d = attrOf(found.attrs, 'd')
    if (!d) problems.push('#screen is a <path> with no `d`')
  } else if (found.name === 'rect') {
    d = rectToPathD({
      x: attrOf(found.attrs, 'x'),
      y: attrOf(found.attrs, 'y'),
      width: attrOf(found.attrs, 'width'),
      height: attrOf(found.attrs, 'height'),
      rx: attrOf(found.attrs, 'rx'),
      ry: attrOf(found.attrs, 'ry'),
    })
  } else {
    problems.push(
      `#screen is a <${found.name}>; only <path> and <rect> describe an aperture ` +
        `(circle, ellipse and polygon are not converted and would sample as empty)`,
    )
  }

  return { viewBox, tag: found.name, d, worldMatrix, problems }
}

const VOID_SVG = new Set(['path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'use', 'image', 'stop'])

function parseViewBox(attrText) {
  const vb = attrOf(attrText, 'viewBox')
  if (vb) {
    const p = vb.trim().split(/[\s,]+/).map(Number)
    if (p.length === 4 && p.every(Number.isFinite) && p[2] > 0 && p[3] > 0) {
      return { x: p[0], y: p[1], width: p[2], height: p[3] }
    }
  }
  const w = Number.parseFloat(attrOf(attrText, 'width'))
  const h = Number.parseFloat(attrOf(attrText, 'height'))
  if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) {
    return { x: 0, y: 0, width: w, height: h }
  }
  return null
}

/**
 * The aperture outline in viewBox coordinates, ready to clip or to test.
 *
 * Returns `null` rather than guessing when `#screen` is missing or unusable —
 * every caller is expected to make that loud. Silently substituting a shape is
 * exactly the behaviour this module was written to delete.
 */
export function screenOutline(svgText, { samples } = {}) {
  const geo = screenGeometry(svgText)
  if (!geo.d) return { ...geo, points: null }
  const local = sampleScreenPath(geo.d, samples)
  const points = isIdentityAffine(geo.worldMatrix)
    ? local
    : local.map((p) => applyAffine(geo.worldMatrix, p))
  return { ...geo, points }
}

/**
 * A clip-path `d` in viewBox coordinates.
 *
 * CSS `clip-path: path()` has no transform context, so when `#screen` sits under
 * an ancestor `transform` the transform has to be baked in — which means giving
 * up the curve commands and emitting a sampled polygon. That branch is avoided
 * whenever it can be: with an identity chain (every pack in the catalogue today)
 * the original `d` is passed through untouched, curves and all.
 */
export function screenClipPathD(svgText, { samples } = {}) {
  const geo = screenGeometry(svgText)
  if (!geo.d) return { d: null, exact: false, problems: geo.problems, geo }
  if (isIdentityAffine(geo.worldMatrix)) {
    return { d: geo.d, exact: true, problems: geo.problems, geo }
  }
  const pts = sampleScreenPath(geo.d, samples).map((p) => applyAffine(geo.worldMatrix, p))
  const d = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${round(x)},${round(y)}`).join(' ') + ' Z'
  return { d, exact: false, problems: geo.problems, geo }
}

const round = (v) => Math.round(v * 1000) / 1000

// ---------------------------------------------------------------------------
// Containment: does the warp quad cover the aperture?
// ---------------------------------------------------------------------------

/**
 * Signed distance from a point to each edge of a quad, positive outside.
 *
 * The quad must be convex and wound consistently; `containmentReport` checks
 * that before trusting these numbers.
 */
function maxOutwardDistance(quad, point) {
  const area = polygonArea(quad)
  const sign = area >= 0 ? 1 : -1
  let worst = -Infinity
  for (let i = 0; i < 4; i += 1) {
    const [x1, y1] = quad[i]
    const [x2, y2] = quad[(i + 1) % 4]
    const ex = x2 - x1
    const ey = y2 - y1
    const len = Math.hypot(ex, ey)
    if (len < 1e-9) continue
    // Cross product of the edge with (point - edge start), normalised to a
    // distance and oriented so that "outside" is positive regardless of winding.
    const cross = ex * (point[1] - y1) - ey * (point[0] - x1)
    worst = Math.max(worst, (-sign * cross) / len)
  }
  return worst
}

export function polygonArea(pts) {
  let a = 0
  for (let i = 0; i < pts.length; i += 1) {
    const [x1, y1] = pts[i]
    const [x2, y2] = pts[(i + 1) % pts.length]
    a += x1 * y2 - x2 * y1
  }
  return a / 2
}

export function isConvexQuad(quad) {
  let sign = 0
  for (let i = 0; i < 4; i += 1) {
    const [ax, ay] = quad[i]
    const [bx, by] = quad[(i + 1) % 4]
    const [cx, cy] = quad[(i + 2) % 4]
    const cross = (bx - ax) * (cy - by) - (by - ay) * (cx - bx)
    if (Math.abs(cross) < 1e-9) continue
    const s = Math.sign(cross)
    if (sign === 0) sign = s
    else if (s !== sign) return false
  }
  return sign !== 0
}

/**
 * How far, if at all, the `#screen` aperture escapes the warp quad.
 *
 * This is the check the whole refactor is for. `mask_analysis` cannot fail it —
 * it warps onto the quad and then cuts with an exact mask, so a quad slightly
 * inside the aperture just loses a sliver of screenshot nobody sees. The
 * shipping runtime has no such backstop: the same quad leaves the panel
 * background showing as a hairline along the aperture edge.
 *
 * @param {Array<[number,number]>} quad - TL, TR, BR, BL in viewBox units
 * @param {Array<[number,number]>} points - sampled aperture outline
 * @returns {{ ok: boolean, maxOutside: number, worstPoint: [number,number]|null, outsideCount: number, convex: boolean }}
 */
export function containmentReport(quad, points, { tolerance = 0 } = {}) {
  const convex = isConvexQuad(quad)
  let maxOutside = -Infinity
  let worstPoint = null
  let outsideCount = 0
  for (const p of points) {
    const dist = maxOutwardDistance(quad, p)
    if (dist > tolerance) outsideCount += 1
    if (dist > maxOutside) {
      maxOutside = dist
      worstPoint = p
    }
  }
  return {
    ok: convex && outsideCount === 0,
    maxOutside: Number.isFinite(maxOutside) ? maxOutside : 0,
    worstPoint,
    outsideCount,
    convex,
  }
}

// ---------------------------------------------------------------------------
// Path sampling
// ---------------------------------------------------------------------------

/**
 * Sample every point along a path `d`, Béziers included.
 *
 * Handles M, L, H, V, C, S, Q, T, A, Z (absolute and relative). `A` contributes
 * only its endpoint — see the note on {@link rectToPathD} for why rounded rects
 * are emitted as cubics instead.
 *
 * With several sub-paths, the largest by bounding area wins: frame artwork
 * occasionally puts a speaker slot or a camera hole in the same element, and the
 * screen is always the big one.
 */
export function sampleScreenPath(d, samples = 16) {
  const SAMPLES = samples
  const re = /([MmLlHhVvCcSsQqTtAaZz])|([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)/g
  const tokens = []
  let m
  while ((m = re.exec(d)) !== null) tokens.push(m[0])

  const subs = []
  let pts = []
  let x = 0, y = 0, sx = 0, sy = 0, pcx = 0, pcy = 0, prev = '', i = 0

  while (i < tokens.length) {
    let cmd = tokens[i]
    if (!Number.isNaN(Number.parseFloat(cmd))) {
      cmd = prev === 'M' ? 'L' : prev === 'm' ? 'l' : prev
    } else {
      i += 1
    }

    switch (cmd) {
      case 'M': if (pts.length) subs.push(pts); x = +tokens[i]; y = +tokens[i + 1]; i += 2; sx = x; sy = y; pts = [[x, y]]; break
      case 'm': if (pts.length) subs.push(pts); x += +tokens[i]; y += +tokens[i + 1]; i += 2; sx = x; sy = y; pts = [[x, y]]; break
      case 'L': x = +tokens[i]; y = +tokens[i + 1]; i += 2; pts.push([x, y]); break
      case 'l': x += +tokens[i]; y += +tokens[i + 1]; i += 2; pts.push([x, y]); break
      case 'H': x = +tokens[i]; i += 1; pts.push([x, y]); break
      case 'h': x += +tokens[i]; i += 1; pts.push([x, y]); break
      case 'V': y = +tokens[i]; i += 1; pts.push([x, y]); break
      case 'v': y += +tokens[i]; i += 1; pts.push([x, y]); break
      case 'C': { const x1 = +tokens[i], y1 = +tokens[i + 1], x2 = +tokens[i + 2], y2 = +tokens[i + 3], ex = +tokens[i + 4], ey = +tokens[i + 5]; i += 6
        cubicSample(pts, x, y, x1, y1, x2, y2, ex, ey, SAMPLES); pcx = x2; pcy = y2; x = ex; y = ey; break }
      case 'c': { const x1 = x + +tokens[i], y1 = y + +tokens[i + 1], x2 = x + +tokens[i + 2], y2 = y + +tokens[i + 3], ex = x + +tokens[i + 4], ey = y + +tokens[i + 5]; i += 6
        cubicSample(pts, x, y, x1, y1, x2, y2, ex, ey, SAMPLES); pcx = x2; pcy = y2; x = ex; y = ey; break }
      case 'S': { const cx1 = 2 * x - pcx, cy1 = 2 * y - pcy, x2 = +tokens[i], y2 = +tokens[i + 1], ex = +tokens[i + 2], ey = +tokens[i + 3]; i += 4
        cubicSample(pts, x, y, cx1, cy1, x2, y2, ex, ey, SAMPLES); pcx = x2; pcy = y2; x = ex; y = ey; break }
      case 's': { const cx1 = 2 * x - pcx, cy1 = 2 * y - pcy, x2 = x + +tokens[i], y2 = y + +tokens[i + 1], ex = x + +tokens[i + 2], ey = y + +tokens[i + 3]; i += 4
        cubicSample(pts, x, y, cx1, cy1, x2, y2, ex, ey, SAMPLES); pcx = x2; pcy = y2; x = ex; y = ey; break }
      case 'Q': { const qx = +tokens[i], qy = +tokens[i + 1], ex = +tokens[i + 2], ey = +tokens[i + 3]; i += 4
        quadSample(pts, x, y, qx, qy, ex, ey, SAMPLES); pcx = qx; pcy = qy; x = ex; y = ey; break }
      case 'q': { const qx = x + +tokens[i], qy = y + +tokens[i + 1], ex = x + +tokens[i + 2], ey = y + +tokens[i + 3]; i += 4
        quadSample(pts, x, y, qx, qy, ex, ey, SAMPLES); pcx = qx; pcy = qy; x = ex; y = ey; break }
      case 'T': { const tcx = 2 * x - pcx, tcy = 2 * y - pcy, ex = +tokens[i], ey = +tokens[i + 1]; i += 2
        quadSample(pts, x, y, tcx, tcy, ex, ey, SAMPLES); pcx = tcx; pcy = tcy; x = ex; y = ey; break }
      case 't': { const tcx = 2 * x - pcx, tcy = 2 * y - pcy, ex = x + +tokens[i], ey = y + +tokens[i + 1]; i += 2
        quadSample(pts, x, y, tcx, tcy, ex, ey, SAMPLES); pcx = tcx; pcy = tcy; x = ex; y = ey; break }
      case 'A': case 'a': {
        const isRel = cmd === 'a'
        const ax = (isRel ? x : 0) + +tokens[i + 5]
        const ay = (isRel ? y : 0) + +tokens[i + 6]
        i += 7
        pts.push([ax, ay]); x = ax; y = ay; break
      }
      case 'Z': case 'z': x = sx; y = sy; break
      default: i += 1
    }
    if (!'CcSsQqTt'.includes(cmd)) { pcx = x; pcy = y }
    prev = cmd
  }
  if (pts.length) subs.push(pts)

  if (subs.length <= 1) return subs[0] ?? []
  let best = subs[0]
  let bestArea = -Infinity
  for (const sp of subs) {
    let mnx = Infinity, mny = Infinity, mxx = -Infinity, mxy = -Infinity
    for (const [px, py] of sp) {
      mnx = Math.min(mnx, px); mny = Math.min(mny, py)
      mxx = Math.max(mxx, px); mxy = Math.max(mxy, py)
    }
    const a = (mxx - mnx) * (mxy - mny)
    if (a > bestArea) { bestArea = a; best = sp }
  }
  return best
}

function cubicSample(pts, x0, y0, x1, y1, x2, y2, x3, y3, n) {
  for (let j = 1; j <= n; j += 1) {
    const t = j / n
    const mt = 1 - t
    pts.push([
      mt * mt * mt * x0 + 3 * mt * mt * t * x1 + 3 * mt * t * t * x2 + t * t * t * x3,
      mt * mt * mt * y0 + 3 * mt * mt * t * y1 + 3 * mt * t * t * y2 + t * t * t * y3,
    ])
  }
}

function quadSample(pts, x0, y0, x1, y1, x2, y2, n) {
  for (let j = 1; j <= n; j += 1) {
    const t = j / n
    const mt = 1 - t
    pts.push([
      mt * mt * x0 + 2 * mt * t * x1 + t * t * x2,
      mt * mt * y0 + 2 * mt * t * y1 + t * t * y2,
    ])
  }
}

/**
 * The smallest quad, at a free rotation, that encloses every sampled point.
 *
 * This is what `frame.json.corners` should be, and what `mask_analysis` should
 * export. The obvious alternative — take the four diagonal extremes of the
 * outline — looks right and is systematically wrong: on a rounded corner the
 * diagonal extreme lands *on the arc*, roughly 0.29·r inside the true corner, so
 * the quad ends up marginally smaller than the aperture it is supposed to cover.
 * Rotating-calipers over the convex hull cannot make that mistake.
 */
export function enclosingQuad(points, { outset = 0 } = {}) {
  const hull = convexHull(points)
  if (hull.length < 3) throw new Error('not enough points for an enclosing quad')
  let best = null
  for (let i = 0; i < hull.length; i += 1) {
    const [x0, y0] = hull[i]
    const [x1, y1] = hull[(i + 1) % hull.length]
    const len = Math.hypot(x1 - x0, y1 - y0)
    if (!len) continue
    const ux = (x1 - x0) / len
    const uy = (y1 - y0) / len
    const vx = -uy
    const vy = ux
    let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity
    for (const p of hull) {
      const pu = p[0] * ux + p[1] * uy
      const pv = p[0] * vx + p[1] * vy
      minU = Math.min(minU, pu); maxU = Math.max(maxU, pu)
      minV = Math.min(minV, pv); maxV = Math.max(maxV, pv)
    }
    const area = (maxU - minU) * (maxV - minV)
    if (!best || area < best.area) best = { area, ux, uy, vx, vy, minU, maxU, minV, maxV }
  }
  const o = outset
  const corner = (u, v) => [best.ux * u + best.vx * v, best.uy * u + best.vy * v]
  return [
    corner(best.minU - o, best.minV - o),
    corner(best.maxU + o, best.minV - o),
    corner(best.maxU + o, best.maxV + o),
    corner(best.minU - o, best.maxV + o),
  ]
}

export function convexHull(points) {
  const pts = points.map(([x, y]) => [x, y]).sort((a, b) => a[0] - b[0] || a[1] - b[1])
  if (pts.length < 3) return pts
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
  const lower = []
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop()
    lower.push(p)
  }
  const upper = []
  for (let i = pts.length - 1; i >= 0; i -= 1) {
    const p = pts[i]
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop()
    upper.push(p)
  }
  lower.pop()
  upper.pop()
  return lower.concat(upper)
}
