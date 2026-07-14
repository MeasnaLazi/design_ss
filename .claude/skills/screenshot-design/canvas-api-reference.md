# Canvas API reference (screenshot-designer)

The operations the **web_ui** screenshot-designer canvas accepts. They are POSTed to
`/__api/screenshot-designer/enqueue-command` and delivered to the **open designer tab**
over SSE, which applies them to the Fabric canvas. `composer/import-to-canvas.mjs` uses
these same operations to replay a rendered strip; send them **directly** only for
**user-requested canvas edits**. This is the **authoritative contract** — never invent
operation names, argument keys, or aliases (no `set_bg`, `delete_layer`,
`capture_panel_preview` without `_data`, etc.).

## Prerequisites

| Item | Detail |
| --- | --- |
| **Dev server** | In `web_ui/`: `npm run dev` (default `http://localhost:4713`). |
| **Base URL** | `http://localhost:4713/__api/screenshot-designer` (loopback only). |
| **Open tab** | A designer tab must be open and subscribed on the matching artboard **slug**; otherwise enqueue returns **`no_subscribers`**. |
| **Design mode** | POST `{base}/mode` `{"mode":"agent"}` **before any mutating op**. In `human` mode the server refuses mutating ops with **409 `human_mode`** (only `noop`, `render_panel_preview`, `capture_panel_preview_data` stay allowed). The UI's **Take over** button and a dev-server restart reset to `human`. |

## Sending an operation

POST `{base}/enqueue-command` with a JSON body `{ "operation": "<name>", "args": { … }, "requestId": "<optional>" }`:

```bash
curl -s -X POST http://localhost:4713/__api/screenshot-designer/enqueue-command \
  -H 'Content-Type: application/json' \
  -d '{"operation":"move_layer","args":{"layer_id":"text_1","dx":8,"dy":0}}'
```

The response is a JSON **ack** (`{ ok, slug, operation, requestId }`), not the canvas result. Wrap multiple changes in one `batch` (below).

## Read live `layer_id`s FIRST — this prevents "layer not found"

**Never guess or reuse stale `layer_id`s / layer names.** Before any op that takes a `layer_id`, fetch the current layout:

1. Enqueue `capture_panel_preview_data` for the target columns (see **Image**).
2. `GET {base}/agent-preview-data` → the version-1 snapshot listing each panel's `layers[]` with the **real** `layer_id`, `kind`, and panel-local geometry (shape at the end of this file).
3. Use those exact `layer_id`s in your ops.

A "layer not found" / "label not found" error means the `layer_id` you sent is not on the canvas — re-fetch the snapshot and use a current id.

## Coordinate rules

Panel-local coordinates require **`panel_index`** (0-based) or **`panel_number`** (1-based). **Text** `x`/`y` = **top-left** in panel space; **device** `device_set_position` `x`/`y` = **center** in panel space.

## Operations — Shared

| Operation | Args | Example `args` | Summary |
| --- | --- | --- | --- |
| **`remove_layer`** | `layer_id` | `{"layer_id":"text_1"}` | Delete the layer from canvas + store. |
| **`clear_user_layers`** | `{}` | `{}` | Delete **all** user layers (text, device, image); panels/guides untouched. Destructive — used by `import-to-canvas.mjs` for a clean slate. |
| **`move_layer`** | `layer_id`; `dx`,`dy` *or* `x`,`y` + `panel_index`/`panel_number` | `{"layer_id":"text_1","x":120,"y":64,"panel_index":0}` | Delta move (grid-snapped) or absolute panel-local position (text: top-left, device: center). |
| **`align`** | `layer_id`, `anchor`, `reference` (`panel` or a `layer_id`); `panel_index`/`panel_number` when reference is `panel` | `{"layer_id":"text_1","anchor":"right","reference":"panel","panel_index":0}` | `anchor` = `center_x`\|`center_y`\|`top`\|`bottom`\|`left`\|`right`. `reference:"canvas"` is rejected. |
| **`layer_patch`** | `layer_id`, `patch`; `panel_index`/`panel_number` when `patch` sets `x`/`y` | `{"layer_id":"text_1","patch":{"content":"Hello"},"panel_index":0}` | Partial field update. **Text:** if `patch` sets `width` or `height`, **both** are required (positive). **Device:** at least one of `width`/`height`. |
| **`layers_patch_bulk`** | `layers`: `[{layer_id,patch,…},…]`; optional top-level `panel_index`/`panel_number` | `{"layers":[{"layer_id":"text_1","patch":{"content":"A"}}]}` | Same `layer_patch` rules per entry. |
| **`batch`** | `operations`: `[{operation,args},…]` | `{"operations":[{"operation":"remove_layer","args":{"layer_id":"text_1"}}]}` | Runs nested ops in order; nested `batch` not allowed. |
| **`set_z_index`** | `layer_id`, `z_index` | `{"layer_id":"text_1","z_index":3}` | Reorder stack (clamped). |
| **`match_size`** | `source_layer_id`, `target_layer_ids`, `mode`: `width`\|`height`\|`both` | `{"source_layer_id":"device_1","target_layer_ids":["device_2"],"mode":"both"}` | Match size from source. |
| **`set_equal_spacing`** | `layer_ids` (≥2), `axis`, `gap` | `{"layer_ids":["text_1","text_2","text_3"],"axis":"y","gap":12}` | Fixed gap along axis within one panel column. |

