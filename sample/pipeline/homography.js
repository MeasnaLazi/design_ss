/**
 * homography.js — Step 4: Normalized DLT homography solver.
 *
 * Computes the 3×3 projective transform matrix H that maps src points → dst points.
 * Uses normalized DLT for numerical stability with a pure-JS eigenvector solver.
 *
 * Sources:
 *   Hartley & Zisserman, "Multiple View Geometry" Ch. 4 (DLT Algorithm 4.1)
 */

const EPSILON = 1e-10;

/**
 * Compute homography from 4 source UV points to 4 destination points.
 *
 * @param {Array<[number,number]>} srcPts  – 4 source points (e.g. unit square corners)
 * @param {Array<[number,number]>} dstPts  – 4 destination points (e.g. quad in SVG space)
 * @returns {Float32Array}  – 9-element column-major 3×3 homography matrix
 * @throws {Error} on degenerate input or near-zero determinant
 */
export function computeHomography(srcPts, dstPts) {
  if (srcPts.length !== 4 || dstPts.length !== 4) {
    throw new Error('[homography] Exactly 4 point correspondences required.');
  }

  validateInputPoints(srcPts);
  validateInputPoints(dstPts);

  // 1. Compute normalization transforms
  const Ts = normalizationMatrix(srcPts);
  const Td = normalizationMatrix(dstPts);

  // 2. Normalize points
  const srcN = srcPts.map(p => applyMatrix3x3(Ts, p));
  const dstN = dstPts.map(p => applyMatrix3x3(Td, p));

  // 3. Build 8×9 matrix A
  const A = buildA(srcN, dstN);

  // 4. Solve Ah = 0 → smallest singular vector of A via AᵀA eigenvector
  const AtA = matMul(transpose(A), A); // 9×9
  const h = smallestEigenvector(AtA);  // length-9 vector

  // 5. Reshape into 3×3 (row-major)
  const Hn = [
    [h[0], h[1], h[2]],
    [h[3], h[4], h[5]],
    [h[6], h[7], h[8]],
  ];

  // 6. Denormalize: H = Td_inv · Hn · Ts
  const TdInv = invertMatrix3x3(Td);
  const H = mat3Mul(mat3Mul(TdInv, Hn), Ts);

  // 7. Normalize so H[2][2] = 1
  const scale = H[2][2];
  if (Math.abs(scale) < EPSILON) {
    throw new Error('[homography] Degenerate homography: H[2][2] ≈ 0.');
  }
  const Hnorm = H.map(row => row.map(v => v / scale));

  // 8. Validate determinant
  const det = det3x3(Hnorm);
  if (Math.abs(det) < EPSILON) {
    throw new Error(`[homography] Near-zero determinant (${det.toExponential(3)}). Input geometry may be degenerate.`);
  }

  // Warn on extreme distortion
  const condNum = conditionNumber(Hnorm);
  if (condNum > 1e6) {
    console.warn(`[homography] High condition number (${condNum.toExponential(2)}) — possible extreme perspective distortion.`);
  }

  console.debug('[homography] H =', Hnorm, 'det =', det.toFixed(6));

  // Return as column-major Float32Array for WebGL
  return toColumnMajor(Hnorm);
}

// ---------------------------------------------------------------------------
// Normalization
// ---------------------------------------------------------------------------

/**
 * Compute isotropic normalization matrix (Hartley 1997).
 * Translates centroid to origin, scales so mean distance to origin = √2.
 *
 * Returns a 3×3 row-major array.
 *
 * @param {Array<[number,number]>} pts
 * @returns {number[][]}
 */
function normalizationMatrix(pts) {
  const n = pts.length;
  let cx = 0, cy = 0;
  for (const [x, y] of pts) { cx += x; cy += y; }
  cx /= n; cy /= n;

  let meanDist = 0;
  for (const [x, y] of pts) {
    meanDist += Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
  }
  meanDist /= n;

  const s = meanDist > EPSILON ? Math.SQRT2 / meanDist : 1;

  return [
    [s,  0, -s * cx],
    [0,  s, -s * cy],
    [0,  0,  1     ],
  ];
}

