# Designer toolkit reference

Commands run as **`python toolkit/scripts/designer.py <subcommand> …`** from the publisher repo root. They call the **web_ui** screenshot-designer HTTP API on **loopback** only (`localhost`, `127.0.0.1`, `::1`).

**Offline layout** (presets, store JSON, `layout image`, contrast): **`layout-reference.md`**.

**Hybrid design validation** (rules CLI + agent vision workflow): **`design-validate.md`**.

## Setup

| Item | Detail |
| --- | --- |
| **Dev server** | In `web_ui/`: `npm run dev` (default `http://localhost:4713`). |
| **API base** | `DESIGNER_API_BASE` in `toolkit/.env`, or default `http://localhost:4713/__api/screenshot-designer`. |
| **Python path** | `export PYTHONPATH=toolkit/scripts` when running outside a configured environment. |
| **Live tab** | An open designer tab must subscribe on the matching display **slug** for **`enqueue-op`**; otherwise enqueue returns **`no_subscribers`**. |

Optional global flag on the parent CLI: **`--compact`** (one-line JSON where the subcommand prints JSON).

## Readiness

| CLI | Summary |
| --- | --- |
| `python toolkit/scripts/designer.py handoff` | Resolve `web_ui_url` and `designer_api_base`; optional GET **`/session`** probe (`web_ui_status`: `ready` or `unverified`). |
| `python toolkit/scripts/designer.py session` | GET **`/session`** — canvas width/height, `presetId`, `displayFile`, optional `savedAt`. |


## `enqueue-op` (all client-authoritative ops)

| CLI | Arg | Sample | Summary |
| --- | --- | --- | --- |
| `python toolkit/scripts/designer.py enqueue-op` | Required **`--operation <name>`**. **`--args-json`** JSON object (default `{}`), or **`@path.json`**. Optional **`--request-id`**, **`--timeout`** (default 120s). | `--operation noop --args-json '{}'` | POST **`/enqueue-command`**; operation runs in the open Web UI tab via SSE. |

## Client-authoritative `enqueue-op` allowlist (current)

Treat this list as the **only** operations you may send with **`python toolkit/scripts/designer.py enqueue-op`**.

**Policy:**

1. The **`--operation`** name must appear in **Shared operations**, **Layer type: Text**, **Layer type: Device**, **Image**, or **Other** below.
2. **`--args-json`** must match that contract; if unsure, re-read table instead of guessing.
3. Do **not** invent aliases (`set_bg`, `delete_layer`, `capture_panel_preview` without `_data`, etc.).

### Layer

All rows use **`python toolkit/scripts/designer.py enqueue-op`** with **`--operation <CLI>`** and **`--args-json '{…}'`**. The **CLI** column is the **`--operation`** name.

**Coordinate reminder:** where **`x`/`y`** are **panel-local**, args must include **`panel_index`** (0-based) or **`panel_number`** (1-based) as required by that operation (**`designer/enqueue_validate.py`**). **Text:** top-left in panel space. **Device** **`device_set_position`:** center in panel space.

#### Shared operations

