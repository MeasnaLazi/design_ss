/**
 * app.js — Pipeline orchestrator and UI wiring.
 *
 * Connects file inputs → pipeline steps → output canvas → export.
 */

import { parseSVG }        from './pipeline/svg-parser.js';
import { extractQuad }     from './pipeline/quad-extractor.js';
import { computeCoverCrop } from './pipeline/image-crop.js';
import { computeHomography } from './pipeline/homography.js';
import { WebGLRenderer }   from './pipeline/webgl-renderer.js';
import { composite, exportPNG } from './pipeline/compositor.js';

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let _renderer      = null;  // WebGLRenderer instance (reused)
let _svgText       = null;
let _svgElement    = null;
let _svgViewBox    = null;
let _quad          = null;
let _homography    = null;  // cached homography
let _lastSVGText   = null;  // for homography cache invalidation
let _image         = null;

// Exposed for DevTools unit testing
window.__pipeline = {
  get computeHomography() { return computeHomography; },
  get lastQuad() { return _quad; },
  get lastH() { return _homography; },
};

// ---------------------------------------------------------------------------
// DOM refs
// ---------------------------------------------------------------------------

const svgInput        = document.getElementById('svgInput');
const imgInput        = document.getElementById('imgInput');
const renderBtn       = document.getElementById('renderBtn');
const exportBtn       = document.getElementById('exportBtn');
const outputCanvas    = document.getElementById('outputCanvas');
const glCanvas        = document.getElementById('glCanvas');
const statusEl        = document.getElementById('status');
const errorEl         = document.getElementById('error');
const svgFileName     = document.getElementById('svgFileName');
const imgFileName     = document.getElementById('imgFileName');
const svgDropzone     = document.getElementById('svgDropzone');
const imgDropzone     = document.getElementById('imgDropzone');
const outputSection   = document.getElementById('outputSection');
const progressSteps   = document.querySelectorAll('.step');

// ---------------------------------------------------------------------------
// File input handlers
// ---------------------------------------------------------------------------

svgInput.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  svgFileName.textContent = file.name;
  svgDropzone.classList.add('has-file');
  _svgText = await file.text();
  checkReady();
});

imgInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  imgFileName.textContent = file.name;
  imgDropzone.classList.add('has-file');
  const url = URL.createObjectURL(file);
  _image = new Image();
  _image.onload = () => checkReady();
  _image.onerror = () => showError('Failed to load image file.');
  _image.src = url;
});

// Drag-and-drop support
setupDropzone(svgDropzone, svgInput);
setupDropzone(imgDropzone, imgInput);

function setupDropzone(zone, input) {
  zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('dragover'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    zone.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    if (!file) return;
    // Simulate input change
    const dt = new DataTransfer();
    dt.items.add(file);
    input.files = dt.files;
    input.dispatchEvent(new Event('change'));
  });
  zone.addEventListener('click', () => input.click());
}

function checkReady() {
  const ready = !!_svgText && !!_image;
  renderBtn.disabled = !ready;
  if (ready) renderBtn.classList.add('ready');
  else renderBtn.classList.remove('ready');
}

// ---------------------------------------------------------------------------
// Render button
// ---------------------------------------------------------------------------

renderBtn.addEventListener('click', async () => {
  clearError();
  setStatus('Starting render pipeline…');
  renderBtn.disabled = true;

  try {
    await runPipeline();
  } catch (err) {
    showError(err.message ?? String(err));
    console.error('[app]', err);
  } finally {
    renderBtn.disabled = false;
  }
});

// ---------------------------------------------------------------------------
// Pipeline execution
// ---------------------------------------------------------------------------

async function runPipeline() {
  const dpr = window.devicePixelRatio || 1;

  // ── Step 1: Parse SVG ──────────────────────────────────────────────────
  markStep(0);
  setStatus('Step 1 — Parsing SVG…');
  const { svgElement, screenPath, worldMatrix, viewBox } = parseSVG(_svgText);
  _svgElement = svgElement;
  _svgViewBox = viewBox;
  await tick();

  // ── Step 2: Extract quad ───────────────────────────────────────────────
  markStep(1);
  setStatus('Step 2 — Extracting screen quad…');
  _quad = extractQuad(screenPath, worldMatrix);
  await tick();

  // ── Step 3: Cover crop ─────────────────────────────────────────────────
  markStep(2);
  setStatus('Step 3 — Computing cover crop…');
  const crop = computeCoverCrop(_image, _quad);
  await tick();

  // ── Step 4: Homography ─────────────────────────────────────────────────
  markStep(3);
  setStatus('Step 4 — Computing homography (DLT)…');

  // Cache homography when SVG unchanged
  if (_svgText !== _lastSVGText || !_homography) {
    const srcPts = [[0, 0], [1, 0], [1, 1], [0, 1]];
    _homography = computeHomography(srcPts, _quad);
    _lastSVGText = _svgText;
  }
  await tick();

  // ── Step 5+6: WebGL warp + stencil clip ───────────────────────────────
  markStep(4);
  setStatus('Step 5+6 — Warping (WebGL) and clipping…');

  // Size the WebGL canvas to the viewBox (× DPR for retina)
  glCanvas.width  = Math.round(viewBox.width  * dpr);
  glCanvas.height = Math.round(viewBox.height * dpr);

  // Reuse renderer (single WebGL context)
  if (!_renderer) {
    _renderer = new WebGLRenderer(glCanvas);
  }

  _renderer.render(_image, _homography, crop, _quad, viewBox, dpr);
  await tick();

  // ── Step 7: Composite ──────────────────────────────────────────────────
  markStep(5);
  setStatus('Step 7 — Compositing…');

  outputCanvas.width  = glCanvas.width;
  outputCanvas.height = glCanvas.height;
  // Scale CSS size back to logical pixels
  outputCanvas.style.width  = `${viewBox.width}px`;
  outputCanvas.style.height = `${viewBox.height}px`;

  await composite(glCanvas, svgElement, outputCanvas, viewBox, dpr);

  // Show output
  outputSection.classList.remove('hidden');
  exportBtn.disabled = false;
  markAllDone();
  setStatus('✓ Render complete');
}

// ---------------------------------------------------------------------------
// Export button
// ---------------------------------------------------------------------------

exportBtn.addEventListener('click', async () => {
  try {
    const blob = await exportPNG(outputCanvas);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'mockup-render.png';
    a.click();
    URL.revokeObjectURL(url);
  } catch (err) {
    showError('Export failed: ' + err.message);
  }
});

// ---------------------------------------------------------------------------
// UI helpers
// ---------------------------------------------------------------------------

function setStatus(msg) {
  statusEl.textContent = msg;
}

function showError(msg) {
  errorEl.textContent = '⚠ ' + msg;
  errorEl.classList.remove('hidden');
  statusEl.textContent = 'Error — see message above.';
}

function clearError() {
  errorEl.textContent = '';
  errorEl.classList.add('hidden');
}

function markStep(index) {
  progressSteps.forEach((el, i) => {
    el.classList.toggle('active', i === index);
    el.classList.toggle('done', i < index);
  });
}

function markAllDone() {
  progressSteps.forEach(el => {
    el.classList.remove('active');
    el.classList.add('done');
  });
}

/** Yield to browser for a frame to allow UI to update. */
function tick() {
  return new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));
}