/** Apply a 3×3 row-major matrix to a 2D point (homogeneous divide). */
function applyMatrix3x3(M, [x, y]) {
  const w = M[2][0] * x + M[2][1] * y + M[2][2];
  return [
    (M[0][0] * x + M[0][1] * y + M[0][2]) / w,
    (M[1][0] * x + M[1][1] * y + M[1][2]) / w,
  ];
}

// ---------------------------------------------------------------------------
// DLT — matrix A construction
// ---------------------------------------------------------------------------

/**
 * Build the 8×9 matrix A for DLT.
 * For each point correspondence (x,y)→(x',y'), two rows:
 *   [-x, -y, -1, 0, 0, 0, x'x, x'y, x']
 *   [0, 0, 0, -x, -y, -1, y'x, y'y, y']
 *
 * @param {Array<[number,number]>} src – normalized source points
 * @param {Array<[number,number]>} dst – normalized destination points
 * @returns {number[][]} 8×9 matrix (row-major)
 */
function buildA(src, dst) {
  const A = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i];
    const [xp, yp] = dst[i];
    A.push([-x, -y, -1,  0,  0,  0, xp * x, xp * y, xp]);
    A.push([ 0,  0,  0, -x, -y, -1, yp * x, yp * y, yp]);
  }
  return A;
}

// ---------------------------------------------------------------------------
// Eigenvalue / SVD via Power Iteration on AᵀA (9×9)
// ---------------------------------------------------------------------------

/**
 * Find the eigenvector corresponding to the SMALLEST eigenvalue of a
 * symmetric positive-semi-definite matrix using inverse power iteration.
 *
 * Since we want the smallest singular vector of A (= smallest eigenvector of AᵀA),
 * we use shifted inverse iteration: solve (AᵀA - σI)v = b.
 *
 * For robustness we use Jacobi SVD on the 9×9 AᵀA matrix.
 *
 * @param {number[][]} M – 9×9 symmetric matrix
 * @returns {number[]} – unit-length 9-vector
 */
function smallestEigenvector(M) {
  const n = 9;

  // Jacobi eigendecomposition for symmetric matrix
  // Returns eigenvectors as columns of V; eigenvalues as array
  const { eigenvalues, eigenvectors } = jacobiEigen(M, n);

  // Find index of smallest eigenvalue
  let minIdx = 0;
  for (let i = 1; i < n; i++) {
    if (eigenvalues[i] < eigenvalues[minIdx]) minIdx = i;
  }

  // Extract column minIdx from eigenvectors (stored column-major)
  const v = new Array(n);
  for (let i = 0; i < n; i++) v[i] = eigenvectors[i * n + minIdx];

  return normalize(v);
}

/**
 * Jacobi cyclic eigendecomposition for an n×n symmetric matrix.
 * Returns eigenvalues[] and eigenvectors as a flat n×n column-major array.
 *
 * Converges in O(n²) sweeps typically; for n=9 this is very fast.
 *
 * @param {number[][]} M – n×n row-major symmetric matrix
 * @param {number} n
 * @returns {{ eigenvalues: number[], eigenvectors: Float64Array }}
 */
