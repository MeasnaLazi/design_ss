# Screenshot Designer Toolkit Reference

This is the toolkit source-of-truth for screenshot design commands used by the screenshot designer workflow.

Use this file for command syntax, payload shapes, and operational details.

## Scope and boundaries

- Run commands from publisher repo root unless otherwise noted.
- Use only:
  - `python -m agent_toolkit layout ...`
  - `python -m agent_toolkit designer ...`
- Do not use ad-hoc HTTP (`curl`/`wget`) for designer endpoints.
- Do not run frontend commands from the screenshot designer agent.

## Strict operation allowlist policy (anti-hallucination)

Before every `designer enqueue-op` call, enforce this policy:

1. **Operation name must exist in this document** under **Core `enqueue-op` operations**.
2. **Args must match one documented schema/example** in this document.
3. If operation/args are uncertain, **stop and re-read this file**; do not guess.
4. **Never invent aliases or near-matches** (for example: `move_layer`, `set_bg`, `delete_layer`).
5. If a needed behavior is not documented, **compose it from documented operations** (for example use `layer_patch` + `batch`) instead of introducing a new op name.

Hard rule:
- If operation name is not explicitly listed in this reference, do **not** send it.

## Setup

```bash
pip install -e ./agent_toolkit
python -m agent_toolkit --compact layout list-presets
```

Global `--compact` must appear immediately after `agent_toolkit`.

## Handoff prerequisite

Before live canvas operations:

```bash
python -m agent_toolkit designer handoff
```

Proceed only when:
- `"ok": true`
- `handoff.web_ui_status` is `ready`, `started`, or `already_running`

If handoff is not ready, run `toolkit_runner` first.

## Toolkit split

- **Layout CLI**: math/planning/validation (`safe-zone`, text metrics, `predict-checks`, image helpers, frame metadata).
- **Designer CLI**: live canvas operations (`session`, `enqueue-op`, `pull-preview`, `pull-export`).

## Layer identity rule

- Resolve canonical layer IDs via:
  1. `designer enqueue-op --operation export_json --args-json "{}"`
  2. `designer pull-export`
- Always use `layer_id` for `align`, `text_*`, and `device_*` operations.

## Commands you will use most

### Layout (`python -m agent_toolkit layout ...`)

- `store-json --platform <iphone|ipad|phone|tablet>`
- `device-packs --type <iphone|ipad|phone|tablet>`
- `load-frame --pack <pack_id>`
- `safe-zone --canvas-size <iphone|ipad|phone|tablet>`
- `estimate-text-width --content "..." --size <n>`
- `estimate-text-height --size <n>`
- `predict-checks --json session.json`
- `contrast --a "#ffffff" --b "#101827"`
- `image info --path <png>`
- `image match-preset --path <png> --canvas-size <...>`

How to use each layout command:

- `store-json --platform <...>`
  - Use when loading store metadata and preset context for the selected target platform.
  - Returns `store`, `presetId`, `canvasSize`, `absolutePath`.
- `device-packs --type <...>`
  - Use to list selectable device packs for user selection.
  - Filter by platform type and show `name` values to the user.
- `load-frame --pack <pack_id>`
  - Use after pack selection to read frame styles (`name`, `description`, `framePath`).
- `safe-zone --canvas-size <...>`
  - Use before text placement to compute allowed text area boundaries.
- `estimate-text-width --content "..." --size <n>`
  - Use to pre-check if text likely fits before adding/updating text layers.
- `estimate-text-height --size <n>`
  - Use to estimate line height budgeting for copy stacks.
- `predict-checks --json session.json`
  - Use for quality/safety prediction on an exported/derived session JSON.
- `contrast --a "#..." --b "#..."`
  - Use quick readability checks for text/background combinations.
- `image info --path <png>`
  - Use to verify generated preview dimensions and image metadata.
- `image match-preset --path <png> --canvas-size <...>`
  - Use to verify image dimensions match target preset.

### Designer (`python -m agent_toolkit designer ...`)

- `session`
- `enqueue-op --operation <op> --args-json '{...}'`
- `pull-preview --out <file.png>` (optional `--panels` — contiguous columns only; see below)
- `pull-export` (optional `--panels` — **adjacent** columns only, same as `pull-preview --panels`)

