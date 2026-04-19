/**
 * quad-extractor.js — Step 2: Extract 4 ordered corners from the #screen path.
 *
 * Supports complex SVG paths including cubic/quadratic Bézier curves,
 * arcs, and multi-sub-path elements. When multiple sub-paths exist,
 * the largest (by bounding area) is used for quad extraction.
 */

const EPSILON = 1e-6;

/**
 * Extract a clockwise-ordered quad [TL, TR, BR, BL] from an SVG path element,
 * applying the given world transform to get coordinates in SVG viewport space.
 *
 * @param {SVGPathElement} pathElement  – the #screen path (in a live/parsed document)
 * @param {DOMMatrix} worldMatrix       – accumulated ancestor transforms
 * @returns {Array<[number,number]>}    – 4 corners: [TL, TR, BR, BL]
 * @throws {Error} on degenerate or invalid geometry
 */
export function extractQuad(pathElement, worldMatrix) {
  // Sample along the path to get raw points in local SVG coordinates
  const rawPoints = samplePath(pathElement);

  if (rawPoints.length < 3) {
    throw new Error('[quad-extractor] Path has fewer than 3 sample points — cannot form a quad.');
  }

  // Apply world transform
  const points = rawPoints.map(([x, y]) => {
    const pt = worldMatrix.transformPoint(new DOMPoint(x, y));
    return [pt.x, pt.y];
  });

  // Check for degenerate (all same point)
  validatePoints(points);

  // Detect if path is already a simple quad (4 corners, straight sides)
  const corners = tryExtractAsSimpleQuad(pathElement, worldMatrix);
  let quad;
  if (corners) {
    quad = corners;
  } else {
    // Fallback: convex hull → pick 4 extreme directions
    console.warn('[quad-extractor] Path is not a simple 4-sided polygon; using convex hull fallback.');
    quad = quadFromConvexHull(points);
  }

  // Validate area
  const area = polygonArea(quad);
  if (Math.abs(area) < EPSILON) {
    throw new Error('[quad-extractor] Quad is degenerate (area ≈ 0). Check the #screen path.');
  }

  // Warn on extreme distortion
  const aspectRatio = quadAspectRatio(quad);
  if (aspectRatio > 20 || aspectRatio < 0.05) {
    console.warn(`[quad-extractor] Extreme aspect ratio detected: ${aspectRatio.toFixed(2)}`);
  }

  // Enforce clockwise winding (in SVG +Y-down coordinate space,
  // a clockwise polygon has positive signed area)
  return ensureClockwise(quad);
}

// ---------------------------------------------------------------------------
// Path sampling — full SVG path command support
// ---------------------------------------------------------------------------

/**
 * Sample points along an SVG path element.
 * For straight-segment paths this returns exact segment endpoints.
 * For complex paths (curves), it samples points along each curve segment
 * using Bézier math. If multiple sub-paths exist, only the largest
 * (by bounding-box area) is used.
 *
 * @param {SVGPathElement} pathElement
 * @returns {Array<[number,number]>}
 */
function samplePath(pathElement) {
  const d = pathElement.getAttribute('d') || '';
  if (!d.trim()) {
    throw new Error('[quad-extractor] Path has empty "d" attribute.');
  }

  // Parse all sub-paths from the d attribute
  const subPaths = parsePathData(d);

  if (subPaths.length === 0) {
    throw new Error('[quad-extractor] Could not parse any sub-paths from "d" attribute.');
  }

  // If multiple sub-paths, pick the one with the largest bounding-box area
  let bestSubPath = subPaths[0];
  if (subPaths.length > 1) {
    let bestArea = -Infinity;
    for (const sp of subPaths) {
      const area = boundingBoxArea(sp);
      if (area > bestArea) {
        bestArea = area;
        bestSubPath = sp;
      }
    }
    console.log(`[quad-extractor] ${subPaths.length} sub-paths found; using largest (area=${bestArea.toFixed(0)}).`);
  }

  return deduplicate(bestSubPath);
}

/**
 * Parse an SVG path `d` attribute into arrays of sampled [x,y] points,
 * one array per sub-path (each starting with an M/m command).
 *
 * Supports: M, m, L, l, H, h, V, v, C, c, S, s, Q, q, T, t, A, a, Z, z
 *
 * @param {string} d - SVG path d attribute
 * @returns {Array<Array<[number,number]>>} array of sub-paths
 */
