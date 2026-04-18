/**
 * compositor.js — Step 7: Composite WebGL warp output + SVG frame.
 *
 * Layer order:
 *   1. Warped screenshot (from WebGL canvas) — bottom
 *   2. SVG device frame (on top)
 */

/**
 * Composite the warped WebGL canvas and the SVG element onto a 2D output canvas.
 *
 * @param {HTMLCanvasElement|OffscreenCanvas} webglCanvas  – rendered warp output
 * @param {SVGSVGElement}                     svgElement   – the parsed SVG document root
 * @param {HTMLCanvasElement}                 outputCanvas – final output canvas
 * @param {{ x,y,width,height }}              viewBox      – SVG viewBox
 * @param {number}                            dpr          – device pixel ratio
 * @returns {Promise<void>}
 */
export async function composite(webglCanvas, svgElement, outputCanvas, viewBox, dpr = 1) {
  const ctx = outputCanvas.getContext('2d');
  if (!ctx) throw new Error('[compositor] Could not get 2D canvas context.');

  const w = outputCanvas.width;
  const h = outputCanvas.height;

  // Clear
  ctx.clearRect(0, 0, w, h);

  // Layer 1: Draw warp result from WebGL canvas
  ctx.drawImage(webglCanvas, 0, 0, w, h);

  // Layer 2: Draw SVG frame on top
  await drawSVGOnCanvas(ctx, svgElement, w, h);
}

/**
 * Serialize an SVG element to a Blob URL, load it as an image,
 * and draw it onto a 2D canvas context.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {SVGSVGElement}            svgElement
 * @param {number}                   w
 * @param {number}                   h
 * @returns {Promise<void>}
 */
async function drawSVGOnCanvas(ctx, svgElement, w, h) {
  // Make #screen transparent so the warped image (drawn beneath) shows through.
  // We mutate the cloned SVG, not the live element, to avoid side-effects.
  const clonedSVG = svgElement.cloneNode(true);
  // Use querySelector as it's more reliable on detached SVG DOM trees
  const screenEl = clonedSVG.querySelector('#screen');
  if (screenEl) {
    screenEl.setAttribute('fill', 'none');
    screenEl.setAttribute('stroke', 'none');
    screenEl.style.fill   = 'none';
    screenEl.style.stroke = 'none';
    screenEl.style.opacity = '0';
  }

  // Serialize the (modified) cloned SVG
  const serializer = new XMLSerializer();
  const svgStr = serializer.serializeToString(clonedSVG);

  // Create a Blob URL
  const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  try {
    const img = await loadImage(url);
    ctx.drawImage(img, 0, 0, w, h);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Export the output canvas as a PNG Blob.
 *
 * @param {HTMLCanvasElement} canvas
 * @returns {Promise<Blob>}
 */
export function exportPNG(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (blob) resolve(blob);
      else reject(new Error('[compositor] canvas.toBlob() returned null.'));
    }, 'image/png');
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`[compositor] Failed to load image: ${src}`));
    img.src = src;
  });
}
