/**
 * opencv-compositor.js — OpenCV.js-based screen compositing.
 *
 * Uses cv.fillPoly to create a pixel-perfect mask from the full #screen path
 * (including cubic/quadratic Bézier curves), then composites the user's
 * screenshot into the masked area with the SVG device frame on top.
 *
 * Requires OpenCV.js to be loaded globally (window.cv).
 */

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Composite a screenshot into an SVG device mockup's #screen region.
 *
 * @param {string}          svgText     – raw SVG markup
 * @param {SVGPathElement}  screenPath  – the #screen path element
 * @param {DOMMatrix}       worldMatrix – accumulated ancestor transforms
 * @param {{ x,y,width,height }} viewBox – SVG viewBox
 * @param {HTMLImageElement} image      – the screenshot to insert
 * @param {HTMLCanvasElement} outputCanvas – canvas to draw the result onto
 * @returns {Promise<void>}
 */
export async function compositeWithOpenCV(svgText, screenPath, worldMatrix, viewBox, image, outputCanvas) {
  const W = Math.round(viewBox.width);
  const H = Math.round(viewBox.height);

  // 1. Sample the full #screen path with Bézier math
  const d = screenPath.getAttribute('d') || '';
  const localPts = sampleScreenPath(d);

  // Apply worldMatrix to get viewport-space polygon
  const worldPts = localPts.map(([x, y]) => {
    const pt = worldMatrix.transformPoint(new DOMPoint(x, y));
    return [Math.round(pt.x), Math.round(pt.y)];
  });

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

  const result = composite(frameCanvas, screenshotMat, maskMat, enclosingQuad, W, H);

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
 * @param {SVGPathElement} screenPath
 * @param {DOMMatrix} worldMatrix
 * @param {{ width: number, height: number }} viewBox
 * @param {HTMLImageElement} image
 * @param {Array<[number,number]>} userQuad - [tl, tr, br, bl]
 * @param {HTMLCanvasElement} outputCanvas
 */
export async function compositeWithUserQuad(svgText, screenPath, worldMatrix, viewBox, image, userQuad, outputCanvas) {
  const W = Math.round(viewBox.width);
  const H = Math.round(viewBox.height);

  const d = screenPath.getAttribute('d') || '';
  const localPts = sampleScreenPath(d);

  const worldPts = localPts.map(([x, y]) => {
    const pt = worldMatrix.transformPoint(new DOMPoint(x, y));
    return [Math.round(pt.x), Math.round(pt.y)];
  });

  const frameCanvas = await renderSVGFrame(svgText, W, H);
  const { maskMat, bbox } = createScreenMask(worldPts, W, H);

  const screenshotCanvas = imageToCanvas(image);
  const screenshotMat = cv.imread(screenshotCanvas);

  const quad = userQuad.map(([x, y]) => [Number(x), Number(y)]);

  const result = composite(frameCanvas, screenshotMat, maskMat, quad, W, H);

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
 * @param {SVGPathElement} screenPath
 * @param {DOMMatrix}      worldMatrix
 * @param {{ width, height }} viewBox
 * @param {HTMLCanvasElement} maskCanvas
 */
export function renderMask(screenPath, worldMatrix, viewBox, maskCanvas) {
  const W = Math.round(viewBox.width);
  const H = Math.round(viewBox.height);

  const d = screenPath.getAttribute('d') || '';
  const localPts = sampleScreenPath(d);
  const worldPts = localPts.map(([x, y]) => {
    const pt = worldMatrix.transformPoint(new DOMPoint(x, y));
    return [Math.round(pt.x), Math.round(pt.y)];
  });

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

function composite(frameCanvas, screenshotMat, maskMat, quad, W, H) {
  const [tl, tr, br, bl] = quad;
  const imgW = screenshotMat.cols;
  const imgH = screenshotMat.rows;

  // Source: 4 corners of the screenshot
  const srcPts = cv.matFromArray(4, 1, cv.CV_32FC2, [
    0, 0,
    imgW, 0,
    imgW, imgH,
    0, imgH
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
// Full SVG path sampler — Bézier curves, all commands, largest sub-path
// ---------------------------------------------------------------------------

/**
 * Sample all points along the #screen path.
 * Handles M, L, H, V, C, S, Q, T, A, Z (absolute + relative).
 * When multiple sub-paths exist, returns the largest by bounding area.
 *
 * @param {string} d - SVG path d attribute
 * @returns {Array<[number,number]>}
 */
export function sampleScreenPath(d) {
  const SAMPLES = 16;
  const re = /([MmLlHhVvCcSsQqTtAaZz])|([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)/g;
  const tokens = []; let m;
  while ((m = re.exec(d)) !== null) tokens.push(m[0]);

  const subs = []; let pts = [];
  let x = 0, y = 0, sx = 0, sy = 0, pcx = 0, pcy = 0, prev = '', i = 0;

  while (i < tokens.length) {
    let cmd = tokens[i];
    if (!isNaN(parseFloat(cmd))) {
      cmd = prev === 'M' ? 'L' : prev === 'm' ? 'l' : prev;
    } else { i++; }

    switch (cmd) {
      case 'M': if (pts.length) subs.push(pts); x=+tokens[i];y=+tokens[i+1];i+=2;sx=x;sy=y;pts=[[x,y]]; break;
      case 'm': if (pts.length) subs.push(pts); x+=+tokens[i];y+=+tokens[i+1];i+=2;sx=x;sy=y;pts=[[x,y]]; break;
      case 'L': x=+tokens[i];y=+tokens[i+1];i+=2;pts.push([x,y]); break;
      case 'l': x+=+tokens[i];y+=+tokens[i+1];i+=2;pts.push([x,y]); break;
      case 'H': x=+tokens[i];i++;pts.push([x,y]); break;
      case 'h': x+=+tokens[i];i++;pts.push([x,y]); break;
      case 'V': y=+tokens[i];i++;pts.push([x,y]); break;
      case 'v': y+=+tokens[i];i++;pts.push([x,y]); break;
      case 'C': { const x1=+tokens[i],y1=+tokens[i+1],x2=+tokens[i+2],y2=+tokens[i+3],ex=+tokens[i+4],ey=+tokens[i+5]; i+=6;
        cubicSample(pts,x,y,x1,y1,x2,y2,ex,ey,SAMPLES); pcx=x2;pcy=y2;x=ex;y=ey; break; }
      case 'c': { const x1=x+ +tokens[i],y1=y+ +tokens[i+1],x2=x+ +tokens[i+2],y2=y+ +tokens[i+3],ex=x+ +tokens[i+4],ey=y+ +tokens[i+5]; i+=6;
        cubicSample(pts,x,y,x1,y1,x2,y2,ex,ey,SAMPLES); pcx=x2;pcy=y2;x=ex;y=ey; break; }
      case 'S': { const cx1=2*x-pcx,cy1=2*y-pcy,x2=+tokens[i],y2=+tokens[i+1],ex=+tokens[i+2],ey=+tokens[i+3]; i+=4;
        cubicSample(pts,x,y,cx1,cy1,x2,y2,ex,ey,SAMPLES); pcx=x2;pcy=y2;x=ex;y=ey; break; }
      case 's': { const cx1=2*x-pcx,cy1=2*y-pcy,x2=x+ +tokens[i],y2=y+ +tokens[i+1],ex=x+ +tokens[i+2],ey=y+ +tokens[i+3]; i+=4;
        cubicSample(pts,x,y,cx1,cy1,x2,y2,ex,ey,SAMPLES); pcx=x2;pcy=y2;x=ex;y=ey; break; }
      case 'Q': { const qx=+tokens[i],qy=+tokens[i+1],ex=+tokens[i+2],ey=+tokens[i+3]; i+=4;
        quadSample(pts,x,y,qx,qy,ex,ey,SAMPLES); pcx=qx;pcy=qy;x=ex;y=ey; break; }
      case 'q': { const qx=x+ +tokens[i],qy=y+ +tokens[i+1],ex=x+ +tokens[i+2],ey=y+ +tokens[i+3]; i+=4;
        quadSample(pts,x,y,qx,qy,ex,ey,SAMPLES); pcx=qx;pcy=qy;x=ex;y=ey; break; }
      case 'T': { const tcx=2*x-pcx,tcy=2*y-pcy,ex=+tokens[i],ey=+tokens[i+1]; i+=2;
        quadSample(pts,x,y,tcx,tcy,ex,ey,SAMPLES); pcx=tcx;pcy=tcy;x=ex;y=ey; break; }
      case 't': { const tcx=2*x-pcx,tcy=2*y-pcy,ex=x+ +tokens[i],ey=y+ +tokens[i+1]; i+=2;
        quadSample(pts,x,y,tcx,tcy,ex,ey,SAMPLES); pcx=tcx;pcy=tcy;x=ex;y=ey; break; }
      case 'A': case 'a': {
        const isRel = cmd==='a';
        const ax=(isRel?x:0)+ +tokens[i+5], ay=(isRel?y:0)+ +tokens[i+6]; i+=7;
        pts.push([ax,ay]); x=ax;y=ay; break;
      }
      case 'Z': case 'z': x=sx;y=sy; break;
      default: i++;
    }
    if (!'CcSsQqTt'.includes(cmd)) { pcx=x;pcy=y; }
    prev = cmd;
  }
  if (pts.length) subs.push(pts);

  // Pick largest sub-path by bounding area
  if (subs.length <= 1) return subs[0] || [];
  let best = subs[0], bestA = -Infinity;
  for (const sp of subs) {
    let mnx=Infinity,mny=Infinity,mxx=-Infinity,mxy=-Infinity;
    for (const [px,py] of sp) { mnx=Math.min(mnx,px);mny=Math.min(mny,py);mxx=Math.max(mxx,px);mxy=Math.max(mxy,py); }
    const a=(mxx-mnx)*(mxy-mny);
    if (a>bestA) { bestA=a; best=sp; }
  }
  return best;
}

function cubicSample(pts,x0,y0,x1,y1,x2,y2,x3,y3,n) {
  for(let j=1;j<=n;j++){const t=j/n,mt=1-t;
    pts.push([mt*mt*mt*x0+3*mt*mt*t*x1+3*mt*t*t*x2+t*t*t*x3,
               mt*mt*mt*y0+3*mt*mt*t*y1+3*mt*t*t*y2+t*t*t*y3]);}
}

function quadSample(pts,x0,y0,x1,y1,x2,y2,n) {
  for(let j=1;j<=n;j++){const t=j/n,mt=1-t;
    pts.push([mt*mt*x0+2*mt*t*x1+t*t*x2,
               mt*mt*y0+2*mt*t*y1+t*t*y2]);}
}
