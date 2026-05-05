# Web UI toolkit reference

Commands that talk to the screenshot-designer HTTP API (Vite `web_ui`, loopback). Run from publisher repo root unless noted. Optional global flag: `python toolkit/scripts/designer.py --compact <subcommand>` (same pattern as `layout.py`).

**Layout** (`layout.py`: presets, store JSON, packs, grid, text, `predict-checks`, …): **`layout-reference.md`**. **Image bytes**: **`vision-reference.md`**.

## Handoff

Proceed with live canvas ops only when `designer.py handoff` returns `"ok": true` and `handoff.web_ui_status` is `ready`, `started`, or `already_running`. If not ready, start `web_ui` / `toolkit_runner` first.

Base URL resolution: `DESIGNER_API_BASE`, then `toolkit/.env`, then default `http://localhost:4713/__api/screenshot-designer`.

| CLI | Arg | Summary |
| --- | --- | --- |
| `python toolkit/scripts/designer.py handoff` | `--timeout` (default 15), `--skip-session` (URLs only; `web_ui_status` unverified) | JSON with `web_ui_url`, `web_ui_status`, designer API readiness |
| `python toolkit/scripts/designer.py session` | `--timeout` (default 60) | GET session: canvas dimensions, `presetId`, display context |
| `python toolkit/scripts/designer.py execute` | `--json <path\|-\>` (body must include `operation`), `--timeout` | POST `/execute` with full JSON body |
| `python toolkit/scripts/designer.py execute-op` | `--operation <op>`, `--args-json '{}'`, `--timeout` | POST `/execute` with operation + args |
| `python toolkit/scripts/designer.py enqueue-op` | `--operation <op>`, `--args-json '{}'`, optional `--request-id`, `--timeout` | POST `/enqueue-command` (runs in open Web UI tab via SSE); toolkit validates args before HTTP |
| `python toolkit/scripts/designer.py pull-preview` | `--out <file.png>`; optional `--panels` (comma 0-based adjacent indices), `--preview-multiplier 1\|2` (with `--panels`), `--poll-interval`, `--timeout` | GET last `agent-preview` PNG; with `--panels`, enqueues one `render_panel_preview` for contiguous columns, polls until bytes change |
| `python toolkit/scripts/designer.py pull-export` | optional `--panels` (comma adjacent 0-based), `--timeout` | GET last `agent-export` JSON after `export_json`; with `--panels`, per-column sliced export |
| `python toolkit/scripts/benchmark_agent_preview.py` | e.g. `--panels 0` | Benchmark preview capture (requires running `web_ui`) |

Preview scale: `pull-preview --preview-multiplier` and `render_panel_preview.preview_multiplier` override `web_ui` env `VITE_AGENT_PREVIEW_MULTIPLIER` (default **2**). Capture path: Fabric `toBlob` → POST `agent-preview`.

## `enqueue-op` operations

Use only the operation names below. Args are JSON for `--args-json`. Panel placement: `panel_index` (0-based) or `panel_number` (1-based) required where noted; text `x`/`y` = panel-local top-left, device `x`/`y` = panel-local center (see Web UI / Fabric parity).

