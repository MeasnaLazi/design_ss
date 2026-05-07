# Toolkit ↔ Web UI API

The Python **toolkit** talks to the running **web_ui** Vite dev server only on **loopback** (`localhost`, `127.0.0.1`, `::1`). Base URL is `DESIGNER_API_BASE` or defaults to:

`http://localhost:4713/__api/screenshot-designer`

All paths below are relative to that base (no trailing slash on the base).

## Toolkit HTTP client (`toolkit/scripts/designer/client.py`)

| Method | Path | Request body | Success response | Notes |
|--------|------|----------------|------------------|-------|
| GET | `/session` | — | JSON object: canvas width/height, `presetId`, optional `savedAt`, `displayFile` | Session probe and handoff. Server resolves preset from cookies / referer / defaults (see server). |
| POST | `/execute` | `{"operation": "<string>", "args": { ... }}` | JSON object (operation-specific) | Runs on **server** path. Operations that only run in the browser return an error message pointing to `enqueue-command`. |
| POST | `/enqueue-command` | `{"operation": "<string>", "args": { ... }, "requestId"?: "<string>"}` | JSON ack or error JSON | Delivers to an **open** designer tab via SSE. Full contract: [POST enqueue-command](#post-enqueue-command) below. |
| GET | `/agent-preview` | — | PNG bytes (`image/png`) | Last preview pushed from the browser. **404** = no preview yet (`no_preview_yet`). Toolkit may poll until PNG changes. |
| GET | `/agent-export` | — | JSON object (layout summary) | Last export pushed from the browser. **404** if none yet. Optional query **`panel_index`**: comma-separated **0-based adjacent** columns (e.g. `?panel_index=0` or `?panel_index=0,1`) returns the **sliced** envelope (`slicedExportVersion`, `panels[]`, …); omit query for full-strip **`AgentLayoutSummaryV1`**. Invalid slice → **400** `slice_failed`. |

### POST enqueue-command

Server implementation: `web_ui/vite-plugin-datasource-api.ts`. Browser subscriber: `web_ui/src/hooks/useAgentCommandSync.ts` (EventSource + `applyAgentCommand`).

| Item | Detail |
|------|--------|
| **Purpose** | Queue a **client-authoritative** canvas operation. The dev server resolves a **display slug** from the HTTP request, emits one SSE message to every tab subscribed on that slug, and the browser applies the op on Fabric (in memory; no automatic datasource write). |
| **Method / path** | `POST {base}/enqueue-command` where `{base}` is e.g. `http://localhost:4713/__api/screenshot-designer`. |
| **Content-Type** | `application/json` |

**Request body (JSON)**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `operation` | string | yes | Operation name (e.g. `render_panel_preview`, `export_json`). Must be non-empty. |
| `args` | object | no | Defaults to `{}` if missing or not an object. Operation-specific keys (validated in toolkit for some ops via `designer/enqueue_validate.py`). |
| `requestId` | string | no | Echoed on the SSE payload and in the success JSON as `requestId` (or `null` if omitted). Useful for correlating enqueue → apply → logs. |

**Display slug (routing)**

The server picks the target stream using `resolveDesignerDisplaySlugFromHints` (`web_ui/screenshot-designer-server.ts`) from the **enqueue POST** itself—not from the JSON body:

| Source | How it is read |
|--------|----------------|
| Query on the POST URL | `canvasSize`, `presetId`, `artboard` (same hint names as `/session`). |
| Cookie | `screenshotDesignerArtboard` (URL-decoded value = `?artboard=` style preset hint). |
| Header | `Referer` URL’s `artboard` query param. |

At least one open tab must have `GET /__api/screenshot-designer/command-events?slug=<that-slug>` (EventSource) so `listenerCount(slug) > 0`. The tab’s slug comes from the **current artboard** in the UI (`getDisplayFileSlug(artboardPresetId)`), so it must match the resolved slug from your POST hints—otherwise you get `no_subscribers` for the wrong slug.

**Success response** (`200`, `application/json`)

| Field | Value |
|-------|--------|
| `ok` | `true` |
| `slug` | Resolved display slug the event was emitted on. |
| `operation` | Same as request. |
| `requestId` | Same as request, or `null` if omitted. |

**Error responses** (`application/json` unless noted)

| HTTP | Body shape | When |
|------|------------|------|
| 400 | `{ "error": "missing_operation" }` | Empty `operation` string. |
| 400 | `{ "error": "<message>" }` | Invalid JSON body or other handler exception. |
| 503 | `{ "ok": false, "error": "no_subscribers", "slug": "<slug>", "message": "…" }` | No SSE client subscribed for that `slug`. |

**SSE payload** (after successful enqueue; each subscriber receives)

Server writes one `data:` line (`text/event-stream`). Parsed JSON shape:

| Field | Description |
|-------|-------------|
| `type` | `"agent_command"` |
| `slug` | Display slug (must match the tab’s active slug or the client ignores the message). |
| `operation` | Operation name. |
| `args` | Object from the enqueue request. |
| `requestId` | Optional string from the enqueue request. |

Initial SSE connection also sends `{ "type": "hello", "slug" }` (ignored by the command handler).

**Browser → server follow-up**

After applying (or failing), the tab POSTs to `/__api/screenshot-designer/command-result` with `slug`, `operation`, `requestId`, `ok`, optional `error`. This is for dev-server logging only; the Python toolkit does not call this endpoint.

**Operations that must use enqueue** (not `/execute` on the server)

Names come from `CLIENT_AUTHORITATIVE_OPERATIONS` in `web_ui/screenshot-designer-server.ts`. Summaries below match `web_ui/src/canvas/applyAgentCommand.ts`.

### Agent operations reference

| Operation | Summary |
|-----------|---------|
| `noop` | No canvas work. **`/execute`** returns `{ ok: true }` on the server; browser handler is a no-op. |
| `set_background` | Artboard background: solid **hex**, **gradient** object, or **image** URL (`background` / nested `type`+`value` style payload). Updates store + redraws. |
| `add_device_frame` | Inserts a device frame in **`panel_index`**, optional **`path`** (device PNG) and **`frame`** style id (defaults apply). |
| `add_text` | New textbox at **panel-local** **`x`**, **`y`** with **`content`**, **`size`**, hex **`color`**, **`font`** token, **`align`**, **`weight`**; width estimated from content. |
| `align` | Moves **`layer_id`** so **`anchor`** (center_x, center_y, top, bottom, left, right) aligns to **`reference`**: **`panel`** + panel index/number (panel-local rect), or another layer id (**same panel column** as target). `reference: canvas` is rejected. |
| `move_layer` | **`layer_id`** and either **panel-local** **`x`**, **`y`** + **`panel_index`** / **`panel_number`** (text: top-left, device: center in panel), or **`dx`**, **`dy`** for a grid-snapped delta (panel inferred; optional **`panel_index`** must match). |
| `text_font_size_delta` | **`layer_id`** + **`delta`**: current font size ± delta, rounded and clamped **8–400** px. |
| `text_set_font_size` | **`layer_id`** + **`size`**: absolute font size, clamped **8–400** px. |
| `text_set_font_style` | **`layer_id`** + **`variant`**: `regular` \| `bold` \| `italic` \| `bold_italic`. |
| `text_set_color` | **`layer_id`** + hex **`color`** (`#rrggbb`). |
| `text_set_content` | **`layer_id`** + **`content`** string. |
| `text_set_line_height` | **`layer_id`** + **`line_height`** (> 0). |
| `text_set_letter_spacing` | **`layer_id`** + **`letter_spacing`** (maps to Fabric `charSpacing`). |
| `text_auto_fit` | **`layer_id`**; optional **`min_size`** / **`max_size`**. Shrinks font from current down to fit estimated text width in the textbox width. |
| `device_size_delta` | **`layer_id`** + **`delta_px`** (or **`delta`**): scales device width by delta px, uniform scale, min width and max ≈ 3× panel width. |
| `device_set_position` | **`layer_id`**, **`panel_index`**, **panel-local** **`x`**, **`y`** (positions **center** of device in that panel). |
| `device_move_delta` | **`layer_id`**, **`dx`**, **`dy`** in document px (grid-snapped); panel inferred from position; optional **`panel_index`** must match inference. |
| `device_set_angle` | **`layer_id`** + **`angle`** (degrees). |
| `device_set_size` | **`layer_id`** + at least one of **`width`** / **`height`** (> 0); **`fit`**: `contain` (default) or `cover`; preserves aspect on device frame. |
| `device_set_frame_style` | **`layer_id`** + **`style`** (or **`frame`**); optional **`pack_id`** to swap frame asset / bezel style. |
| `remove_layer` | **`layer_id`**: removes Fabric object and store entry. |
| `set_z_index` | **`layer_id`** + integer **`z_index`**: reorders canvas stack (`moveObjectTo`), clamped to valid range. |
| `layer_patch` | **`layer_id`** + **`patch`** object (subset of layout fields: position, size, text props, etc.). If **`x`** / **`y`** in patch, **`panel_index`** (or panel_number) required for panel-local coords. |
| `layers_patch_bulk` | **`layers`**: array of `{ layer_id, patch, … }`. Same panel rules as `layer_patch`; optional top-level default panel for entries that need it. |
| `batch` | **`operations`**: array of `{ operation, args }` applied **in order**; nested **`batch`** rejected. |
| `set_equal_spacing` | **`layer_ids`** (≥ 2) + **`axis`** + **`gap`**: stacks objects along axis with fixed gap between successive bounding edges (same panel). |
| `match_size` | **`source_layer_id`**, **`target_layer_ids`[]**, **`mode`**: `width` \| `height` \| `both`. Non-text: scale to match source scaled size. **Textbox**: width-only adjustment when width/both (height follows text). |
| `export_json` | Builds **AgentLayoutSummary** from canvas and **POST**s JSON to the dev **`agent-export`** endpoint (for toolkit pull-export). |
| `render_panel_preview` | **`panel_indexes`** (contiguous strip) **or** **`panel_index`** (0-based) **or** **`panel_number`** (1-based): crops that strip/single panel → agent preview PNG; optional **`preview_multiplier`**. Use a contiguous `panel_indexes` range spanning all columns for a full-strip capture. |

**Toolkit**

| API | Location |
|-----|----------|
| `designer_enqueue_command(base_url, operation, args, request_id=…)` | `toolkit/scripts/designer/client.py` |
| CLI | `python toolkit/scripts/designer.py enqueue-op --operation … --args-json … [--request-id …]` |

### CLI entrypoints

| Command area | Script | Purpose |
|--------------|--------|---------|
| Designer HTTP | `toolkit/scripts/cli/designer_cmds.py` (e.g. `python toolkit/scripts/designer.py …`) | `handoff`, `session`, `execute`, `execute-op`, `enqueue-op`, `pull-preview`, `pull-export`, etc. |

### Not HTTP (same repo)

| What | How toolkit uses `web_ui` |
|------|---------------------------|
| Device frames catalog | Reads `web_ui/public/device-frames/index.json` from disk (`layout device-packs`). |
| Placeholder image URLs | Strings in `toolkit/scripts/layout/presets.py` (e.g. `…/__api/datasource/placeholder/iphone.jpg`) for **browser** fetches when applying commands—not Python `GET`. |

## Related screenshot-designer routes (browser / plugin)

These are served under the same Vite `/__api` middleware but are **not** called by `designer/client.py`:

| Method | Full path pattern | Used by |
|--------|-------------------|---------|
| GET | `/__api/screenshot-designer/command-events?slug=…` | Browser (SSE subscriber) |
| POST | `/__api/screenshot-designer/command-result` | Browser (result after applying command) |
| POST | `/__api/screenshot-designer/agent-preview` | Browser (upload latest PNG) |
| POST | `/__api/screenshot-designer/agent-export` | Browser (upload latest JSON) |

The dev server persists the last preview and last export under **`datasource/memories/`** (`.agent_last_preview.png`, `.agent_last_export.json`). That directory is gitignored except `.gitkeep`.

## Datasource `/__api/datasource/…`

Used from **web_ui** TypeScript (`fetch` in `src/lib/*`). The toolkit does **not** implement a Python HTTP client for these; placeholder URLs may appear inside **args** sent to `/execute` or `/enqueue-command`.