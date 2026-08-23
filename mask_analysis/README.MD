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
- A `<path>` or `<rect>` (rounded corners via `rx`/`ry` are honored) with **`id="screen"`** — the screen region to fill. Other shapes (`circle`, `ellipse`, `polygon`, …) are not converted and will sample as empty.
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
| `../composer/screen-geometry.mjs` | **Shared with the renderer.** Finds `#screen` (`<path>` or `<rect>`), resolves ancestor transforms, samples the outline, computes the enclosing quad |
| `pipeline/svg-parser.js` | Thin adapter over the shared module |
| `pipeline/opencv-compositor.js` | Build mask with `cv.fillPoly`, warp screenshot, composite frame |

The UI calls `compositeWithUserQuad()` so the render uses your dragged corners, not only the auto-detected quad.

## The contract this tool exists to serve

> `frame.json` `corners` is a **warp target** in viewBox space that must fully
> **contain** the `#screen` aperture. The clip is always derived from the SVG.

That is why the exported quad is the *enclosing* rectangle plus a 1-unit outset,
rather than the four extreme points of the outline. In this tool a quad that is
slightly too small costs nothing — the mask cuts to the aperture regardless. In
`composer/device-frames.mjs` there is no mask to save it, and the same numbers
leave panel background showing as a hairline along the screen edge.

After pasting corners into a `frame.json`, verify them:

```bash
node composer/check-schema.mjs --packs
```

It reports, per pose, the margin between the quad and the aperture — and fails if
the aperture escapes.

### What still differs from the renderer, on purpose

- **Antialiasing.** `cv.fillPoly` produces a binary, aliased mask at 1:1 viewBox
  scale. The browser antialiases `clip-path: path()` against the panel behind it,
  at whatever scale the panel puts the device. Expect a soft edge there, crisp
  here.
- **Nothing else.** The aperture, the transform handling, and (with `fit: cover`,
  the default) the screenshot fitting are the same code or the same math.

## How to run

There is no build step or npm install. The app is static HTML + ES modules and must be served over **HTTP** (browsers block `import` from `file://`).

Either this directory or the repository root works as the server root.

```bash
# from mask_analysis/  -> open http://localhost:8080
# from the repo root   -> open http://localhost:8080/mask_analysis/
python3 -m http.server 8080

# or Node (npx, no install required)
npx --yes serve -p 8080
```

`pipeline/svg-parser.js` imports `../../composer/screen-geometry.mjs`, which is
outside this folder and so unreachable when the server is rooted here. The
symlink `mask_analysis/composer -> ../composer` is what keeps that path resolving
under either root; it is checked in, and nothing else uses it.

If that file ever 404s anyway — a checkout without symlink support, a server that
refuses to follow them — the page says so in a banner at the top. It has to,
because the failure is otherwise silent: the module script is discarded whole, so
the page still renders and the Upload button still works, and selecting an SVG
simply does nothing.

### Notes

- **OpenCV.js** is loaded from `https://docs.opencv.org/4.9.0/opencv.js` — you need network access on first load.
- **Google Fonts** (Inter) are used for styling via `index.css`; offline use still works, with fallback system fonts.
- Default placeholder aspect (when no screenshot is loaded) is **1290×2796** for corner labeling only.
- **Fit** defaults to `cover`, matching `device-frames.mjs`. `stretch` is available
  for inspecting the quad itself, but it fills any quad you drag — so it cannot
  show you an aspect-wrong quad. Measure with `cover`.

### Project layout

```
mask_analysis/
├── index.html              # UI and analysis logic
├── index.css               # Styles
├── pipeline/
│   ├── svg-parser.js       # adapter over composer/screen-geometry.mjs
│   └── opencv-compositor.js
└── README.MD
```