function jacobiEigen(M, n) {
  // Copy to flat array (row-major)
  const A = new Float64Array(n * n);
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++)
      A[i * n + j] = M[i][j];

  // Eigenvectors start as identity (column-major for convenient extraction)
  const V = new Float64Array(n * n);
  for (let i = 0; i < n; i++) V[i * n + i] = 1;

  const MAX_ITER = 200;
  for (let iter = 0; iter < MAX_ITER; iter++) {
    // Find largest off-diagonal element
    let maxVal = 0, p = 0, q = 1;
    for (let i = 0; i < n - 1; i++) {
      for (let j = i + 1; j < n; j++) {
        const v = Math.abs(A[i * n + j]);
        if (v > maxVal) { maxVal = v; p = i; q = j; }
      }
    }
    if (maxVal < 1e-14) break; // converged

    // Compute rotation angle
    const App = A[p * n + p];
    const Aqq = A[q * n + q];
    const Apq = A[p * n + q];
    const theta = 0.5 * Math.atan2(2 * Apq, App - Aqq);
    const c = Math.cos(theta);
    const s = Math.sin(theta);

    // Update A
    const newApp = c * c * App - 2 * s * c * Apq + s * s * Aqq;
    const newAqq = s * s * App + 2 * s * c * Apq + c * c * Aqq;
    A[p * n + p] = newApp;
    A[q * n + q] = newAqq;
    A[p * n + q] = 0;
    A[q * n + p] = 0;

    for (let r = 0; r < n; r++) {
      if (r !== p && r !== q) {
        const Arp = A[r * n + p];
        const Arq = A[r * n + q];
        A[r * n + p] = c * Arp - s * Arq;
        A[p * n + r] = c * Arp - s * Arq;
        A[r * n + q] = s * Arp + c * Arq;
        A[q * n + r] = s * Arp + c * Arq;
      }
    }

    // Update eigenvectors (columns)
    for (let r = 0; r < n; r++) {
      const Vrp = V[r * n + p];
      const Vrq = V[r * n + q];
      V[r * n + p] = c * Vrp - s * Vrq;
      V[r * n + q] = s * Vrp + c * Vrq;
    }
  }

  const eigenvalues = new Array(n);
  for (let i = 0; i < n; i++) eigenvalues[i] = A[i * n + i];

  return { eigenvalues, eigenvectors: V };
}

// ---------------------------------------------------------------------------
// Matrix helpers (3×3, row-major arrays of arrays)
// ---------------------------------------------------------------------------

function mat3Mul(A, B) {
  const C = [[0,0,0],[0,0,0],[0,0,0]];
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++)
      for (let k = 0; k < 3; k++)
        C[i][j] += A[i][k] * B[k][j];
  return C;
}

function invertMatrix3x3(M) {
  const [[a,b,c],[d,e,f],[g,h,i_]] = M;
  const det = a*(e*i_-f*h) - b*(d*i_-f*g) + c*(d*h-e*g);
  if (Math.abs(det) < EPSILON) throw new Error('[homography] Cannot invert normalization matrix (det ≈ 0).');
  const inv = 1 / det;
  return [
    [(e*i_-f*h)*inv, (c*h-b*i_)*inv, (b*f-c*e)*inv],
    [(f*g-d*i_)*inv, (a*i_-c*g)*inv, (c*d-a*f)*inv],
    [(d*h-e*g)*inv, (b*g-a*h)*inv, (a*e-b*d)*inv],
  ];
}

function det3x3([[a,b,c],[d,e,f],[g,h,i_]]) {
  return a*(e*i_-f*h) - b*(d*i_-f*g) + c*(d*h-e*g);
}

/** Convert 3×3 row-major → column-major Float32Array for WebGL. */
function toColumnMajor(M) {
  return new Float32Array([
    M[0][0], M[1][0], M[2][0],
    M[0][1], M[1][1], M[2][1],
    M[0][2], M[1][2], M[2][2],
  ]);
}

// ---------------------------------------------------------------------------
// General n×m matrix helpers (for buildA / AᵀA)
// ---------------------------------------------------------------------------

function transpose(A) {
  const rows = A.length, cols = A[0].length;
  return Array.from({ length: cols }, (_, j) => Array.from({ length: rows }, (_, i) => A[i][j]));
}

function matMul(A, B) {
  const m = A.length, n = B[0].length, k = B.length;
  return Array.from({ length: m }, (_, i) =>
    Array.from({ length: n }, (_, j) => {
      let s = 0;
      for (let r = 0; r < k; r++) s += A[i][r] * B[r][j];
      return s;
    })
  );
}

// ---------------------------------------------------------------------------
// Vector helpers
// ---------------------------------------------------------------------------

function normalize(v) {
  const len = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
  return len > EPSILON ? v.map(x => x / len) : v;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function validateInputPoints(pts) {
  for (const [x, y] of pts) {
    if (!isFinite(x) || !isFinite(y)) {
      throw new Error(`[homography] Invalid point: (${x}, ${y})`);
    }
  }
}

function conditionNumber(M) {
  // Rough estimate: max(abs(M)) / min(abs non-zero(M))
  const vals = M.flat().map(Math.abs).filter(v => v > EPSILON);
  if (!vals.length) return Infinity;
  return Math.max(...vals) / Math.min(...vals);
}
