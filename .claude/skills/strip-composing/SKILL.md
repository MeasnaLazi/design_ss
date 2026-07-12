---
name: strip-composing
disable-model-invocation: true
description: >-
  HTML-first store screenshot design for apps_publisher: read
  output/screenshot_report.md, author the whole strip as one HTML/CSS document
  per composer/strip-schema.md, render with composer/render.mjs, self-review
  the PNGs against the reference gallery, iterate, then gate with
  validate-rules --tier safety. Use when acting as screenshot-designer-agent
  or when the user names this skill.
---

# Strip composing (HTML-first design)

You design store screenshot strips by **writing one HTML/CSS document** and
looking at rendered PNGs — not by enqueueing canvas operations. The full CSS
vocabulary is yours: gradients, shadows, glows, overlap, cropping, asymmetry,
decorative shapes, real screenshots inside device frames.

## Required reading (order)

1. This skill.
2. **`composer/strip-schema.md`** — the layer contract your HTML must follow
   (panel structure, `data-layer` kinds, device block attributes, z-order note,
   render + validate commands).
3. `toolkit/references/design-validate.md` **§ Tiers** — what the safety gate
   checks. Style heuristics are warnings; do not design to please them.

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
5. **Gate (per panel):** `validate-rules` with `--panel-data output/strips/rendered/strip-data.json --panel-index N --tier safety` — must exit 0.
   Fix safety failures in the HTML and re-render. Read `style_failures` but
   treat them as FYI, not instructions.
6. **Strip check:** `validate-strip-rules --panel-data output/strips/rendered/strip-data.json --png-dir output/strips/rendered --tier safety`.
7. **Present** the panels to the user for review.

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

## One-way design mode

If you ever use canvas ops (user-requested fallback only), first run
`python toolkit/scripts/designer.py mode set agent`; a 409 `human_mode` error
on any op means the user took over — **stop designing immediately** and ask
before continuing. Pure HTML-first runs don't need the dev server at all.

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
- Use `designer.py enqueue-op` for design work — canvas ops are the human
  co-design path, not yours (exception: the user explicitly asks for a canvas
  edit).
- Design to satisfy `style_failures` — they are legacy heuristics, not taste.
- Overwrite `output/screenshot_report.md`.
