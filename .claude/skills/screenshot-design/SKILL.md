---
name: screenshot-design
disable-model-invocation: true
description: >-
  HTML-first store screenshot design for apps_publisher: ensure the composer +
  web_ui dev stack is ready, read output/screenshot_report.md, author the whole
  strip as one HTML/CSS document per composer/strip-schema.md, render with
  composer/render.mjs, self-review the PNGs against the reference gallery,
  iterate, then hand off to the canvas editor via import-to-canvas.mjs. Use when
  acting as screenshot-design-agent or when the user names this skill.
---

# Screenshot design (HTML-first)

You design store screenshot strips by **writing one HTML/CSS document** and
looking at rendered PNGs — not by enqueueing canvas operations. The full CSS
vocabulary is yours: gradients, shadows, glows, overlap, cropping, asymmetry,
decorative shapes, real screenshots inside device frames.

## Preflight (dev stack)

Before the first render, from the publisher repo root:

- **Composer deps** — if `composer/node_modules` is missing, run `cd composer && npm install`, then ensure the browser: `npx playwright install chromium` (idempotent).
- **web_ui** — only needed for the optional `import-to-canvas` handoff (not for rendering or reviewing). If you will import, ensure `web_ui/node_modules` is installed and the Vite dev server is up on **4713** (`cd web_ui && npm run dev`, background) with a designer tab open on the target artboard.
- Node 22.x (see `web_ui/.nvmrc`). The `screenshot-brief` helper scripts need no install.

## Required reading (order)

1. This skill.
2. **`composer/strip-schema.md`** — the layer contract your HTML must follow
   (panel structure, `data-layer` kinds, device block attributes, z-order note,
   render commands).
3. **`canvas-api-reference.md`** (this folder) — the authoritative canvas
   **operation contract**. Read it **before sending any canvas op directly**
   (user-requested live tweaks). It lists every valid operation, its args, the
   `layer_id` / `panel_index` conventions, and how to read **live `layer_id`s**
   from the snapshot — the fix for "layer not found" / "label not found" errors.

## Inputs

| Source | Use |
| --- | --- |
| `output/screenshot_report.md` | Per panel: Title, Subtitle, Description, **Summary for designer**; plus Overview and **Theme**. Same rules as before: exactly one title + one subtitle per panel; description → caption only when it earns its place. |
| `output/appstore.json` / `output/playstore.json` | Theme hex + verbatim copy (never mix stores). |
| `datasource/screenshots/<preset>/` | **Real app screenshots — preferred, never blocking.** Look at the PNGs before designing; pick the screen that proves each panel's claim. If a panel has no matching real capture (or the user asks for empty screens), **omit `data-screenshot`** — the frame renders with a blank screen filled by `data-screen-fallback` (pick a theme-fitting hex). Proceed with the design and list the gaps in your final message; **do not** stop to ask for uploads. |
| `composer/references/` | Reference strips for self-review (see § Self-review). |

## Workflow

1. **Absorb the brief.** Read the report, the theme, and the actual app
   screenshots. Write a 3–5 line strip concept: mood, background system,
   pose rhythm across panels (vary them), which panel is the dark/accent
   inversion if any.
2. **Author the strip** at `output/strips/<store>_strip.html` following
   `composer/strip-schema.md`. One document = whole strip; design it as one
   composition (continuity, rhythm), not five islands.
3. **Render:** `node composer/render.mjs --strip output/strips/<store>_strip.html --out output/strips/rendered --full`
4. **Look at every panel PNG** (multimodal) and self-review (§ below).
   Edit the HTML and re-render. Iterate freely — renders are cheap. Stop when
   a render shows no improvement over the previous one, or after ~4 rounds.
5. **Present** the panels to the user for review, then hand off to the editor
   with `node composer/import-to-canvas.mjs --strip output/strips/<store>_strip.html --preset <preset>`.

## Handoff to canvas (optional, after user approval)

When the user wants to continue editing in the Fabric canvas:

```bash
node composer/import-to-canvas.mjs --strip output/strips/<store>_strip.html --preset <preset>
```

