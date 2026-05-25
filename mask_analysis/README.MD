# Screen mask analysis & render

Browser tool for analyzing device-mockup SVG screen masks, tuning perspective corners, and compositing a screenshot into the frame with OpenCV.js.

## Purpose

Store and marketing mockups often use SVG device frames with a **screen cutout** defined as a path (`id="screen"`). For isometric or perspective frames, the axis-aligned bounding box of that path does not match the real screen shape, so simple width/height metrics are misleading.

This tool:

1. **Parses** the SVG, resolves transforms on `#screen`, and samples the path (including Bézier curves).
2. **Analyzes** the mask: viewBox, bounding box, auto-detected quad (TL/TR/BR/BL), true edge lengths, aspect ratio, and tilt.
3. **Lets you refine** the quad by dragging blue handles in the preview (corners persist when you change the screenshot).
4. **Renders** a final PNG: perspective-warp the screenshot into your quad, clip with a pixel-accurate mask from the full path, and draw the device frame on top.

Use it to validate screen geometry, export corner coordinates as JSON, and produce composited mockups without a desktop image editor.

### Requirements for your SVG

- Root `<svg>` with a `viewBox` (or `width` / `height`).
- A `<path>` (or element) with **`id="screen"`** — the screen region to fill.
- Optional: ancestor `transform` attributes (`matrix`, `translate`, `scale`, `rotate`, `skewX`, `skewY`) are applied when sampling the path.

## How to use

1. **Wait for OpenCV** — The status line should show `✓ OpenCV.js ready` (loaded from the OpenCV CDN on first open).

2. **Upload SVG** — Choose a `.svg` file. The preview shows:
   - Green: sampled `#screen` contour  
   - Red dashed: axis-aligned bounding box (often wrong for perspective)  
   - Blue: screen quad with draggable handles (TL, TR, BR, BL)

3. **Adjust corners** — Drag the blue handles until the quad matches the visible screen area. Replacing the screenshot does **not** reset corners; loading a **new SVG** does.

4. **Read metrics** — The **Metrics** panel reports viewBox size, bbox vs true dimensions, screenshot aspect match, and **Quad JSON** you can copy for other pipelines.

5. **Screenshot & render**
   - Upload a device screenshot (any common image format).
   - Click **Render** when enabled (needs SVG, screenshot, and OpenCV ready).
   - Open **Rendered output** and use **↓ Download PNG** (`mockup.png`).

### Pipeline modules

| File | Role |
|------|------|
| `pipeline/svg-parser.js` | Parse SVG, find `#screen`, resolve world transform and viewBox |
| `pipeline/opencv-compositor.js` | Sample path, build mask with `cv.fillPoly`, warp screenshot, composite frame |

The UI calls `compositeWithUserQuad()` so the render uses your dragged corners, not only the auto-detected quad.

## How to run

There is no build step or npm install. The app is static HTML + ES modules and must be served over **HTTP** (browsers block `import` from `file://`).

From the `mask_analysis` directory:

```bash
# Python 3
python3 -m http.server 8080

# or Node (npx, no install required)
npx --yes serve -p 8080
```

Then open:

**http://localhost:8080**

(or the port your server prints).

### Notes

- **OpenCV.js** is loaded from `https://docs.opencv.org/4.9.0/opencv.js` — you need network access on first load.
- **Google Fonts** (Inter) are used for styling via `index.css`; offline use still works, with fallback system fonts.
- Default placeholder aspect (when no screenshot is loaded) is **1290×2796** for corner labeling only.

### Project layout

```
mask_analysis/
├── index.html              # UI and analysis logic
├── index.css               # Styles
├── pipeline/
│   ├── svg-parser.js
│   └── opencv-compositor.js
└── README.MD
```