How to use each designer command:

- `session`
  - Use first in an active design loop to read canvas width/height, `presetId`, and current display context.
- `enqueue-op --operation <op> --args-json '{...}'`
  - Use for all live canvas mutations and preview/export triggers.
  - Send only operations listed in this document.
- `pull-preview --out <file.png>`
  - Use after `render_preview` or `render_panel_preview` to fetch latest agent PNG.
  - With `--panels`, indexes must be **adjacent** strip columns (e.g. `0,1` or `3,4` or `2,3,4`). The CLI enqueues one `render_panel_preview` with `panel_indexes` (sorted), which captures a **single** PNG spanning those columns including gaps (requires an open Web UI tab on command-events), then polls until the preview bytes change. Use `--out` for the PNG path (or stdout for raw bytes).
- `pull-export`
  - Use after `export_json` to fetch layer summary and resolve canonical `layer_id` values.
  - With `--panels`, indexes must be **adjacent** strip columns (e.g. `0,1` or `2,3,4`). The CLI GETs the full summary, then returns one object per column (sorted order): **`panelLocalRect`** (`left`,`top`,`width`,`height` with origin `0,0` — same size as `summary.canvas`; layer geometry in `summary` is relative to this), **`stripRect`** (that column’s bounds on the full strip / `sourceCanvas` coordinates), plus **`summary`** (`AgentLayoutSummaryV1` with panel-local `left`/`top`). See `agent_toolkit.export_slice`.

## Core `enqueue-op` operations

- `noop`
- `set_background`
- `add_device_frame`
- `add_text`
- `align`
- `text_font_size_delta`
- `text_set_font_size`
- `text_set_font_style`
- `text_set_color`
- `text_set_content`
- `text_set_line_height`
- `text_set_letter_spacing`
- `text_auto_fit`
- `device_size_delta`
- `device_set_size`
- `device_set_position`
- `device_move_delta`
- `device_set_angle`
- `device_set_frame_style`
- `device_set_screen_image`
- `remove_layer`
- `set_z_index`
- `layer_patch`
- `layers_patch_bulk`
- `batch`
- `distribute_layers`
- `set_equal_spacing`
- `match_size`
- `render_preview`
- `render_workspace_preview`
- `render_panel_preview`
- `export_json`

All coordinates (`x`, `y`) must be snapped to the 16px grid after any panel offset is applied.

**Panel column helpers:** optional `panel_index` (0-based) or `panel_number` (1-based) on `add_device_frame` and `add_text`, and with `align` when `reference` is `"panel"`, anchor geometry to that strip column. For offline math, Python mirrors the same origin as `screenExportRect` / `agent_toolkit.geometry.panel_rect(index, gap, panel_w, panel_h)`.

How to use each core operation:

