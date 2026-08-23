/**
 * svg-parser.js — locate `#screen` in a pose SVG.
 *
 * This file used to *implement* that: its own DOMParser walk, its own
 * rect-to-path conversion, its own ancestor-transform resolver. The shipping
 * runtime (`composer/device-frames.mjs`) had a different implementation, and the
 * two disagreed — most visibly about `<rect>`-based `#screen` elements, which
 * this tool converted and the runtime did not see at all.
 *
 * So the implementation moved to `composer/screen-geometry.mjs` and both sides
 * now call it. What is left here is an adapter: the shape `index.html` and
 * `opencv-compositor.js` expect, built from the shared answer. Keeping the
 * adapter (rather than importing the shared module everywhere) means the
 * measuring tool's own error messages stay written for the person holding an SVG
 * that will not load.
 *
 * NOTE ON SERVING: the import below reaches outside `mask_analysis/`, so the
 * static server has to be rooted at the repo, not at this directory. See
 * README.MD — `python3 -m http.server 8080` from the repo root, then open
 * /mask_analysis/.
 */
import {
  screenGeometry,
  sampleScreenPath,
  applyAffine,
  isIdentityAffine,
} from '../../composer/screen-geometry.mjs';

export { sampleScreenPath, applyAffine, isIdentityAffine };

/**
 * Parse an SVG string and return the `#screen` outline together with its
 * resolved world transform and the SVG root's viewBox.
 *
 * @param {string} svgText
 * @returns {{ screenPathD: string, tag: string, worldMatrix: number[], viewBox: {x,y,width,height} }}
 * @throws {Error} if the SVG has no usable viewBox or no readable `#screen`
 */
export function parseSVG(svgText) {
  const geo = screenGeometry(svgText);

  if (!geo.viewBox) {
    throw new Error('SVG root has no viewBox (and no usable width/height).');
  }
  if (!geo.d) {
    throw new Error(geo.problems.join('; ') || 'Could not read the #screen aperture.');
  }
  if (geo.viewBox.x !== 0 || geo.viewBox.y !== 0) {
    // Worth refusing rather than quietly mis-measuring: the compositor
    // rasterises from the origin, and `device-frames.mjs` positions its stage
    // there too, so a shifted viewBox would put the screen in the wrong place in
    // both — but only one of them would look wrong to you.
    throw new Error(
      `viewBox starts at (${geo.viewBox.x}, ${geo.viewBox.y}); poses must be exported from the origin.`,
    );
  }

  return {
    screenPathD: geo.d,
    tag: geo.tag,
    worldMatrix: geo.worldMatrix,
    viewBox: geo.viewBox,
  };
}

/**
 * The `#screen` outline sampled into viewBox-space points.
 *
 * @param {{ screenPathD: string, worldMatrix: number[] }} parsed
 * @returns {Array<[number, number]>}
 */
export function outlinePoints(parsed) {
  const local = sampleScreenPath(parsed.screenPathD);
  return isIdentityAffine(parsed.worldMatrix)
    ? local
    : local.map((p) => applyAffine(parsed.worldMatrix, p));
}
