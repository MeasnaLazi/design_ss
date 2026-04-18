/**
 * image-crop.js — Step 3: Compute cover-mode crop UV rectangle.
 */

/**
 * Compute the UV crop rectangle to cover the screen quad's aspect ratio
 * from the source image, using cover mode (crop to fill, no letterbox).
 *
 * @param {HTMLImageElement|ImageBitmap} image  – the screenshot
 * @param {Array<[number,number]>}       quad   – [TL, TR, BR, BL] in screen space
 * @returns {{ u0: number, v0: number, u1: number, v1: number }}
 *   Values in [0..1] representing the portion of the source image to use.
 */
export function computeCoverCrop(image, quad) {
  const [tl, tr, br, bl] = quad;

  // Compute average width and height of the quad (in SVG coords)
  const quadW = (dist(tl, tr) + dist(bl, br)) / 2;
  const quadH = (dist(tl, bl) + dist(tr, br)) / 2;

  if (quadW <= 0 || quadH <= 0) {
    throw new Error('[image-crop] Quad has zero width or height.');
  }

  const screenAspect = quadW / quadH;  // target aspect ratio
  const imgAspect    = image.width / image.height;

  let u0, v0, u1, v1;

  if (imgAspect > screenAspect) {
    // Image is wider than screen → crop left/right
    const usedWidth = image.height * screenAspect;
    const crop = (image.width - usedWidth) / 2;
    u0 = crop / image.width;
    v0 = 0;
    u1 = (crop + usedWidth) / image.width;
    v1 = 1;
  } else {
    // Image is taller than screen → crop top/bottom
    const usedHeight = image.width / screenAspect;
    const crop = (image.height - usedHeight) / 2;
    u0 = 0;
    v0 = crop / image.height;
    u1 = 1;
    v1 = (crop + usedHeight) / image.height;
  }

  return { u0, v0, u1, v1 };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function dist([x1, y1], [x2, y2]) {
  return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
}