## Operations — Text

| Operation | Args | Example `args` | Summary |
| --- | --- | --- | --- |
| **`add_text`** | `panel_index`/`panel_number`, `x`, `y`, `color`, `font`; optional `content`, `size`, `align`, `weight`, `font_family`, `no_snap` | `{"panel_index":0,"x":32,"y":48,"content":"Headline","color":"#111111","font":"title2"}` | New textbox at panel-local top-left. `font` is a **TextStylePresetId**: `largeTitle`, `title1`, `title2`, `title3`, `headline`, `body`, `callout`, `subheadline`, `footnote`, `caption1`, `caption2` (default `body`; `caption` aliases `caption1`). Preset supplies width/size/weight/align unless overridden. `no_snap:true` = exact placement (importer parity). |
| **`text_font_size_delta`** | `layer_id`, `delta` | `{"layer_id":"text_1","delta":-2}` | Change font size by delta px (clamped 8–400). |
| **`text_set_font_size`** | `layer_id`, `size` | `{"layer_id":"text_1","size":24}` | Absolute font size (8–400). |
| **`text_set_font_style`** | `layer_id`, `variant`: `regular`\|`bold`\|`italic`\|`bold_italic` | `{"layer_id":"text_1","variant":"bold"}` | Font style variant. |
| **`text_set_color`** | `layer_id`, `color` (`#rrggbb`) | `{"layer_id":"text_1","color":"#0a84ff"}` | Text fill color. |
| **`text_set_content`** | `layer_id`, `content` | `{"layer_id":"text_1","content":"Updated copy"}` | Replace string body. |
| **`text_set_line_height`** | `layer_id`, `line_height` (>0) | `{"layer_id":"text_1","line_height":1.2}` | Line-height multiplier. |
| **`text_set_letter_spacing`** | `layer_id`, `letter_spacing` | `{"layer_id":"text_1","letter_spacing":40}` | Character spacing (Fabric `charSpacing`). |
| **`text_auto_fit`** | `layer_id`; optional `min_size`, `max_size` | `{"layer_id":"text_1","min_size":12,"max_size":48}` | Shrink font to fit box width. |

## Operations — Device

| Operation | Args | Example `args` | Summary |
| --- | --- | --- | --- |
| **`add_device_frame`** | `panel_index`/`panel_number`; `path`, `frame` (required) | `{"path":"/device-frames/iphone_12_pro/frame/front.svg","frame":"front","panel_index":0}` | Insert device frame in that column. |
| **`device_size_delta`** | `layer_id`, `delta_px` or `delta` | `{"layer_id":"device_1","delta_px":-20}` | Change device width by delta px (uniform). |
| **`device_set_position`** | `layer_id`, `panel_index`/`panel_number`, `x`, `y` | `{"layer_id":"device_1","panel_index":0,"x":400,"y":520}` | Panel-local **center** of device. |
| **`device_move_delta`** | `layer_id`, `dx`, `dy`; optional `panel_index`/`panel_number` | `{"layer_id":"device_1","dx":0,"dy":16}` | Delta in document px. |
| **`device_set_angle`** | `layer_id`, `angle` (deg) | `{"layer_id":"device_1","angle":-3}` | Rotation. |
| **`device_set_size`** | `layer_id`; `width` and/or `height`; optional `fit`: `contain`\|`cover` | `{"layer_id":"device_1","width":900,"fit":"contain"}` | Uniform resize (aspect preserved). |
| **`device_set_frame_style`** | `layer_id`; `style` or `frame`; optional `pack_id` | `{"layer_id":"device_1","style":"front","pack_id":"iphone_12_pro"}` | Frame style / pack swap. |
| **`apply_screenshot_to_device`** | `layer_id` (device group), `url` (same-origin `/…` or `data:`) | `{"layer_id":"device_1","url":"/__api/datasource/screenshots/appstore_iphone_portrait/<id>.png"}` | Bakes the image into the device screen opening (rect or homography quad). Replaces any existing screenshot/placeholder. |