| CLI | Arg | Summary |
| --- | --- | --- |
| `enqueue-op` | `noop` `{}` | Connectivity no-op |
| `enqueue-op` | `set_background` `{"type":"color\|gradient\|image",...}` | Canvas background; image uses `{"type":"image","value":"https://..."}` |
| `enqueue-op` | `add_device_frame` `path`, `frame`, **`panel_index` \| `panel_number`**, optional `x`,`y` | Add device from pack; optional center in column |
| `enqueue-op` | `add_text` `content`, **`panel_index` \| `panel_number`**, `x`,`y`, `font`, `size`, … | `font`: `headline\|subheadline\|body\|caption` |
| `enqueue-op` | `align` `layer_id`, `anchor`, `reference` (`panel` + panel id, or other `layer_id` same column) | `anchor`: `center_x\|center_y\|top\|bottom\|left\|right`; `reference: "canvas"` rejected |
| `enqueue-op` | `move_layer` `layer_id` + panel `x`,`y` **or** `dx`,`dy` | Absolute needs `panel_index`/`panel_number`; delta optional panel assert |
| `enqueue-op` | `text_font_size_delta` `layer_id`, `delta` | |
| `enqueue-op` | `text_set_font_size` `layer_id`, `size` | |
| `enqueue-op` | `text_set_font_style` `layer_id`, `variant` | `regular\|bold\|italic\|bold_italic` |
| `enqueue-op` | `text_set_color` `layer_id`, `color` | |
| `enqueue-op` | `text_set_content` `layer_id`, `content` | |
| `enqueue-op` | `text_set_line_height` `layer_id`, `line_height` | |
| `enqueue-op` | `text_set_letter_spacing` `layer_id`, `letter_spacing` | |
| `enqueue-op` | `text_auto_fit` `layer_id`, `min_size`, `max_size` | |
| `enqueue-op` | `device_size_delta` `layer_id`, `delta_px` (or `delta`) | |
| `enqueue-op` | `device_set_size` `layer_id`, `width`/`height`, optional `fit` `contain\|cover` | Uniform scale; device layers only |
| `enqueue-op` | `device_set_position` `layer_id`, **`panel_index` \| `panel_number`**, `x`,`y` | Panel-local center |
| `enqueue-op` | `device_move_delta` `layer_id`, `dx`,`dy`, optional panel | Optional panel must match column |
| `enqueue-op` | `device_set_angle` `layer_id`, `angle` | |
| `enqueue-op` | `device_set_frame_style` `layer_id`, `style`, optional `pack_id` | |
| `enqueue-op` | `remove_layer` `layer_id` | |
| `enqueue-op` | `set_z_index` `layer_id`, `z_index` | |
| `enqueue-op` | `layer_patch` `layer_id`, `patch`; if `patch` has `x`/`y`, add **`panel_index` or `panel_number`** | Text resize: `width`+`height` together; device uniform scale + optional `fit` |
| `enqueue-op` | `layers_patch_bulk` `layers[]`, optional shared `panel_index` | Per-row `panel_index` when `x`/`y` differ by column |
| `enqueue-op` | `batch` `{"operations":[{"operation","args"},...]}` | Ordered; nested `batch` not supported |
| `enqueue-op` | `set_equal_spacing` `layer_ids`, `axis`, `gap`, optional panel | Targets one column |
| `enqueue-op` | `match_size` `source_layer_id`, `target_layer_ids`, `mode` `width\|height\|both` | Text width/both adjusts wrap width; height not forced to match for text |
| `enqueue-op` | `render_panel_preview` `panel_index` \| `panel_number` \| `panel_indexes` (adjacent), optional `preview_multiplier` | One or multi-column PNG to `agent-preview` |
| `enqueue-op` | `export_json` `{}` | Push layout summary for `pull-export` |

Resolve canonical `layer_id` via `export_json` then `pull-export`. `enqueue-op` does not return new layer IDs for adds.

## Payload examples (representative)

| CLI | Arg | Summary |
| --- | --- | --- |
| `enqueue-op` | `set_background` | `{"type":"color","value":"#101827"}` or gradient `value.angleDeg` + `stops`, or image URL in `value` |
| `enqueue-op` | `add_device_frame` | `{"path":"/device-frames/.../frame/front.svg","frame":"front","panel_index":0}` |
| `enqueue-op` | `add_text` | `{"content":"Headline","panel_index":2,"x":64,"y":128,"font":"headline","size":96,"color":"#ffffff","align":"left","weight":"700"}` |
| `enqueue-op` | `align` | `{"layer_id":"<id>","anchor":"center_x","reference":"panel","panel_index":0}` or `reference":"<other_layer_id>"` |
| `enqueue-op` | `layer_patch` | `{"layer_id":"<id>","panel_index":0,"patch":{"x":320,"y":640}}` |
| `enqueue-op` | `render_panel_preview` | `{"panel_indexes":[0,1,2]}` or single `panel_index` / `panel_number`; optional `"preview_multiplier":1` |
| `enqueue-op` | `batch` | `{"operations":[{"operation":"text_set_content","args":{...}},{"operation":"set_z_index","args":{...}}]}` |

## Invalid names (do not use)

| CLI | Arg | Summary |
| --- | --- | --- |
| — | `delete_layer` | Use `remove_layer` |
| — | `set_bg`, `set_background_color` | Use `set_background` with valid `type` |

Prefer `layer_patch` / `move_layer` for geometry; do not invent operation aliases not listed above.
