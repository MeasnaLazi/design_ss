/**
 * opencv-compositor.js — OpenCV.js-based screen compositing.
 *
 * Uses cv.fillPoly to create a pixel-perfect mask from the full #screen path
 * (including cubic/quadratic Bézier curves), then composites the user's
 * screenshot into the masked area with the SVG device frame on top.
 *
 * Requires OpenCV.js to be loaded globally (window.cv).
 *
 * ## Why this agrees with the shipping renderer now
 *
 * Two things used to make this tool flatter its own numbers:
 *
 * 1. It sampled the aperture with a private copy of the path sampler. That copy
 *    now lives in `composer/screen-geometry.mjs` and is shared with
 *    `device-frames.mjs`, so both cut the same shape.
 * 2. It *stretched* the screenshot onto the quad while the renderer
 *    cover-crops. Stretching fills any quad you drag, which is precisely the
 *    error a measuring instrument must not hide, so `fit` now defaults to
 *    'cover' and uses the renderer's own `coverCropRect`.
 *
 * What still differs, deliberately: the mask. This composites
 * `warped.copyTo(result, mask)` — an exact, binary, aliased cut — where the
 * browser antialiases `clip-path: path()` against the panel behind it. Expect
 * agreement to the pixel in the interior and a soft edge either side of the
 * boundary in the browser.
 */
import { sampleScreenPath, applyAffine, isIdentityAffine } from './svg-parser.js';
import { coverCropRect } from '../../composer/homography.mjs';

export { sampleScreenPath };

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Composite a screenshot into an SVG device mockup's #screen region.
 *
 * @param {string}          svgText     – raw SVG markup
 * @param {string}          screenPathD – the #screen outline as path data
 * @param {number[]}        worldMatrix – accumulated ancestor transforms (2x3 affine)
 * @param {{ x,y,width,height }} viewBox – SVG viewBox
 * @param {HTMLImageElement} image      – the screenshot to insert
 * @param {HTMLCanvasElement} outputCanvas – canvas to draw the result onto
 * @returns {Promise<void>}
 */
export async function compositeWithOpenCV(svgText, screenPathD, worldMatrix, viewBox, image, outputCanvas, opts = {}) {
  const W = Math.round(viewBox.width);
  const H = Math.round(viewBox.height);

  // 1. Sample the full #screen path with Bézier math
  const worldPts = toWorldPts(screenPathD, worldMatrix);

  console.log(`[opencv-compositor] Sampled ${worldPts.length} path points`);

  // 2. Render the SVG frame (with #screen hidden)
  const frameCanvas = await renderSVGFrame(svgText, W, H);

  // 3. Create the screen mask using cv.fillPoly
  const { maskMat, bbox } = createScreenMask(worldPts, W, H);

  // 4. Find the minimum enclosing rotated rectangle around ALL mask points.
  //    This guarantees: (a) full coverage of the mask, (b) correct perspective angle
  const enclosingQuad = findEnclosingQuad(worldPts, W, H);
  console.log('[opencv-compositor] Enclosing quad:', enclosingQuad);

  // 5. Perspective-warp the screenshot into the enclosing quad, then mask & composite
  const screenshotCanvas = imageToCanvas(image);
  const screenshotMat = cv.imread(screenshotCanvas);

  const result = composite(frameCanvas, screenshotMat, maskMat, enclosingQuad, W, H, opts.fit);

  // 6. Write to output canvas
  outputCanvas.width = W;
  outputCanvas.height = H;
  cv.imshow(outputCanvas, result);

  // Cleanup
  maskMat.delete();
  screenshotMat.delete();
  result.delete();

  return { bbox, pointCount: worldPts.length };
}

/**
 * Same as {@link compositeWithOpenCV}, but uses caller-supplied quad corners (TL→TR→BR→BL)
 * in viewBox space for the perspective warp instead of {@link findEnclosingQuad}.
 *
 * @param {string} svgText
 * @param {string} screenPathD
 * @param {number[]} worldMatrix
 * @param {{ width: number, height: number }} viewBox
 * @param {HTMLImageElement} image
 * @param {Array<[number,number]>} userQuad - [tl, tr, br, bl]
 * @param {HTMLCanvasElement} outputCanvas
 */