function parsePathData(d) {
  const CURVE_SAMPLES = 16; // segments per curve for sampling

  // Tokenize: split into commands and numbers
  const tokens = tokenizePath(d);

  const subPaths = [];
  let currentSubPath = [];
  let x = 0, y = 0;           // current point
  let startX = 0, startY = 0; // start of current sub-path (for Z)
  let prevCx = 0, prevCy = 0; // last control point (for S/T shorthand)
  let prevCmd = '';
  let i = 0;

  while (i < tokens.length) {
    let cmd = tokens[i];

    // If token is a number, it's an implicit repeat of the previous command
    // (M becomes L after first point, m becomes l)
    if (!isNaN(parseFloat(cmd))) {
      if (prevCmd === 'M') cmd = 'L';
      else if (prevCmd === 'm') cmd = 'l';
      else cmd = prevCmd;
    } else {
      i++;
    }

    switch (cmd) {
      case 'M': {
        // Start a new sub-path
        if (currentSubPath.length > 0) {
          subPaths.push(currentSubPath);
        }
        x = +tokens[i]; y = +tokens[i + 1]; i += 2;
        startX = x; startY = y;
        currentSubPath = [[x, y]];
        break;
      }
      case 'm': {
        if (currentSubPath.length > 0) {
          subPaths.push(currentSubPath);
        }
        x += +tokens[i]; y += +tokens[i + 1]; i += 2;
        startX = x; startY = y;
        currentSubPath = [[x, y]];
        break;
      }
      case 'L': {
        x = +tokens[i]; y = +tokens[i + 1]; i += 2;
        currentSubPath.push([x, y]);
        break;
      }
      case 'l': {
        x += +tokens[i]; y += +tokens[i + 1]; i += 2;
        currentSubPath.push([x, y]);
        break;
      }
      case 'H': {
        x = +tokens[i]; i++;
        currentSubPath.push([x, y]);
        break;
      }
      case 'h': {
        x += +tokens[i]; i++;
        currentSubPath.push([x, y]);
        break;
      }
      case 'V': {
        y = +tokens[i]; i++;
        currentSubPath.push([x, y]);
        break;
      }
      case 'v': {
        y += +tokens[i]; i++;
        currentSubPath.push([x, y]);
        break;
      }
      case 'C': {
        // Cubic Bézier: C x1 y1 x2 y2 x y
        const x1 = +tokens[i], y1 = +tokens[i + 1];
        const x2 = +tokens[i + 2], y2 = +tokens[i + 3];
        const ex = +tokens[i + 4], ey = +tokens[i + 5];
        i += 6;
        sampleCubicBezier(currentSubPath, x, y, x1, y1, x2, y2, ex, ey, CURVE_SAMPLES);
        prevCx = x2; prevCy = y2;
        x = ex; y = ey;
        break;
      }
      case 'c': {
        const x1 = x + +tokens[i], y1 = y + +tokens[i + 1];
        const x2 = x + +tokens[i + 2], y2 = y + +tokens[i + 3];
        const ex = x + +tokens[i + 4], ey = y + +tokens[i + 5];
        i += 6;
        sampleCubicBezier(currentSubPath, x, y, x1, y1, x2, y2, ex, ey, CURVE_SAMPLES);
        prevCx = x2; prevCy = y2;
        x = ex; y = ey;
        break;
      }
      case 'S': {
        // Smooth cubic: S x2 y2 x y — reflects previous control point
        const cx1 = 2 * x - prevCx, cy1 = 2 * y - prevCy;
        const x2 = +tokens[i], y2 = +tokens[i + 1];
        const ex = +tokens[i + 2], ey = +tokens[i + 3];
        i += 4;
        sampleCubicBezier(currentSubPath, x, y, cx1, cy1, x2, y2, ex, ey, CURVE_SAMPLES);
        prevCx = x2; prevCy = y2;
        x = ex; y = ey;
        break;
      }
      case 's': {
        const cx1 = 2 * x - prevCx, cy1 = 2 * y - prevCy;
        const x2 = x + +tokens[i], y2 = y + +tokens[i + 1];
        const ex = x + +tokens[i + 2], ey = y + +tokens[i + 3];
        i += 4;
        sampleCubicBezier(currentSubPath, x, y, cx1, cy1, x2, y2, ex, ey, CURVE_SAMPLES);
        prevCx = x2; prevCy = y2;
        x = ex; y = ey;
        break;
      }
      case 'Q': {
        // Quadratic Bézier: Q x1 y1 x y
        const qx1 = +tokens[i], qy1 = +tokens[i + 1];
        const qex = +tokens[i + 2], qey = +tokens[i + 3];
        i += 4;
        sampleQuadBezier(currentSubPath, x, y, qx1, qy1, qex, qey, CURVE_SAMPLES);
        prevCx = qx1; prevCy = qy1;
        x = qex; y = qey;
        break;
      }
      case 'q': {
        const qx1 = x + +tokens[i], qy1 = y + +tokens[i + 1];
        const qex = x + +tokens[i + 2], qey = y + +tokens[i + 3];
        i += 4;
        sampleQuadBezier(currentSubPath, x, y, qx1, qy1, qex, qey, CURVE_SAMPLES);
        prevCx = qx1; prevCy = qy1;
        x = qex; y = qey;
        break;
      }
      case 'T': {
        // Smooth quadratic: T x y
        const tcx = 2 * x - prevCx, tcy = 2 * y - prevCy;
        const tex = +tokens[i], tey = +tokens[i + 1];
        i += 2;
        sampleQuadBezier(currentSubPath, x, y, tcx, tcy, tex, tey, CURVE_SAMPLES);
        prevCx = tcx; prevCy = tcy;
        x = tex; y = tey;
        break;
      }
      case 't': {
        const tcx = 2 * x - prevCx, tcy = 2 * y - prevCy;
        const tex = x + +tokens[i], tey = y + +tokens[i + 1];
        i += 2;
        sampleQuadBezier(currentSubPath, x, y, tcx, tcy, tex, tey, CURVE_SAMPLES);
        prevCx = tcx; prevCy = tcy;
        x = tex; y = tey;
        break;
      }
      case 'A': {
        // Arc: A rx ry rotation largeArc sweep x y
        const rx = +tokens[i], ry = +tokens[i + 1];
        const rotation = +tokens[i + 2];
        const largeArc = +tokens[i + 3];
        const sweep = +tokens[i + 4];
        const ax = +tokens[i + 5], ay = +tokens[i + 6];
        i += 7;
        sampleArc(currentSubPath, x, y, rx, ry, rotation, largeArc, sweep, ax, ay, CURVE_SAMPLES);
        x = ax; y = ay;
        break;
      }
      case 'a': {
        const rx = +tokens[i], ry = +tokens[i + 1];
        const rotation = +tokens[i + 2];
        const largeArc = +tokens[i + 3];
        const sweep = +tokens[i + 4];
        const ax = x + +tokens[i + 5], ay = y + +tokens[i + 6];
        i += 7;
        sampleArc(currentSubPath, x, y, rx, ry, rotation, largeArc, sweep, ax, ay, CURVE_SAMPLES);
        x = ax; y = ay;
        break;
      }
      case 'Z':
      case 'z': {
        x = startX; y = startY;
        // Don't push start point again (deduplicate handles this)
        break;
      }
      default: {
        console.warn(`[quad-extractor] Unknown path command: ${cmd}`);
        i++;
      }
    }

    // Track previous command for S/T reflection
    if (cmd !== 'C' && cmd !== 'c' && cmd !== 'S' && cmd !== 's' &&
        cmd !== 'Q' && cmd !== 'q' && cmd !== 'T' && cmd !== 't') {
      prevCx = x;
      prevCy = y;
    }
    prevCmd = cmd;
  }

  // Push last sub-path
  if (currentSubPath.length > 0) {
    subPaths.push(currentSubPath);
  }

  return subPaths;
}

