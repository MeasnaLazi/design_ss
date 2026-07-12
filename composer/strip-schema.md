# Strip HTML layer contract

Strip documents are plain HTML/CSS rendered by `render.mjs`. Free CSS is allowed
*inside* blocks; the **structure** below is mandatory so tooling (render CLI,
validators, future HTML→display-JSON importer) can parse the design.

## Document rules

1. One `<div class="strip">` root laid out as a horizontal row of panels.
2. Each panel: `<section data-panel="N" ...>` (N = 0-based index), sized to the
   **exact export dimensions** of the target preset (e.g. 1290×2796 for
   `appstore_iphone_portrait`), `position: relative; overflow: hidden`.
3. Panels are screenshotted individually by `data-panel`; anything visually
   shared across panels (continuous background, spanning device) must be drawn
   so each panel still exports correctly on its own.
4. Reference assets root-relatively (server root = repo root):
   `/web_ui/public/device-frames/...`, `/datasource/screenshots/...`.
5. No external network resources (fonts, images). Bundle everything in-repo.

## Layer blocks (inside a panel)

Every direct visual element carries `data-layer` with a kind:

| Kind | Markup | Notes |
| --- | --- | --- |
| text | `<div data-layer="text" data-role="title\|subtitle\|caption">…</div>` | One title + one subtitle per panel; caption optional (same copy policy as before). |
| device | `<div data-layer="device" data-device data-pack="…" data-pose="…" data-screenshot="…" style="width:…">` | Built by `device-frames.mjs` (homography warp + `#screen` clip + frame SVG). `data-fit="cover"` (default) or `"stretch"`. Width sets scale; height follows pose aspect. |
| image | `<img data-layer="image" src="/datasource/…">` | Plain image layers. |
| decor | `<div data-layer="decor">…</div>` | Shapes, blobs, cards, badges, glows — free HTML/CSS. Imports to canvas as rasterized image layers. |

## Required boilerplate

```html
<script>window.COMPOSER_CONFIG = { framesRoot: '/web_ui/public' }</script>
<script type="module" src="/composer/device-frames.mjs"></script>
```

`device-frames.mjs` sets `window.__composerReady = true` when all devices are
built; `render.mjs` blocks on it. Pages without devices may omit the scripts.

## Skeleton

```html
<!doctype html>
<html><head>
<meta charset="utf-8">
<style>
  html, body { margin: 0; }
  .strip { display: flex; gap: 0; width: max-content; }
  .panel { position: relative; overflow: hidden; width: 1290px; height: 2796px; }
</style>
<script>window.COMPOSER_CONFIG = { framesRoot: '/web_ui/public' }</script>
<script type="module" src="/composer/device-frames.mjs"></script>
</head><body>
<div class="strip">
  <section class="panel" data-panel="0">
    <div data-layer="text" data-role="title">Your Life as a Book</div>
    <div data-layer="text" data-role="subtitle">Flip through your memories</div>
    <div data-layer="device" data-device data-pack="iphone_12_pro" data-pose="isometric-left"
         data-screenshot="/datasource/screenshots/appstore_iphone_portrait/<id>.png"
         style="width: 1100px; position: absolute; left: 220px; bottom: -320px;"></div>
  </section>
  <!-- panels 1..4 -->
</div>
</body></html>
```

## z-order note

When a text block deliberately overlaps a device (e.g. headline over a
shadowed frame), give the text an explicit higher `z-index` than the device —
the exported snapshot uses CSS `z-index` (fallback: DOM order) and the
`layer_z_order_sane` safety check requires overlapping text above devices.

## Render + validate

```bash
node composer/render.mjs --strip output/strips/appstore_strip.html \
  --out output/strips/rendered --full
```

Exit 0 + JSON summary; the out dir receives `panel<N>.png` per panel, optional
`strip.png`, and **`strip-data.json`** — an AgentPanelPreviewData v1 snapshot
extracted from the DOM (text + device blocks). Validate each panel:

```bash
python toolkit/scripts/designer.py validate-rules \
  --png output/strips/rendered/panel0.png \
  --panel-data output/strips/rendered/strip-data.json \
  --panel-index 0 --preset-id appstore_iphone_portrait \
  --profile appstore_hero --tier safety
```

`--tier safety` gates on objective defects only; style heuristics are
reported as warnings (see `toolkit/references/design-validate.md` § Tiers).