## Operations — Image

| Operation | Args | Example `args` | Summary |
| --- | --- | --- | --- |
| **`add_image`** | `panel_index`/`panel_number`; `url`; optional `x`,`y` (panel-local top-left, both or neither), `width` (px), `layer_name` | `{"panel_index":0,"url":"/__api/datasource/screenshots/<id>.png","x":80,"y":120,"width":400}` | New user image layer. Without `width`, clamped to ≤85% of the panel. |
| **`render_panel_preview`** | `panel_indexes` *or* `panel_index` *or* `panel_number`; optional `preview_multiplier` `1`\|`2` | `{"panel_indexes":[0],"preview_multiplier":1}` | Crops strip → browser POSTs PNG → read `GET {base}/agent-preview`. |
| **`capture_panel_preview_data`** | Same column selectors (no `preview_multiplier`) | `{"panel_indexes":[0]}` | Slim layout JSON → browser POSTs → read `GET {base}/agent-preview-data`. **Use this to get live `layer_id`s.** |

## Operations — Other

| Operation | Args | Example `args` | Summary |
| --- | --- | --- | --- |
| **`noop`** | `{}` | `{}` | No canvas work (connectivity check). |
| **`set_background`** | `type`/`mode`: `color`\|`gradient`\|`image`; `value` (or `color`/`gradient`/`image`/`image_url`); or top-level `background:{type,value,…}` | see below | Strip-wide artboard fill. |

### `set_background` args

Accepted modes: `color` (hex string), `gradient` (object), `image` (URL string). Aliases (`solid`, `background_gradient`, nested `background:{type,value}`) are normalized — prefer `type` + `value`.

Gradient `value` object: `{ "kind": "linear"|"radial", "angleDeg": <number>, "stops": [ {"offset":0-1,"color":"#rrggbb"}, … (≥2) ] }`. Compute stop hexes yourself from the theme's primary/secondary (do not use placeholder colors as-is).

- Gradient: `{"type":"gradient","value":{"kind":"linear","angleDeg":140,"stops":[{"offset":0,"color":"#0b0f14"},{"offset":1,"color":"#1b2733"}]}}`
- Solid: `{"type":"color","value":"#0b0f14"}`
- Image: `{"type":"image","value":"https://example.com/bg.png"}`

## Preview + snapshot endpoints

- `GET {base}/agent-preview` → last PNG a `render_panel_preview` pushed. **404 `no_preview_yet`** if none. Enqueue `render_panel_preview` first.
- `GET {base}/agent-preview-data` → last JSON a `capture_panel_preview_data` pushed. **404 `no_preview_data_yet`** if none.

**Snapshot shape (version `1`)** — matches `web_ui/src/types/agentPanelPreviewData.ts`. Top-level: `version`, `revision`, `capturedAt`, `gap`, `workspace_width`, `workspace_height`, optional `background` (`{type,value}`), `panels[]`. Each `panels[]`: `panel_index`, `panel_width`, `panel_height`, `panel_x`, `panel_y`, `layers[]` (text + device only, sorted by `z_index`). **`kind:"text"`** → panel-local top-left bbox; `layer_id`, `content`, `size`, `color`, `align`, `weight`, optional `font`, `line_height`, `letter_spacing`. **`kind:"device"`** → panel-local **center** of bezel bbox; `layer_id`, `angle`, `frame`, `pack_id`.