| CLI | Arg | Sample | Summary |
| --- | --- | --- | --- |
| **`remove_layer`** | **`layer_id`** | `'{"layer_id":"text_1"}'` | Deletes the layer from the canvas and store. |
| **`move_layer`** | **`layer_id`**; **`dx`**, **`dy`** *or* **`x`**, **`y`** + **`panel_index`** / **`panel_number`** | `'{"layer_id":"text_1","dx":8,"dy":0}'` or `'{"layer_id":"text_1","x":120,"y":64,"panel_index":0}'` | Delta move (grid-snapped), or absolute panel-local position (text: top-left, device: center). |
| **`align`** | **`layer_id`**, **`anchor`**, **`reference`** (`panel` or other **`layer_id`**); **`panel_index`** / **`panel_number`** when **`reference`** is **`panel`** | `'{"layer_id":"text_1","anchor":"right","reference":"panel","panel_index":0}'` | **`anchor`** must be **`center_x`**, **`center_y`**, **`top`**, **`bottom`**, **`left`**, or **`right`**. Aligns bounding box; **`reference: canvas`** is rejected. |
| **`layer_patch`** | **`layer_id`**, **`patch`**; **`panel_index`** / **`panel_number`** when **`patch`** sets **`x`** and/or **`y`** | `'{"layer_id":"text_1","patch":{"content":"Hello"},"panel_index":0}'` | Partial field update on one layer. **Text:** if **`patch`** sets **`width`** or **`height`**, **both** **`width`** and **`height`** are required (positive numbers). **Device:** at least one of **`width`** / **`height`** may be set. |
| **`layers_patch_bulk`** | **`layers`**: `[{ layer_id, patch, … }, …]`; optional top-level **`panel_index`** / **`panel_number`** | `'{"layers":[{"layer_id":"text_1","patch":{"content":"A"}},{"layer_id":"text_2","patch":{"content":"B"}}]}'` | Same **`layer_patch`** rules per entry (including text **`width`**/**`height`** together). |
| **`batch`** | **`operations`**: `[{ operation, args }, …]` | `'{"operations":[{"operation":"noop","args":{}},{"operation":"remove_layer","args":{"layer_id":"text_1"}}]}'` | Runs nested ops in order; nested **`batch`** not allowed. |
| **`set_z_index`** | **`layer_id`**, **`z_index`** | `'{"layer_id":"text_1","z_index":3}'` | Reorders stack; **`z_index`** clamped to valid range. |
| **`match_size`** | **`source_layer_id`**, **`target_layer_ids`**, **`mode`**: `width` \| `height` \| `both` | `'{"source_layer_id":"device_1","target_layer_ids":["device_2"],"mode":"both"}'` | Match size from source; text targets follow TOOLKIT rules (width vs height). |
| **`set_equal_spacing`** | **`layer_ids`** (≥ 2), **`axis`**, **`gap`** | `'{"layer_ids":["text_1","text_2","text_3"],"axis":"y","gap":12}'` | Fixed gap along axis between layers in **one** panel column. |

#### Layer type: Text

| CLI | Arg | Sample | Summary |
| --- | --- | --- | --- |
| **`add_text`** | **`panel_index`** / **`panel_number`**, **`x`**, **`y`**, **`color`**, **`font`**; optional **`content`**, **`size`**, **`align`**, **`weight`** | `'{"panel_index":0,"x":32,"y":48,"content":"Headline","color":"#111111","font":"title2"}'` | New textbox at panel-local top-left. **`font`** is a **`TextStylePresetId`** (same as sidebar: **`largeTitle`**, **`title1`**, **`title2`**, **`title3`**, **`headline`**, **`body`**, **`callout`**, **`subheadline`**, **`footnote`**, **`caption1`**, **`caption2`**; default **`body`**). **`caption`** is accepted as an alias for **`caption1`**. Preset supplies width, size, weight, alignment unless overridden by **`size`** / **`align`** / **`weight`**. |
| **`text_font_size_delta`** | **`layer_id`**, **`delta`** | `'{"layer_id":"text_1","delta":-2}'` | Change font size by delta px (clamped **8–400**). |
| **`text_set_font_size`** | **`layer_id`**, **`size`** | `'{"layer_id":"text_1","size":24}'` | Absolute font size (clamped **8–400**). |
| **`text_set_font_style`** | **`layer_id`**, **`variant`**: `regular` \| `bold` \| `italic` \| `bold_italic` | `'{"layer_id":"text_1","variant":"bold"}'` | Font style variant. |
| **`text_set_color`** | **`layer_id`**, **`color`** (hex **`#rrggbb`**) | `'{"layer_id":"text_1","color":"#0a84ff"}'` | Text fill color. |
| **`text_set_content`** | **`layer_id`**, **`content`** | `'{"layer_id":"text_1","content":"Updated copy"}'` | Replace string body. |
| **`text_set_line_height`** | **`layer_id`**, **`line_height`** (> 0) | `'{"layer_id":"text_1","line_height":1.2}'` | Line height multiplier / rhythm. |
| **`text_set_letter_spacing`** | **`layer_id`**, **`letter_spacing`** | `'{"layer_id":"text_1","letter_spacing":40}'` | Character spacing (Fabric `charSpacing`). |
| **`text_auto_fit`** | **`layer_id`**; optional **`min_size`**, **`max_size`** | `'{"layer_id":"text_1","min_size":12,"max_size":48}'` | Shrink font to fit text width in box. |

#### Layer type: Device

| CLI | Arg | Sample | Summary |
| --- | --- | --- | --- |
| **`add_device_frame`** | **`panel_index`** / **`panel_number`**; **`path`**, **`frame`** (required) | `'{"path":"/device-frames/iphone_12_pro/frame/front.svg","frame":"front","panel_index":0}'` | Insert device frame in that column. |
| **`device_size_delta`** | **`layer_id`**, **`delta_px`** or **`delta`** | `'{"layer_id":"device_1","delta_px":-20}'` | Change device width by delta px (uniform scale, min/max per TOOLKIT). |
| **`device_set_position`** | **`layer_id`**, **`panel_index`** / **`panel_number`**, **`x`**, **`y`** | `'{"layer_id":"device_1","panel_index":0,"x":400,"y":520}'` | Panel-local **center** of device in column (same panel resolution as **`add_text`** / **`move_layer`**). |
| **`device_move_delta`** | **`layer_id`**, **`dx`**, **`dy`**; optional **`panel_index`** / **`panel_number`** | `'{"layer_id":"device_1","dx":0,"dy":16}'` | Delta in document px; optional panel must match inferred column. |
| **`device_set_angle`** | **`layer_id`**, **`angle`** (degrees) | `'{"layer_id":"device_1","angle":-3}'` | Rotation. |
| **`device_set_size`** | **`layer_id`**; **`width`** and/or **`height`**; optional **`fit`**: `contain` \| `cover` | `'{"layer_id":"device_1","width":900,"fit":"contain"}'` | Uniform resize (aspect preserved on device frame). |
| **`device_set_frame_style`** | **`layer_id`**; **`style`** or **`frame`** (bezel variant id, e.g. **`front`**); optional **`pack_id`** (device pack id, e.g. **`iphone_12_pro`** — defaults to the layer’s pack / UI selection) | `'{"layer_id":"<id>","style":"front","pack_id":"iphone_12_pro"}'` | Frame style / pack swap. |

### Image

| CLI | Arg | Sample | Summary |
| --- | --- | --- | --- |
| **`render_panel_preview`** | **`panel_indexes`** *or* **`panel_index`** *or* **`panel_number`**; optional **`preview_multiplier`** `1` \| `2` | `'{"panel_indexes":[0],"preview_multiplier":1}'` | Crops strip → browser POSTs PNG → **`pull-preview`** reads **`/agent-preview`**. |
| **`capture_panel_preview_data`** | Same column selectors as **`render_panel_preview`** (no **`preview_multiplier`**) | `'{"panel_indexes":[0]}'` | Slim layout JSON → browser POSTs → **`pull-preview-data`** reads **`/agent-preview-data`**. |

Details and examples: **Panel preview** and **Panel preview data** sections below.

### Other

| CLI | Arg | Sample | Summary |
| --- | --- | --- | --- |
| **`noop`** | `{}` | `'{}'` | No canvas work (connectivity check). |
| **`set_background`** | **`type`** / **`mode`**: `color` \| `gradient` \| `image`; **`value`** (or **`color`**, **`gradient`**, **`image`**, **`image_url`**) — hex string, gradient object, or image URL; *or* top-level **`background`**: `{ type, value, … }` with the same idea | `'{"type":"color","value":"#0b0f14"}'` or `'{"mode":"image","image_url":"https://example.com/bg.png"}'` | Solid, gradient, or image artboard background. Prefer gradient more then solid if possible. For gradients, **`value`** is a `kind` + `angleDeg` + `stops` object; the designer’s built-in preset names are good targets to mimic — e.g. **Slate depth**, **Aurora**, **Sunset**, **Spotlight**, **Ocean glass**, **Rose metal**. |


## Panel preview (enqueue + pull)

Cross-panel PNG crops use two steps: enqueue **`render_panel_preview`** in the browser, then **`pull-preview`** fetches the last stored PNG.

1. **`enqueue-op`** — POST **`/enqueue-command`**. Response is JSON ack (`ok`, `slug`, `operation`, `requestId`), not image bytes.
2. **Browser** — SSE delivers the op; Fabric crops the strip and POSTs PNG to **`/agent-preview`**.
3. **`pull-preview`** — GET **`/agent-preview`**; with **`--out`**, writes the PNG and prints JSON metadata on stdout.

### Example: column 0 at multiplier 1

```bash
python3 toolkit/scripts/designer.py enqueue-op \
  --operation render_panel_preview \
  --args-json '{"panel_indexes":[0],"preview_multiplier":1}'

python3 toolkit/scripts/designer.py pull-preview --out ../output/temp/preview.png
```

With **`--out`**, stdout is JSON: `{"ok": true, "bytes": <n>, "path": "<path>"}`. Omit **`--out`** to stream raw PNG bytes to stdout.

### `render_panel_preview` args (`--args-json`)

| Field | Required | Summary |
| --- | --- | --- |
| **`panel_indexes`** | One of column selectors | 0-based strip columns forming one **contiguous** segment (e.g. `[0]`, `[0,1]`, `[2,3,4]`). |
| **`panel_index`** | Alternative | Single column, 0-based. |
| **`panel_number`** | Alternative | Single column, 1-based. |
| **`preview_multiplier`** | No | `1` (faster) or `2` (sharper). Omit to use web_ui `VITE_AGENT_PREVIEW_MULTIPLIER` (default **2**). |

Toolkit validates **`preview_multiplier`** before enqueue (`designer/enqueue_validate.py`).

## `pull-preview`

| CLI | Arg | Sample | Summary |
| --- | --- | --- | --- |
| `python toolkit/scripts/designer.py pull-preview` | Optional **`--out <path>`** — write PNG and print JSON metadata. Optional **`--timeout`** (default 60s). | **`--out ../output/temp/preview.png`** (optional **`--timeout 60`**) | GET **`/agent-preview`**. **404** / **`no_preview_yet`** if nothing has been uploaded yet. |

Does **not** enqueue **`render_panel_preview`** or poll for a new crop; run **`enqueue-op`** first when the stored preview is missing or stale.

## Panel preview data (enqueue + pull)

Cross-panel layout snapshots use two steps: enqueue **`capture_panel_preview_data`** in the browser, then **`pull-preview-data`** fetches the last stored JSON.

1. **`enqueue-op`** — POST **`/enqueue-command`**. Response is JSON ack (`ok`, `slug`, `operation`, `requestId`), not layout bytes.
2. **Browser** — SSE delivers the op; Fabric projects a slim JSON DTO and POSTs to **`/agent-preview-data`**.
3. **`pull-preview-data`** — GET **`/agent-preview-data`**; polls until **`revision`** changes (or the first snapshot when no prior revision). With **`--out`**, writes JSON and prints metadata on stdout.

Use PNG (**`render_panel_preview`** + **`pull-preview`**) when appearance or copy matters; use JSON for structure, **`layer_id`**, and panel-local coordinates for the next **`enqueue-op`**.

**Snapshot shape (version `1`, panels layout)** — matches `web_ui/src/types/agentPanelPreviewData.ts` / `buildAgentPanelPreviewData.ts`. Top-level: `version`, `revision`, `capturedAt`, `gap`, `workspace_width`, `workspace_height`, `panels[]`. Each **`panels[]`** entry has `panel_index`, `panel_width`, `panel_height`, `panel_x`, `panel_y`, and **`layers[]`** (text and device only; sorted by `z_index`). **`panel_x`** and **`panel_y`** are the top-left of that panel’s export rect in **workspace** coordinates. In **`layers[]`**, **`kind: text`**: `x` / `y` are panel-local **top-left** of the text layer’s align bounding box (same bbox rules as **`align`**). **`kind: device`**: `x` / `y` are panel-local **center** of the device frame’s align bounding box (bezel image bbox). Use the parent panel’s `panel_index` for enqueue args. **`revision`** is a string: `JSON.stringify` of `{ version, gap, workspace_width, workspace_height, panels }` only ( **`capturedAt` is not included** ), so **`pull-preview-data`** can detect layout changes without timestamp noise.

### Example: column 0 layout snapshot

```bash
python3 toolkit/scripts/designer.py enqueue-op \
  --operation capture_panel_preview_data \
  --args-json '{"panel_indexes":[0]}'

python3 toolkit/scripts/designer.py pull-preview-data --out ../output/temp/panel.json
```

With **`--out`**, stdout is JSON: `{"ok": true, "bytes": <n>, "path": "<path>", "revision": "<revision>"}`. Omit **`--out`** to print the snapshot JSON to stdout.

### `capture_panel_preview_data` args (`--args-json`)

| Field | Required | Summary |
| --- | --- | --- |
| **`panel_indexes`** | One of column selectors | 0-based strip columns forming one **contiguous** segment (e.g. `[0]`, `[0,1]`, `[2,3,4]`). |
| **`panel_index`** | Alternative | Single column, 0-based. |
| **`panel_number`** | Alternative | Single column, 1-based. |

Toolkit validates column selectors before enqueue (`designer/enqueue_validate.py`). There is no **`preview_multiplier`**.

## `pull-preview-data`

| CLI | Arg | Sample | Summary |
| --- | --- | --- | --- |
| `python toolkit/scripts/designer.py pull-preview-data` | Optional **`--out <path>`** — write JSON and print metadata. Optional **`--timeout`** (default 60s). Optional **`--previous-revision`** — wait until **`revision`** differs. | **`--out ../output/temp/panel.json`** (optional **`--previous-revision "<revision>"`**) | GET **`/agent-preview-data`**. **404** / **`no_preview_data_yet`** if nothing has been uploaded yet. |

Does **not** enqueue **`capture_panel_preview_data`**; run **`enqueue-op`** first when the stored snapshot is missing or stale.

## `validate-rules` (offline checks)

Non-vision validation of a pulled PNG and optional panel snapshot JSON: see **`design-validate.md`** for the full **`validate-rules`** table, check IDs, and the **rules → vision → next panel / user review** agent workflow.