/**
 * Tokenize an SVG path `d` string into an array of command letters and numbers.
 * Handles negative numbers, decimals, and comma/space separation correctly.
 *
 * @param {string} d
 * @returns {string[]}
 */
function tokenizePath(d) {
  const tokens = [];
  // This regex matches: command letters OR signed/unsigned decimal numbers
  const re = /([MmLlHhVvCcSsQqTtAaZz])|([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)/g;
  let match;
  while ((match = re.exec(d)) !== null) {
    tokens.push(match[0]);
  }
  return tokens;
}

// ---------------------------------------------------------------------------
// Bézier curve sampling
// ---------------------------------------------------------------------------

/**
 * Sample points along a cubic Bézier curve and push to the points array.
 * Does NOT include the start point (it's already the current point).
 */
function sampleCubicBezier(points, x0, y0, x1, y1, x2, y2, x3, y3, segments) {
  for (let j = 1; j <= segments; j++) {
    const t = j / segments;
    const mt = 1 - t;
    const mt2 = mt * mt;
    const mt3 = mt2 * mt;
    const t2 = t * t;
    const t3 = t2 * t;
    const px = mt3 * x0 + 3 * mt2 * t * x1 + 3 * mt * t2 * x2 + t3 * x3;
    const py = mt3 * y0 + 3 * mt2 * t * y1 + 3 * mt * t2 * y2 + t3 * y3;
    points.push([px, py]);
  }
}

/**
 * Sample points along a quadratic Bézier curve and push to the points array.
 */
function sampleQuadBezier(points, x0, y0, x1, y1, x2, y2, segments) {
  for (let j = 1; j <= segments; j++) {
    const t = j / segments;
    const mt = 1 - t;
    const px = mt * mt * x0 + 2 * mt * t * x1 + t * t * x2;
    const py = mt * mt * y0 + 2 * mt * t * y1 + t * t * y2;
    points.push([px, py]);
  }
}

/**
 * Approximate an SVG arc as a series of line segments.
 * Uses the endpoint-to-center parameterization.
 */
function sampleArc(points, x1, y1, rx, ry, rotation, largeArcFlag, sweepFlag, x2, y2, segments) {
  // Degenerate: zero radius = straight line
  if (rx === 0 || ry === 0) {
    points.push([x2, y2]);
    return;
  }

  rx = Math.abs(rx);
  ry = Math.abs(ry);
  const phi = (rotation * Math.PI) / 180;
  const cosPhi = Math.cos(phi);
  const sinPhi = Math.sin(phi);

  // Step 1: midpoint on rotated coords
  const dx = (x1 - x2) / 2;
  const dy = (y1 - y2) / 2;
  const x1p = cosPhi * dx + sinPhi * dy;
  const y1p = -sinPhi * dx + cosPhi * dy;

  // Step 2: scale radii if necessary
  let lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lambda > 1) {
    const sqrtLambda = Math.sqrt(lambda);
    rx *= sqrtLambda;
    ry *= sqrtLambda;
  }

  // Step 3: center in rotated coords
  const num = Math.max(0,
    rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p
  );
  const den = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
  let sq = den > 0 ? Math.sqrt(num / den) : 0;
  if (largeArcFlag === sweepFlag) sq = -sq;

  const cxp = sq * (rx * y1p) / ry;
  const cyp = sq * -(ry * x1p) / rx;

  // Step 4: center in original coords
  const cx = cosPhi * cxp - sinPhi * cyp + (x1 + x2) / 2;
  const cy = sinPhi * cxp + cosPhi * cyp + (y1 + y2) / 2;

  // Step 5: angles
  const theta1 = angleBetween(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
  let dTheta = angleBetween(
    (x1p - cxp) / rx, (y1p - cyp) / ry,
    (-x1p - cxp) / rx, (-y1p - cyp) / ry
  );

  if (!sweepFlag && dTheta > 0) dTheta -= 2 * Math.PI;
  if (sweepFlag && dTheta < 0) dTheta += 2 * Math.PI;

  // Sample along the arc
  for (let j = 1; j <= segments; j++) {
    const t = j / segments;
    const angle = theta1 + dTheta * t;
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);
    const px = cosPhi * rx * cosA - sinPhi * ry * sinA + cx;
    const py = sinPhi * rx * cosA + cosPhi * ry * sinA + cy;
    points.push([px, py]);
  }
}