- `noop` — no-op health check; useful for connectivity testing without canvas changes.
- `set_background` — set canvas background (`type: color|gradient|image`).
- `add_device_frame` — add a device frame from selected pack/style; optional `panel_index` / `panel_number` centers the frame in that column.
- `add_text` — add a text layer at snapped `x`,`y` with font token and size; with `panel_index` / `panel_number`, `x` and `y` are **relative to that panel’s top-left** (then snapped globally).
- `align` — snap layer alignment against a strip column (`reference: "panel"` + **`panel_index` / `panel_number`**, including **`0` / `1`** for the first column), the **full** artboard (`reference: "canvas"`—matches **one** single-panel artboard; **not** a single column of a row—avoid for multi-panel strip alignment), or another layer (`reference: "<layer_id>"`).
- `text_font_size_delta` — increase/decrease text size by delta px.
- `text_set_font_size` — set absolute text size.
- `text_set_font_style` — set style variant (`regular|bold|italic|bold_italic`).
- `text_set_color` — set text fill color (hex).
- `text_set_content` — replace text copy.
- `text_set_line_height` — tune multiline rhythm.
- `text_set_letter_spacing` — adjust character spacing.
- `text_auto_fit` — reduce/fit text within its current width bounds.
- `device_size_delta` — grow/shrink device by width delta.
- `device_set_size` — **device frame layers only**: resize with **uniform scale** (aspect ratio preserved); optional `fit` when both width and height are set.
- `device_set_position` — set absolute snapped device position.
- `device_move_delta` — offset device by delta.
- `device_set_angle` — rotate device.
- `device_set_frame_style` — switch style within a pack.
- `device_set_screen_image` — apply image URL to device screen content.
- `remove_layer` — delete a layer by `layer_id`.
- `set_z_index` — reorder layer stack position.
- `layer_patch` — patch geometry/style fields for one layer.
- `layers_patch_bulk` — patch multiple layers in one operation.
- `batch` — execute multiple operations in order.
- `distribute_layers` — evenly distribute layer positions along axis.
- `set_equal_spacing` — enforce fixed gap along axis.
- `match_size` — copy width/height/both from source to targets (text targets: width typographically; height not forced via scale).
- `render_preview` — push full workspace PNG to agent preview store.
- `render_workspace_preview` — alias of full workspace capture (same outcome as `render_preview`).
- `render_panel_preview` — push one panel PNG by `panel_index` / `panel_number`, or a **contiguous** multi-column crop via **`panel_indexes`**: JSON array of 0-based integers (e.g. `[2,3,4]`); must be adjacent columns on the strip (duplicates removed, order does not matter).
- `export_json` — push compact layout summary for `pull-export`.

## Required payload schemas (do not guess)

Use these exact operation names and argument shapes.

- `set_background`
  - color:
    - `{"type":"color","value":"#101827"}`
  - gradient:
    - `{"type":"gradient","value":{"angleDeg":135,"stops":[{"offset":0,"color":"#0c1a2e"},{"offset":1,"color":"#2b5c8a"}]}}`
  - image:
    - `{"type":"image","value":"https://..."}`
  - `type` must be exactly: `color | gradient | image`

- `add_device_frame`
  - `{"path":"/device-frames/iphone_12_pro/frame/front.svg","frame":"front"}`
  - Optional column (defaults to first panel): `{"path":"…","frame":"front","panel_index":2}` or `"panel_number":3` (1-based). Out-of-range indices clamp to the last panel.

- `add_text`
  - Global coordinates (entire strip), omit panel fields:
    - `{"content":"Stay Focused","x":64,"y":128,"font":"headline","size":96,"color":"#ffffff","align":"center","weight":"700"}`
  - **In-panel** coordinates: same `x`/`y` but relative to the chosen column’s top-left:
    - `{"content":"Headline","panel_index":2,"x":64,"y":128,"font":"headline","size":96,"color":"#ffffff","align":"left","weight":"700"}`
  - `font` must be one of: `headline | subheadline | body | caption`

- `align`
  - **Strip column (preferred for all panels, including the first):** `panel` rect = `screenExportRect` for that index (same as in-panel `add_text` / `add_device_frame` coords)
    - `{"layer_id":"<id>","anchor":"center_x","reference":"panel","panel_index":0}`
    - `{"layer_id":"<id>","anchor":"center_x","reference":"panel","panel_index":2}` or `"panel_number":3` instead of `panel_index`
  - **Full artboard** (entire `width` from preset— spans all columns on a row; use for single-artboard work, not “column 0” of a row):
    - `{"layer_id":"<id>","anchor":"center_x","reference":"canvas"}`
  - Relative to another layer’s bounding box:
    - `{"layer_id":"<id>","anchor":"center_y","reference":"<other_layer_id>"}`
  - `anchor` must be one of: `center_x | center_y | top | bottom | left | right`

- `layer_patch` (generic move/resize/style)
  - `{"layer_id":"<id>","patch":{"x":320,"y":640}}`
  - **Text layers:** when resizing, provide both `width` and `height` in the patch (schema requirement). **`width`** sets the Fabric **Textbox wrap column** (re-wraps lines; **no** `scaleX`/`scaleY` glyph stretch). **`height`** must be a positive number but is **not** applied as a vertical scale—text height stays **intrinsic** to wrapped content (re-check with `layout estimate-text-height` / safe-zone after big width changes).
  - **Device frame layers only:** provide `width` and/or `height`; scaling is **uniform** (aspect preserved). If both are set, optional `patch.fit`: `contain` (default, fits inside the box) or `cover` (fills the box). `fit` is rejected on text layers.