export async function compositeWithUserQuad(svgText, screenPathD, worldMatrix, viewBox, image, userQuad, outputCanvas, opts = {}) {
  const W = Math.round(viewBox.width);
  const H = Math.round(viewBox.height);

  const worldPts = toWorldPts(screenPathD, worldMatrix);

  const frameCanvas = await renderSVGFrame(svgText, W, H);
  const { maskMat, bbox } = createScreenMask(worldPts, W, H);

  const screenshotCanvas = imageToCanvas(image);
  const screenshotMat = cv.imread(screenshotCanvas);

  const quad = userQuad.map(([x, y]) => [Number(x), Number(y)]);

  const result = composite(frameCanvas, screenshotMat, maskMat, quad, W, H, opts.fit);

  outputCanvas.width = W;
  outputCanvas.height = H;
  cv.imshow(outputCanvas, result);

  maskMat.delete();
  screenshotMat.delete();
  result.delete();

  return { bbox, pointCount: worldPts.length };
}

/**
 * Create just the mask canvas for preview/debug purposes.
 *
 * @param {string} screenPathD
 * @param {number[]}      worldMatrix
 * @param {{ width, height }} viewBox
 * @param {HTMLCanvasElement} maskCanvas
 */
export function renderMask(screenPathD, worldMatrix, viewBox, maskCanvas) {
  const W = Math.round(viewBox.width);
  const H = Math.round(viewBox.height);

  const worldPts = toWorldPts(screenPathD, worldMatrix);

  const { maskMat } = createScreenMask(worldPts, W, H);
  maskCanvas.width = W;
  maskCanvas.height = H;
  cv.imshow(maskCanvas, maskMat);
  maskMat.delete();
}

// ---------------------------------------------------------------------------
// SVG frame rendering (with #screen hidden)
// ---------------------------------------------------------------------------

function renderSVGFrame(svgText, w, h) {
  return new Promise((resolve, reject) => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(svgText, 'image/svg+xml');
    const screen = doc.querySelector('#screen');
    if (screen) {
      screen.setAttribute('fill', 'none');
      screen.setAttribute('stroke', 'none');
      screen.style.fill = 'none';
      screen.style.stroke = 'none';
      screen.style.opacity = '0';
    }

    const serializer = new XMLSerializer();
    const cleanSVG = serializer.serializeToString(doc.documentElement);
    const blob = new Blob([cleanSVG], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');

    // White background to avoid transparency issues with cv.imread
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);

    const img = new Image();
    img.onload = () => {
      ctx.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      resolve(canvas);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('[opencv-compositor] SVG frame render failed'));
    };
    img.src = url;
  });
}

// ---------------------------------------------------------------------------
// Mask creation with cv.fillPoly
// ---------------------------------------------------------------------------

function createScreenMask(worldPts, W, H) {
  const mask = new cv.Mat.zeros(H, W, cv.CV_8UC1);

  const pts = cv.matFromArray(worldPts.length, 1, cv.CV_32SC2,
    worldPts.flatMap(([x, y]) => [x, y])
  );

  const contours = new cv.MatVector();
  contours.push_back(pts);

  const color = new cv.Scalar(255);
  cv.fillPoly(mask, contours, color);

  // Compute bounding box
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of worldPts) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  const bbox = {
    x: Math.max(0, Math.floor(minX)),
    y: Math.max(0, Math.floor(minY)),
    w: Math.min(W, Math.ceil(maxX)) - Math.max(0, Math.floor(minX)),
    h: Math.min(H, Math.ceil(maxY)) - Math.max(0, Math.floor(minY))
  };

  pts.delete();
  contours.delete();

  return { maskMat: mask, bbox };
}

// ---------------------------------------------------------------------------
// Find 4 enclosing quad corners from mask points.
// Uses diagonal scoring to find TL/TR/BR/BL, then expands each corner
// outward by a fixed pixel amount (to cover curved edges between corners),
// clamped to canvas bounds so warpPerspective never clips.
// ---------------------------------------------------------------------------