/** Angle between two vectors in radians. */
function angleBetween(ux, uy, vx, vy) {
  const dot = ux * vx + uy * vy;
  const len = Math.sqrt((ux * ux + uy * uy) * (vx * vx + vy * vy));
  let angle = Math.acos(Math.max(-1, Math.min(1, dot / (len || 1))));
  if (ux * vy - uy * vx < 0) angle = -angle;
  return angle;
}

// ---------------------------------------------------------------------------
// Simple quad detection (fast path for M L L L Z)
// ---------------------------------------------------------------------------

/**
 * Parse simple path commands (M, L, Z, m, l, H, h, V, v) and return endpoints.
 * Returns null if path uses curves (C, S, Q, T, A).
 */
function extractSegmentEndpoints(d) {
  if (/[CcSsQqTtAa]/.test(d)) return null; // curves present

  const tokens = d.replace(/([MmLlHhVvZz])/g, ' $1 ').trim().split(/\s+/);
  const points = [];
  let cmd = 'M';
  let x = 0, y = 0;
  let k = 0;

  while (k < tokens.length) {
    const t = tokens[k];
    if (/^[MmLlHhVvZz]$/.test(t)) {
      cmd = t;
      k++;
      continue;
    }

    switch (cmd) {
      case 'M': x = +tokens[k]; y = +tokens[k + 1]; k += 2; points.push([x, y]); break;
      case 'm': x += +tokens[k]; y += +tokens[k + 1]; k += 2; points.push([x, y]); break;
      case 'L': x = +tokens[k]; y = +tokens[k + 1]; k += 2; points.push([x, y]); break;
      case 'l': x += +tokens[k]; y += +tokens[k + 1]; k += 2; points.push([x, y]); break;
      case 'H': x = +tokens[k]; k++; points.push([x, y]); break;
      case 'h': x += +tokens[k]; k++; points.push([x, y]); break;
      case 'V': y = +tokens[k]; k++; points.push([x, y]); break;
      case 'v': y += +tokens[k]; k++; points.push([x, y]); break;
      case 'Z':
      case 'z': k++; break;
      default: k++;
    }
  }

  // Remove closing duplicate if Z brings us back to start
  if (points.length > 1) {
    const first = points[0], last = points[points.length - 1];
    if (dist(first, last) < EPSILON) points.pop();
  }

  return points.length >= 3 ? points : null;
}

