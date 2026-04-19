/**
 * svg-parser.js — Step 1: Parse SVG and resolve #screen path with transforms.
 */

/**
 * Parse an SVG string and return the #screen path element along with
 * its fully-resolved world transform and the SVG root's viewBox.
 *
 * @param {string} svgText
 * @returns {{ svgElement: SVGSVGElement, screenPath: SVGPathElement, worldMatrix: DOMMatrix, viewBox: DOMRect }}
 * @throws {Error} if #screen is not found or SVG is invalid
 */
export function parseSVG(svgText) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgText, 'image/svg+xml');

  // Check for parse errors
  const parseError = doc.querySelector('parsererror');
  if (parseError) {
    throw new Error(`SVG parse error: ${parseError.textContent.trim()}`);
  }

  const svgElement = doc.documentElement;
  if (svgElement.tagName.toLowerCase() !== 'svg') {
    throw new Error('Root element is not <svg>.');
  }

  // Find #screen path
  const screenPath = doc.getElementById('screen');
  if (!screenPath) {
    throw new Error('No element with id="screen" found in SVG.');
  }
  if (screenPath.tagName.toLowerCase() !== 'path') {
    console.warn('[svg-parser] #screen element is not a <path>; proceeding anyway.');
  }

  // Resolve accumulated transform from root → screenPath
  const worldMatrix = resolveWorldTransform(screenPath, svgElement);

  console.log("worldMatrix", worldMatrix);

  // Parse viewBox
  const viewBox = parseViewBox(svgElement);

  return { svgElement, screenPath, worldMatrix, viewBox };
}

/**
 * Walk ancestors from element → root, accumulating transforms into a DOMMatrix.
 * Transforms are applied outermost-first (pre-multiply from root down).
 *
 * @param {Element} element
 * @param {Element} root
 * @returns {DOMMatrix}
 */
function resolveWorldTransform(element, root) {
  const matrices = [];
  let current = element;

  while (current && current !== root.parentElement) {
    const transform = current.getAttribute('transform');
    if (transform) {
      matrices.unshift(parseTransformAttribute(transform));
    }
    current = current.parentElement;
  }

  let result = new DOMMatrix(); // identity
  for (const m of matrices) {
    result = result.multiply(m);
  }
  return result;
}

/**
 * Parse an SVG transform attribute string into a DOMMatrix.
 * Handles: matrix(), translate(), scale(), rotate(), skewX(), skewY().
 *
 * @param {string} transformStr
 * @returns {DOMMatrix}
 */
function parseTransformAttribute(transformStr) {
  let result = new DOMMatrix();

  // Split on transform-list boundaries
  const re = /(\w+)\s*\(([^)]*)\)/g;
  let match;

  while ((match = re.exec(transformStr)) !== null) {
    const fn = match[1].toLowerCase();
    const args = match[2].trim().split(/[\s,]+/).map(Number);

    let m;
    switch (fn) {
      case 'matrix':
        // matrix(a b c d e f)
        m = new DOMMatrix([args[0], args[1], args[2], args[3], args[4], args[5]]);
        break;
      case 'translate':
        m = new DOMMatrix().translate(args[0], args[1] ?? 0);
        break;
      case 'scale':
        m = new DOMMatrix().scale(args[0], args[1] ?? args[0]);
        break;
      case 'rotate': {
        const angle = args[0];
        const cx = args[1] ?? 0;
        const cy = args[2] ?? 0;
        m = new DOMMatrix()
          .translate(cx, cy)
          .rotate(angle)
          .translate(-cx, -cy);
        break;
      }
      case 'skewx':
        m = new DOMMatrix([1, 0, Math.tan((args[0] * Math.PI) / 180), 1, 0, 0]);
        break;
      case 'skewy':
        m = new DOMMatrix([1, Math.tan((args[0] * Math.PI) / 180), 0, 1, 0, 0]);
        break;
      default:
        console.warn(`[svg-parser] Unknown transform function: ${fn}`);
        continue;
    }
    result = result.multiply(m);
  }

  return result;
}

/**
 * Parse the viewBox attribute of the SVG root element.
 * Falls back to width/height attributes if viewBox is absent.
 *
 * @param {SVGSVGElement} svgElement
 * @returns {{ x: number, y: number, width: number, height: number }}
 */
function parseViewBox(svgElement) {
  const vb = svgElement.getAttribute('viewBox');
  if (vb) {
    const parts = vb.trim().split(/[\s,]+/).map(Number);
    if (parts.length === 4 && parts.every(isFinite)) {
      return { x: parts[0], y: parts[1], width: parts[2], height: parts[3] };
    }
  }
  // Fallback
  const w = parseFloat(svgElement.getAttribute('width')) || 800;
  const h = parseFloat(svgElement.getAttribute('height')) || 600;
  return { x: 0, y: 0, width: w, height: h };
}
