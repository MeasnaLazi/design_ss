# Web UI toolkit reference

Commands that talk to the screenshot-designer HTTP API (Vite `web_ui`, loopback). Run from publisher repo root unless noted. Optional global flag: `python toolkit/scripts/designer.py --compact <subcommand>` (same pattern as `layout.py`).

**Layout** (`layout.py`: presets, store JSON, packs, grid, text, …): **`layout-reference.md`**. **Image bytes**: **`vision-reference.md`**.

## Handoff

Proceed with live canvas ops only when `designer.py handoff` returns `"ok": true` and `handoff.web_ui_status` is `ready`, `started`, or `already_running`. If not ready, start `web_ui` / `toolkit_runner` first.

Base URL resolution: `DESIGNER_API_BASE`, then `toolkit/.env`, then default `http://localhost:4713/__api/screenshot-designer`.

| CLI | Arg | Summary |
| --- | --- | --- |
| `python toolkit/scripts/designer.py handoff` | **`--timeout <float>`** (default **15**). **`--skip-session`**: resolve URLs only, no GET **`/session`** (**`web_ui_status`** unverified). | JSON with `web_ui_url`, `web_ui_status`, designer API readiness |
| `python toolkit/scripts/designer.py session` | **`--timeout <float>`** (default **60**). | GET session: canvas dimensions, `presetId`, display context |
| `python toolkit/scripts/designer.py execute` | **`--json <path>`** or **`--json -`** (stdin): full POST body; must include string **`operation`**; **`args`** optional object (defaults treated as empty object if absent). **`--timeout <float>`** (default **120**). | POST `/execute` with full JSON body |
| `python toolkit/scripts/designer.py execute-op` | **`--operation <string>`** (required). **`--args-json`** JSON object or **`@file.json`** (default **`{}`**). **`--timeout <float>`** (default **120**). | POST `/execute` with operation + args |
| `python toolkit/scripts/designer.py enqueue-op` | **`--operation <string>`** (required). **`--args-json`** as for **`execute-op`**. Optional **`--request-id <string>`** (echoed in SSE). **`--timeout <float>`** (default **120**). | POST `/enqueue-command` (runs in open Web UI tab via SSE); toolkit validates args before HTTP |
| `python toolkit/scripts/designer.py pull-preview` | Optional **`--out <path>`** (write PNG; if omitted, raw PNG on stdout). **`--timeout <float>`** (default **60**; also caps wait after panel render). **Without `--panels`**: single GET **`agent-preview`**. **With `--panels INDICES`**: comma-separated **0-based**, **adjacent** columns (one contiguous segment, e.g. `0,1`); enqueues **`render_panel_preview`**, polls until bytes change. **`--poll-interval <float>`** (default **0.08**) seconds between GET polls when using **`--panels`**. Optional **`--preview-multiplier 1` or `2`** (only with **`--panels`**; omit → **`VITE_AGENT_PREVIEW_MULTIPLIER`** in `web_ui` or default **2**). | GET last `agent-preview` PNG; with `--panels`, enqueues one `render_panel_preview` for contiguous columns, polls until bytes change |
| `python toolkit/scripts/benchmark_agent_preview.py` | Required **`--panels INDICES`** (comma-separated **0-based** contiguous columns, same rules as **`pull-preview --panels`**). Optional **`--timeout`** (default **60**), **`--poll-interval`** (default **0.08**), **`--preview-multiplier 1` or `2`**, **`--out <path>`** (save PNG; omit to discard after timing). | Benchmark preview capture (requires running `web_ui`) |

Preview scale: `pull-preview --preview-multiplier` and `render_panel_preview.preview_multiplier` override `web_ui` env `VITE_AGENT_PREVIEW_MULTIPLIER` (default **2**). Capture path: Fabric `toBlob` → POST `agent-preview`.

## `enqueue-op` operations

Use only the operation names below. Args are JSON for `--args-json`. Panel placement: `panel_index` (0-based) or `panel_number` (1-based) required where noted; text `x`/`y` = panel-local top-left, device `x`/`y` = panel-local center (see Web UI / Fabric parity).