- `text_font_size_delta`
  - `{"layer_id":"<id>","delta":-4}`

- `text_set_font_size`
  - `{"layer_id":"<id>","size":96}`

- `text_set_font_style`
  - `{"layer_id":"<id>","variant":"regular"}`
  - `variant` must be one of: `regular | bold | italic | bold_italic`

- `text_set_color`
  - `{"layer_id":"<id>","color":"#ffffff"}`

- `device_size_delta`
  - `{"layer_id":"<id>","delta_px":32}`
  - alias: `delta` is also accepted.

- `device_set_position`
  - `{"layer_id":"<id>","x":400,"y":1200}`

- `device_move_delta`
  - `{"layer_id":"<id>","dx":32,"dy":0}`

- `device_set_angle`
  - `{"layer_id":"<id>","angle":-6}`

- `render_preview`
  - `{}`

- `render_workspace_preview`
  - `{}`

- `render_panel_preview`
  - index form: `{"panel_index":2}` (0-based)
  - number form: `{"panel_number":3}` (1-based)
  - contiguous segment: `{"panel_indexes":[1,2,3]}` (0-based, adjacent columns; one PNG including gaps between them)

- `export_json`
  - `{}`

- `layers_patch_bulk`
  - `{"layers":[{"layer_id":"<id1>","patch":{"x":112,"y":176}},{"layer_id":"<id2>","patch":{"x":640,"y":416}}]}`

- `batch`
  - `{"operations":[{"operation":"text_set_content","args":{"layer_id":"<id>","content":"Track every goal"}},{"operation":"set_z_index","args":{"layer_id":"<id>","z_index":8}}]}`

## Unsupported aliases (never use)

These names are invalid and will fail:

- `move_layer` → use `layer_patch` (`x`,`y`) or `device_move_delta` / `device_set_position`
- `delete_layer` → use `remove_layer`
- `set_bg` / `set_background_color` → use `set_background` with valid `type`

Supported connectivity no-op:
- `noop` with args `{}`

## Core v1 operation schemas (full-control primitives)

All payloads are sent via:

`python -m agent_toolkit designer enqueue-op --operation <op> --args-json '{...}'`

- `text_set_content`
  - args: `{"layer_id":"<id>","content":"New text"}`
- `remove_layer`
  - args: `{"layer_id":"<id>"}`
- `set_z_index`
  - args: `{"layer_id":"<id>","z_index":3}` (integer, clamped to canvas range)
- `layer_patch`
  - args: `{"layer_id":"<id>","patch":{...}}`
  - common patch keys (text + device): `x`, `y`, `width`, `height`, `angle`, `opacity`, `scale_x`, `scale_y`
  - device-only patch key: `fit` (`contain` | `cover`) when both `width` and `height` are set on a **device** layer
  - text-only patch keys: `content`, `font_size`, `font_weight`, `font_style`, `color`, `text_align`, `line_height`, `letter_spacing`
  - notes:
    - **Text:** `width` and `height` must be provided together when resizing; only **`width`** changes layout (wrap column). **`height`** is validated but not used to stretch the layer—re-run text metrics / safe-zone checks after resize.
    - **Device:** at least one of `width` / `height`; resize is **uniform** (aspect preserved). Optional `fit` when both are set.
    - `opacity` must be in `[0,1]`
    - `font_style` must be `normal` or `italic`
    - `text_align` must be `left|center|right|justify`
- `layers_patch_bulk`
  - args:
    - `{"layers":[{"layer_id":"<id1>","patch":{...}},{"layer_id":"<id2>","patch":{...}}]}`
- `batch`
  - args:
    - `{"operations":[{"operation":"<op>","args":{...}},{"operation":"<op2>","args":{...}}]}`
  - notes:
    - executes in order
    - nested `batch` is not supported

## Full-control plus (v2) schemas

