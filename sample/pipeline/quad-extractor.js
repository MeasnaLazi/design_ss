/**
 * quad-extractor.js — Step 2: Extract 4 ordered corners from the #screen path.
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
// Path sampling
// ---------------------------------------------------------------------------

/**
 * Sample points along an SVGPathElement using getPointAtLength.
 * For straight-segment paths (M L L L Z) this returns the exact segment endpoints.
 *
 * @param {SVGPathElement} pathElement
 * @returns {Array<[number,number]>}
 */
function samplePath(pathElement) {
  // First, try to extract segment endpoints directly for simple polygons
  const d = pathElement.getAttribute('d') || '';
  const segmentEndpoints = extractSegmentEndpoints(d);
  if (segmentEndpoints && segmentEndpoints.length >= 3) {
    return segmentEndpoints;
  }

  // Fallback: uniform sampling along path length
  const totalLength = pathElement.getTotalLength ? pathElement.getTotalLength() : 0;
  if (totalLength === 0) {
    throw new Error('[quad-extractor] Path has zero length.');
  }

  const SAMPLES = 200;
  const points = [];
  for (let i = 0; i < SAMPLES; i++) {
    const t = (i / SAMPLES) * totalLength;
    const pt = pathElement.getPointAtLength(t);
    points.push([pt.x, pt.y]);
  }
  return deduplicate(points);
}

/**
 * Parse simple path commands (M, L, Z, m, l, H, h, V, v) and return endpoints.
 * Returns null if path uses curves (C, S, Q, T, A).
 *
 * @param {string} d
 * @returns {Array<[number,number]>|null}
 */
function extractSegmentEndpoints(d) {
  if (/[CcSsQqTtAa]/.test(d)) return null; // curves present

  const tokens = d.replace(/([MmLlHhVvZz])/g, ' $1 ').trim().split(/\s+/);
  const points = [];
  let cmd = 'M';
  let x = 0, y = 0;
  let i = 0;

  while (i < tokens.length) {
    const t = tokens[i];
    if (/^[MmLlHhVvZz]$/.test(t)) {
      cmd = t;
      i++;
      continue;
    }

    switch (cmd) {
      case 'M': x = +tokens[i]; y = +tokens[i + 1]; i += 2; points.push([x, y]); break;
      case 'm': x += +tokens[i]; y += +tokens[i + 1]; i += 2; points.push([x, y]); break;
      case 'L': x = +tokens[i]; y = +tokens[i + 1]; i += 2; points.push([x, y]); break;
      case 'l': x += +tokens[i]; y += +tokens[i + 1]; i += 2; points.push([x, y]); break;
      case 'H': x = +tokens[i]; i++; points.push([x, y]); break;
      case 'h': x += +tokens[i]; i++; points.push([x, y]); break;
      case 'V': y = +tokens[i]; i++; points.push([x, y]); break;
      case 'v': y += +tokens[i]; i++; points.push([x, y]); break;
      case 'Z':
      case 'z': i++; break;
      default: i++;
    }
  }

  // Remove closing duplicate if Z brings us back to start
  if (points.length > 1) {
    const first = points[0], last = points[points.length - 1];
    if (dist(first, last) < EPSILON) points.pop();
  }

  return points.length >= 3 ? points : null;
}

// ---------------------------------------------------------------------------
// Simple quad detection
// ---------------------------------------------------------------------------

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