| CLI | Arg | Summary |
| --- | --- | --- |
| `enqueue-op` | **`--operation noop`**, **`--args-json '{}'`** | Connectivity no-op |
| `enqueue-op` | **`--operation set_background`**, **`--args-json`**: **`type`** exactly **`color`**, **`gradient`**, or **`image`**; **`value`** per type (solid hex string, gradient object with **`angleDeg`** and **`stops`**, or image URL string). | Canvas background; image uses `{"type":"image","value":"https://..."}` |
| `enqueue-op` | **`--operation add_device_frame`**, args: **`path`**, **`frame`**, plus required **`panel_index`** or **`panel_number`**; optional **`x`**, **`y`** (panel-local **center**). | Add device from pack; optional center in column |
| `enqueue-op` | **`--operation add_text`**, args: **`content`**, required **`panel_index`** or **`panel_number`**, **`x`**, **`y`** (panel-local **top-left**), **`font`**, **`size`**, plus optional **`color`**, **`align`**, **`weight`**, etc. **`font`**: **`headline`**, **`subheadline`**, **`body`**, or **`caption`**. | `font`: `headline`, `subheadline`, `body`, `caption` |
| `enqueue-op` | **`--operation align`**, args: **`layer_id`**, **`anchor`** (`center_x`, `center_y`, `top`, `bottom`, `left`, `right`), **`reference`**: **`panel`** plus **`panel_index`** or **`panel_number`**, or another layer id (**same column** only); **`reference`**: **`canvas`** rejected. | `anchor`: `center_x`, `center_y`, `top`, `bottom`, `left`, `right`; `reference: "canvas"` rejected |
| `enqueue-op` | **`--operation move_layer`**, args: **`layer_id`** plus either panel-local **`panel_index`/`panel_number`** with **`x`**, **`y`** (text **top-left**, device **center**), or **`dx`**, **`dy`** (optional **`panel_index`** must match column). | Absolute needs `panel_index`/`panel_number`; delta optional panel assert |
| `enqueue-op` | **`--operation text_font_size_delta`**, args: **`layer_id`**, **`delta`** (px). | |
| `enqueue-op` | **`--operation text_set_font_size`**, args: **`layer_id`**, **`size`**. | |
| `enqueue-op` | **`--operation text_set_font_style`**, args: **`layer_id`**, **`variant`**: **`regular`**, **`bold`**, **`italic`**, or **`bold_italic`**. | `regular`, `bold`, `italic`, `bold_italic` |
| `enqueue-op` | **`--operation text_set_color`**, args: **`layer_id`**, **`color`** (hex). | |
| `enqueue-op` | **`--operation text_set_content`**, args: **`layer_id`**, **`content`**. | |
| `enqueue-op` | **`--operation text_set_line_height`**, args: **`layer_id`**, **`line_height`**. | |
| `enqueue-op` | **`--operation text_set_letter_spacing`**, args: **`layer_id`**, **`letter_spacing`**. | |
| `enqueue-op` | **`--operation text_auto_fit`**, args: **`layer_id`**, **`min_size`**, **`max_size`**. | |
| `enqueue-op` | **`--operation device_size_delta`**, args: **`layer_id`**, **`delta_px`** (alias **`delta`** accepted). | |
| `enqueue-op` | **`--operation device_set_size`**, args: **`layer_id`**, at least one of **`width`**, **`height`**; optional **`fit`**: **`contain`** or **`cover`** when both set (**device layers only**, uniform scale). | Uniform scale; device layers only |
| `enqueue-op` | **`--operation device_set_position`**, args: **`layer_id`**, required **`panel_index`** or **`panel_number`**, **`x`**, **`y`** (panel-local **center**). | Panel-local center |
| `enqueue-op` | **`--operation device_move_delta`**, args: **`layer_id`**, **`dx`**, **`dy`**; optional **`panel_index`** / **`panel_number`** (must match device column). | Optional panel must match column |
| `enqueue-op` | **`--operation device_set_angle`**, args: **`layer_id`**, **`angle`**. | |
| `enqueue-op` | **`--operation device_set_frame_style`**, args: **`layer_id`**, **`style`**, optional **`pack_id`**. | |
| `enqueue-op` | **`--operation remove_layer`**, args: **`layer_id`**. | |
| `enqueue-op` | **`--operation set_z_index`**, args: **`layer_id`**, **`z_index`** (integer). | |
| `enqueue-op` | **`--operation layer_patch`**, args: **`layer_id`**, **`patch`** object; if **`patch`** includes **`x`** and/or **`y`**, top-level **`panel_index`** or **`panel_number`** required. Text resize: **`width`** and **`height`** together; **`width`** drives wrap; device resize uniform with optional **`patch.fit`**. | Text resize: `width`+`height` together; device uniform scale + optional `fit` |
| `enqueue-op` | **`--operation layers_patch_bulk`**, args: **`layers`** array of **`layer_id`** + **`patch`**; optional shared **`panel_index`** / **`panel_number`**; any row with **`x`/`y`** in **`patch`** needs column id on op or on that row. | Per-row `panel_index` when `x`/`y` differ by column |
| `enqueue-op` | **`--operation batch`**, args: **`operations`** array of **`operation`** + **`args`** objects; executed in order; nested **`batch`** not allowed. | Ordered; nested `batch` not supported |
| `enqueue-op` | **`--operation set_equal_spacing`**, args: **`layer_ids`**, **`axis`**, **`gap`**, optional **`panel_index`** / **`panel_number`** (must match single column). | Targets one column |
| `enqueue-op` | **`--operation match_size`**, args: **`source_layer_id`**, **`target_layer_ids`**, **`mode`**: **`width`**, **`height`**, or **`both`** (text targets: width / both adjust wrap **`width`**; height not stretched to match). | Text width/both adjusts wrap width; height not forced to match for text |
| `enqueue-op` | **`--operation render_panel_preview`**, args: **`panel_index`**, or **`panel_number`**, or **`panel_indexes`** JSON array of **adjacent** 0-based ints; optional **`preview_multiplier`** **`1`** or **`2`**. | One or multi-column PNG to `agent-preview` |