function findEnclosingQuad(worldPts, W, H) {
  // Find extreme diagonal corners
  let tl, tr, br, bl;
  let tlS = Infinity, trS = -Infinity, brS = -Infinity, blS = Infinity;

  for (const [x, y] of worldPts) {
    const sum = x + y;
    const diff = x - y;
    if (sum < tlS)  { tlS = sum;  tl = [x, y]; }
    if (sum > brS)  { brS = sum;  br = [x, y]; }
    if (diff > trS) { trS = diff; tr = [x, y]; }
    if (diff < blS) { blS = diff; bl = [x, y]; }
  }

  // Expand each corner outward from centroid, then clamp to canvas
  const EXPAND_PX = 20; // pixels to push each corner outward
  const cx = (tl[0] + tr[0] + br[0] + bl[0]) / 4;
  const cy = (tl[1] + tr[1] + br[1] + bl[1]) / 4;

  function expandAndClamp(pt) {
    const dx = pt[0] - cx;
    const dy = pt[1] - cy;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len === 0) return [...pt];
    const nx = dx / len, ny = dy / len;
    return [
      Math.max(0, Math.min(W - 1, pt[0] + nx * EXPAND_PX)),
      Math.max(0, Math.min(H - 1, pt[1] + ny * EXPAND_PX))
    ];
  }

  tl = expandAndClamp(tl);
  tr = expandAndClamp(tr);
  br = expandAndClamp(br);
  bl = expandAndClamp(bl);

  console.log('[opencv-compositor] Quad (expanded+clamped):', {
    TL: `(${tl[0].toFixed(1)}, ${tl[1].toFixed(1)})`,
    TR: `(${tr[0].toFixed(1)}, ${tr[1].toFixed(1)})`,
    BR: `(${br[0].toFixed(1)}, ${br[1].toFixed(1)})`,
    BL: `(${bl[0].toFixed(1)}, ${bl[1].toFixed(1)})`,
  });

  return [tl, tr, br, bl];
}

// ---------------------------------------------------------------------------
// Compositing: perspective-warp screenshot into enclosing quad, mask, overlay
// ---------------------------------------------------------------------------

/** Sample the aperture and push it through the ancestor transform, once. */
function toWorldPts(screenPathD, worldMatrix) {
  const local = sampleScreenPath(screenPathD || '');
  const world = isIdentityAffine(worldMatrix)
    ? local
    : local.map((p) => applyAffine(worldMatrix, p));
  return world.map(([x, y]) => [Math.round(x), Math.round(y)]);
}

/** Average edge lengths of a quad — the aspect the screenshot has to fill. */
function quadAspect(quad) {
  const [tl, tr, br, bl] = quad;
  const d = (p, q) => Math.hypot(q[0] - p[0], q[1] - p[1]);
  const w = (d(tl, tr) + d(bl, br)) / 2;
  const h = (d(tl, bl) + d(tr, br)) / 2;
  return w / h;
}

function composite(frameCanvas, screenshotMat, maskMat, quad, W, H, fit = 'cover') {
  const [tl, tr, br, bl] = quad;
  const imgW = screenshotMat.cols;
  const imgH = screenshotMat.rows;

  // Source: the region of the screenshot that gets mapped onto the quad.
  //
  // 'cover' is the default because it is `device-frames.mjs`'s default, and a
  // measuring tool that quietly stretched where the renderer crops would report
  // a quad as good when its aspect is wrong — stretching fills anything.
  const r = fit === 'stretch'
    ? { x: 0, y: 0, w: imgW, h: imgH }
    : coverCropRect(imgW, imgH, quadAspect(quad));
  const srcPts = cv.matFromArray(4, 1, cv.CV_32FC2, [
    r.x, r.y,
    r.x + r.w, r.y,
    r.x + r.w, r.y + r.h,
    r.x, r.y + r.h
  ]);

  // Destination: 4 corners of the enclosing rotated rectangle
  const dstPts = cv.matFromArray(4, 1, cv.CV_32FC2, [
    tl[0], tl[1],
    tr[0], tr[1],
    br[0], br[1],
    bl[0], bl[1]
  ]);

  // Perspective transform: maps full image → enclosing quad
  const M = cv.getPerspectiveTransform(srcPts, dstPts);

  const warped = new cv.Mat();
  cv.warpPerspective(screenshotMat, warped, M, new cv.Size(W, H),
    cv.INTER_LINEAR, cv.BORDER_CONSTANT, new cv.Scalar(0, 0, 0, 255));

  srcPts.delete();
  dstPts.delete();
  M.delete();

  // Read the SVG frame
  const frameMat = cv.imread(frameCanvas);

  // Start with frame, paste warped image only where mask is white
  const result = new cv.Mat();
  frameMat.copyTo(result);
  warped.copyTo(result, maskMat);

  frameMat.delete();
  warped.delete();

  return result;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function imageToCanvas(img) {
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth || img.width;
  canvas.height = img.naturalHeight || img.height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);
  return canvas;
}

// ---------------------------------------------------------------------------
// Path sampling lives in composer/screen-geometry.mjs, shared with the renderer.
// It was duplicated here once; that is exactly how the two drifted apart.
// ---------------------------------------------------------------------------