- `distribute_layers`
  - args: `{"layer_ids":["<id1>","<id2>","<id3>"],"axis":"x"}`
- `set_equal_spacing`
  - args: `{"layer_ids":["<id1>","<id2>"],"axis":"x","gap":64}`
- `match_size`
  - args: `{"source_layer_id":"<source>","target_layer_ids":["<target1>"],"mode":"both"}`
  - mode: `width|height|both`
  - **Text targets (`Textbox`):** `width` and `both` match the source’s **on-canvas width** by adjusting wrap **`width`** (scale reset to 1). **`height`** / **`both`** do **not** vertically scale text to the source’s height—height stays intrinsic to copy and wrapping. Non-text targets still use **scale** for width/height/both as before.
- `device_set_size`
  - Uniform scale only (no stretching). Pass at least one of `width` / `height` (positive, snapped to grid input).
  - Both dimensions: fits inside the target box by default (`fit: "contain"`). Use `fit: "cover"` to fill the box (may exceed one axis).
  - args examples:
    - `{"layer_id":"<id>","width":780}`
    - `{"layer_id":"<id>","height":1600}`
    - `{"layer_id":"<id>","width":780,"height":1560,"fit":"contain"}`
    - `{"layer_id":"<id>","width":780,"height":1560,"fit":"cover"}`
- `device_set_frame_style`
  - args: `{"layer_id":"<id>","style":"front","pack_id":"iphone_12_pro"}`
  - `pack_id` is optional; current device pack is used when omitted.
- `device_set_screen_image`
  - args: `{"layer_id":"<id>","image_url":"http://localhost:4713/__api/datasource/placeholder/iphone.jpg"}`
  - accepts `image_url` or `url`; URL must be fetchable by browser runtime.
- `text_set_line_height`
  - args: `{"layer_id":"<id>","line_height":1.15}`
- `text_set_letter_spacing`
  - args: `{"layer_id":"<id>","letter_spacing":20}`
- `text_auto_fit`
  - args: `{"layer_id":"<id>","min_size":32,"max_size":120}`

## Canonical examples

### Single patch

```bash
python -m agent_toolkit designer enqueue-op --operation layer_patch --args-json '{
  "layer_id":"layer_text_hero",
  "patch":{"x":112,"y":192,"font_size":108,"color":"#ffffff","text_align":"left"}
}'
```

### Bulk patch

```bash
python -m agent_toolkit designer enqueue-op --operation layers_patch_bulk --args-json '{
  "layers":[
    {"layer_id":"layer_text_hero","patch":{"x":112,"y":192,"font_size":108}},
    {"layer_id":"layer_device_1","patch":{"x":640,"y":416,"width":784,"height":1568}}
  ]
}'
```

### Batch sequence

```bash
python -m agent_toolkit designer enqueue-op --operation batch --args-json '{
  "operations":[
    {"operation":"text_set_content","args":{"layer_id":"layer_text_hero","content":"Track every goal"}},
    {"operation":"layer_patch","args":{"layer_id":"layer_text_hero","patch":{"x":112,"y":176,"font_size":104}}},
    {"operation":"set_z_index","args":{"layer_id":"layer_text_hero","z_index":8}}
  ]
}'
```

### Z-order update

```bash
python -m agent_toolkit designer enqueue-op --operation set_z_index --args-json '{
  "layer_id":"layer_device_1",
  "z_index":2
}'
```

## Minimal operation loop

1. `designer session`
2. `layout store-json --platform ...`
3. `layout device-packs --type ...`
4. User selects pack
5. `layout load-frame --pack ...`
6. Build via `designer enqueue-op` (`set_background`, `add_device_frame`, `add_text`, `align`, etc.)
7. `designer enqueue-op --operation render_preview --args-json "{}"`
8. `designer pull-preview --out strip.png`
9. `designer enqueue-op --operation export_json --args-json "{}"`
10. `designer pull-export`
11. Run validation helpers (`predict-checks`, `contrast`, image checks)

## Notes

- `render_preview`/`render_panel_preview` output comes from live Fabric canvas capture.
- `enqueue-op` does not return new layer IDs for added layers; use `export_json` + `pull-export`.