Use **`layer_id`** values from the design store / canvas (e.g. after adding layers); `enqueue-op` does not return new layer IDs for adds.

## Payload examples (representative)

| CLI | Arg | Summary |
| --- | --- | --- |
| `enqueue-op` | **`--operation set_background`**, **`--args-json`**: color **`{"type":"color","value":"#101827"}`**; gradient with **`value.angleDeg`** and **`value.stops`**; image **`{"type":"image","value":"https://..."}`**. | `{"type":"color","value":"#101827"}` or gradient `value.angleDeg` + `stops`, or image URL in `value` |
| `enqueue-op` | **`--operation add_device_frame`**, **`--args-json`**: **`path`**, **`frame`**, **`panel_index`** or **`panel_number`**, optional **`x`**, **`y`**. | `{"path":"/device-frames/.../frame/front.svg","frame":"front","panel_index":0}` |
| `enqueue-op` | **`--operation add_text`**, **`--args-json`**: **`content`**, **`panel_index`** (or **`panel_number`**), **`x`**, **`y`**, **`font`**, **`size`**, **`color`**, **`align`**, **`weight`**, … | `{"content":"Headline","panel_index":2,"x":64,"y":128,"font":"headline","size":96,"color":"#ffffff","align":"left","weight":"700"}` |
| `enqueue-op` | **`--operation align`**, **`--args-json`**: **`layer_id`**, **`anchor`**, **`reference`** **`panel`** + **`panel_index`**, or **`reference`** other **`layer_id`**. | `{"layer_id":"<id>","anchor":"center_x","reference":"panel","panel_index":0}` or `reference":"<other_layer_id>"` |
| `enqueue-op` | **`--operation layer_patch`**, **`--args-json`**: **`layer_id`**, **`panel_index`** (or **`panel_number`**), **`patch`** with geometry / style keys. | `{"layer_id":"<id>","panel_index":0,"patch":{"x":320,"y":640}}` |
| `enqueue-op` | **`--operation render_panel_preview`**, **`--args-json`**: single column or **`panel_indexes`** array; optional **`preview_multiplier`**. | `{"panel_indexes":[0,1,2]}` or single `panel_index` / `panel_number`; optional `"preview_multiplier":1` |
| `enqueue-op` | **`--operation batch`**, **`--args-json`**: **`operations`** list of **`operation`** / **`args`**. | `{"operations":[{"operation":"text_set_content","args":{...}},{"operation":"set_z_index","args":{...}}]}` |

## Invalid names (do not use)

| CLI | Arg | Summary |
| --- | --- | --- |
| — | Invalid op name **`delete_layer`** — use **`remove_layer`** with **`layer_id`**. | Use `remove_layer` |
| — | Invalid **`set_bg`**, **`set_background_color`** — use **`set_background`** with valid **`type`**. | Use `set_background` with valid `type` |

Prefer `layer_patch` / `move_layer` for geometry; do not invent operation aliases not listed above.