/**
 * If the path is already a 4-point polygon, return its 4 transformed corners.
 * Otherwise returns null.
 */
function tryExtractAsSimpleQuad(pathElement, worldMatrix) {
  const d = pathElement.getAttribute('d') || '';
  if (/[CcSsQqTtAa]/.test(d)) return null;

  const pts = extractSegmentEndpoints(d);
  if (!pts || pts.length !== 4) return null;

  return pts.map(([x, y]) => {
    const p = worldMatrix.transformPoint(new DOMPoint(x, y));
    return [p.x, p.y];
  });
}

// ---------------------------------------------------------------------------
// Bounding box for sub-path selection
// ---------------------------------------------------------------------------

/** Compute bounding-box area of a point array to rank sub-paths by size. */
function boundingBoxArea(points) {
  if (points.length === 0) return 0;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of points) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return (maxX - minX) * (maxY - minY);
}

// ---------------------------------------------------------------------------
// Convex hull → 4-point quad
// ---------------------------------------------------------------------------

/**
 * Compute convex hull (Graham scan) then select 4 corners as the
 * extremes in 4 diagonal directions.
 */
function quadFromConvexHull(points) {
  const hull = convexHull(points);

  // Find 4 extreme points in diagonal directions
  const dirs = [
    [-1, -1], // top-left
    [1, -1],  // top-right
    [1, 1],   // bottom-right
    [-1, 1],  // bottom-left
  ];

  return dirs.map(([dx, dy]) => {
    let best = null, bestScore = -Infinity;
    for (const p of hull) {
      const score = p[0] * dx + p[1] * dy;
      if (score > bestScore) { bestScore = score; best = p; }
    }
    return best;
  });
}

/** Graham scan convex hull, O(n log n). */
function convexHull(points) {
  const pts = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (O, A, B) => (A[0] - O[0]) * (B[1] - O[1]) - (A[1] - O[1]) * (B[0] - O[0]);

  const lower = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
      lower.pop();
    }
    lower.push(p);
  }

  const upper = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
      upper.pop();
    }
    upper.push(p);
  }

  upper.pop();
  lower.pop();
  return lower.concat(upper);
}

// ---------------------------------------------------------------------------
// Winding order
// ---------------------------------------------------------------------------

/** Signed area (positive = clockwise in SVG +Y-down coords) */
function polygonArea(pts) {
  let area = 0;
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[(i + 1) % n];
    area += x1 * y2 - x2 * y1;
  }
  return area / 2;
}

function ensureClockwise(quad) {
  const area = polygonArea(quad);
  // In SVG: clockwise = positive area (because Y is downward)
  return area > 0 ? quad : [...quad].reverse();
}

/** Rough aspect ratio from quad width/height */
function quadAspectRatio(quad) {
  const [tl, tr, br, bl] = quad;
  const w = (dist(tl, tr) + dist(bl, br)) / 2;
  const h = (dist(tl, bl) + dist(tr, br)) / 2;
  return h > 0 ? w / h : Infinity;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function dist([x1, y1], [x2, y2]) {
  return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
}

function deduplicate(points) {
  return points.filter((p, i) => {
    if (i === 0) return true;
    return dist(p, points[i - 1]) > EPSILON;
  });
}

function validatePoints(points) {
  for (const [x, y] of points) {
    if (!isFinite(x) || !isFinite(y)) {
      throw new Error(`[quad-extractor] Point contains NaN or Infinity: (${x}, ${y})`);
    }
  }
}
