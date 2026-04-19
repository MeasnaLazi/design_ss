/**
 * app.js — Pipeline orchestrator and UI wiring.
 *
 * Connects file inputs → OpenCV.js compositing pipeline → output canvas → export.
 */

import { parseSVG }              from './pipeline/svg-parser.js';
import { compositeWithOpenCV }   from './pipeline/opencv-compositor.js';

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let _svgText    = null;
let _image      = null;
let _cvReady    = false;

// ---------------------------------------------------------------------------
// DOM refs
// ---------------------------------------------------------------------------

const svgInput      = document.getElementById('svgInput');
const imgInput      = document.getElementById('imgInput');
const renderBtn     = document.getElementById('renderBtn');
const exportBtn     = document.getElementById('exportBtn');
const outputCanvas  = document.getElementById('outputCanvas');
const statusEl      = document.getElementById('status');
const errorEl       = document.getElementById('error');
const svgFileName   = document.getElementById('svgFileName');
const imgFileName   = document.getElementById('imgFileName');
const svgDropzone   = document.getElementById('svgDropzone');
const imgDropzone   = document.getElementById('imgDropzone');
const outputSection = document.getElementById('outputSection');
const progressSteps = document.querySelectorAll('.step');
const cvStatusEl    = document.getElementById('cvStatus');

// ---------------------------------------------------------------------------
// OpenCV.js loading
// ---------------------------------------------------------------------------

function initOpenCV() {
  if (typeof cv !== 'undefined' && cv.Mat) {
    onCVReady();
    return;
  }

  // OpenCV.js fires cv['onRuntimeInitialized'] when ready
  const checkCV = () => {
    if (typeof cv !== 'undefined') {
      if (cv.Mat) {
        onCVReady();
      } else {
        cv['onRuntimeInitialized'] = () => onCVReady();
      }
    } else {
      // Script hasn't loaded yet, poll
      setTimeout(checkCV, 200);
    }
  };
  checkCV();
}

function onCVReady() {
  _cvReady = true;
  if (cvStatusEl) {
    cvStatusEl.textContent = '✓ OpenCV.js loaded';
    cvStatusEl.style.color = '#44dd88';
  }
  checkReady();
}

initOpenCV();

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
    const dt = new DataTransfer();
    dt.items.add(file);
    input.files = dt.files;
    input.dispatchEvent(new Event('change'));
  });
  zone.addEventListener('click', () => input.click());
}

function checkReady() {
  const ready = !!_svgText && !!_image && _cvReady;
  renderBtn.disabled = !ready;
  if (ready) {
    renderBtn.classList.add('ready');
  } else {
    renderBtn.classList.remove('ready');
    if (_svgText && _image && !_cvReady) {
      setStatus('Waiting for OpenCV.js to load…');
    }
  }
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
  // ── Step 1: Parse SVG ──────────────────────────────────────────────────
  markStep(0);
  setStatus('Step 1 — Parsing SVG…');
  const { svgElement, screenPath, worldMatrix, viewBox } = parseSVG(_svgText);
  await tick();

  // ── Step 2: OpenCV Mask + Composite ────────────────────────────────────
  markStep(1);
  setStatus('Step 2 — Creating mask & compositing with OpenCV.js…');
  await tick();

  const info = await compositeWithOpenCV(
    _svgText, screenPath, worldMatrix, viewBox, _image, outputCanvas
  );
  await tick();

  // ── Step 3: Done ───────────────────────────────────────────────────────
  markStep(2);
  setStatus('Step 3 — Finalizing…');

  // Size CSS to logical pixels
  outputCanvas.style.width  = `${viewBox.width}px`;
  outputCanvas.style.height = `${viewBox.height}px`;

  // Show output
  outputSection.classList.remove('hidden');
  exportBtn.disabled = false;
  markAllDone();
  setStatus(`✓ Render complete — ${info.pointCount} path points, bbox ${info.bbox.w}×${info.bbox.h}`);
}

// ---------------------------------------------------------------------------
// Export button
// ---------------------------------------------------------------------------

exportBtn.addEventListener('click', async () => {
  try {
    outputCanvas.toBlob(blob => {
      if (!blob) { showError('Export failed: blob is null.'); return; }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'mockup-render.png';
      a.click();
      URL.revokeObjectURL(url);
    }, 'image/png');
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