Requires the dev server running and a designer tab open on the matching
artboard. The importer takes **agent mode** during replay (UI shows the
read-only banner) and returns to **human mode** when done. Known fidelity
limits (state them to the user): CSS device drop-shadows/glows are not
imported; decor blocks arrive as rasterized image layers; display fonts fall
back to canvas text presets. The rendered PNGs remain the source of truth for
store submission — the canvas import is for human touch-up.

## Direct canvas edits (user-requested only)

Your normal loop is HTML → render → import. If the user asks you to tweak the
**live canvas** directly instead of re-rendering:

1. Read **`canvas-api-reference.md`** — do **not** guess operation names or args.
2. `POST {base}/mode {"mode":"agent"}` first (mutating ops are refused in human mode).
3. **Get real `layer_id`s**: enqueue `capture_panel_preview_data`, then
   `GET {base}/agent-preview-data`, and reference only the ids in that snapshot.
   Never reuse a stale id — that is what causes **"layer not found"**.
4. Send ops to `{base}/enqueue-command` (batch related changes). Base URL is
   `http://localhost:4713/__api/screenshot-designer`.

## Device craft (learned from calibration)

- Device blocks are built by `composer/device-frames.mjs` from
  `web_ui/public/device-frames/<pack>/frame.json`. The element's CSS `width`
  sets the scale; **height follows the pose's SVG viewBox aspect** — never set
  height manually.
- Pose viewBoxes differ wildly; the same `width` gives very different phone
  sizes. Practical starting widths on a 1290-wide panel (tune by eye):

| Pose | viewBox | Feels right as | Starting width |
| --- | --- | --- | --- |
| `front` | 772×1571 | centered hero, crop bottom | 950–1100px |
| `isometric-left/right` | 1282×1485 | dynamic hero, crop a corner | 1300–1600px |
| `tilted-left/right` | ~1040×1418 | mid-size accent | 1100–1400px |
| `tilted-front` | 785×1401 | subtle depth, near-front | 900–1050px |
| `angled-left/right` | ~699×1591 | tall edge device, crop top/side | 650–800px |

- **Cropping devices at panel edges is encouraged** (top, bottom, or side) —
  it is the single most common pro pattern. Panels have `overflow: hidden`;
  position with negative offsets.
- Give devices a `filter: drop-shadow(...)` tuned to the background (soft and
  large on light fields; darker or a brand-color glow on dark fields).
- Screenshot fit: `data-fit="cover"` (default) crops to the screen aspect;
  pick screenshots whose key content is centered.

## Design craft (principles, not rules)

- **One focal point per panel.** Type block and device compete — decide which
  leads and size accordingly.
- **Vary the layout across panels**: alternate device side/height/pose, mix a
  centered panel with asymmetric ones; consider one inverted (dark) panel for
  rhythm when the theme has a dark counterpart.
- **Type hierarchy:** title from the theme's display voice (serif vs sans —
  infer from the app's character), subtitle quieter (smaller, muted color).
  Title ≥ 96px, subtitle ≥ 48px at export size; both must clear the safety
  margin checks.
- **Backgrounds** come from the Theme's P/S (+accent) — gradients, tints,
  subtle radials; decor (blobs, rings, badges, waveform bars) sparingly and
  always in theme colors.
- **Contrast is non-negotiable**: check every text block against what is
  actually behind it in the render.

## Self-review (per render, against references)

Look at each panel PNG next to 1–2 strips from `composer/references/`
(closest category available; if the gallery is empty, judge against the best
App Store pages you know). Score 1–5: hierarchy, spacing rhythm, alignment,
color harmony, device composition, legibility. For every score ≤ 3 write one
concrete CSS-level fix (e.g. "title tracking too loose → letter-spacing
-1px; device too small for hero → width 1500px, bottom -360px") and apply
all fixes in one edit before re-rendering.

## Do not

- Ship a panel showing an **accidental** placeholder capture (the green
  "place your screenshot" image or similar). Use a real capture when one
  exists; otherwise omit `data-screenshot` for an intentional blank screen
  (`data-screen-fallback` in a theme color) and note it — never pause the run
  to request uploads.
- Use external network assets (fonts, images) in strip HTML.
- Edit `composer/*.mjs`, `web_ui/src/**`, or frame packs during a design run.
- Design to satisfy `style_failures` — they are legacy heuristics, not taste.
- Overwrite `output/screenshot_report.md`.
