# Screenshot-designer Web UI API

`composer/import-to-canvas.mjs` drives the running **web_ui** Vite dev server over these **loopback** endpoints (`localhost`, `127.0.0.1`, `::1`) to replay a rendered strip into the canvas. Base URL is the importer's `--api` (default `http://localhost:4713`) plus `/__api/screenshot-designer`:

`http://localhost:4713/__api/screenshot-designer`

All paths below are relative to that base (no trailing slash on the base).

## Screenshot-designer HTTP endpoints

| Method | Path | Request body | Success response | Notes |
|--------|------|----------------|------------------|-------|
| GET | `/session` | — | JSON object: canvas width/height, `presetId`, optional `savedAt`, `displayFile` | Session probe and handoff. Server resolves preset from cookies / referer / defaults (see server). |
| POST | `/execute` | `{"operation": "<string>", "args": { ... }}` | JSON object (operation-specific) | Runs on **server** path. Operations that only run in the browser return an error message pointing to `enqueue-command`. |
| POST | `/enqueue-command` | `{"operation": "<string>", "args": { ... }, "requestId"?: "<string>"}` | JSON ack or error JSON | Delivers to an **open** designer tab via SSE. Full contract: [POST enqueue-command](#post-enqueue-command) below. |
| GET | `/agent-preview` | — | PNG bytes (`image/png`) | Last preview pushed from the browser. **404** = no preview yet (`no_preview_yet`). The importer may poll until the PNG changes. |
| GET | `/agent-preview-data` | — | JSON object (`application/json`) | Last slim panel layout snapshot from the browser. **404** = no snapshot yet (`no_preview_data_yet`). The importer may poll until `revision` changes. |
| GET | `/mode` | — | `{"ok": true, "mode": "human"\|"agent", "since": "<iso>", "holder": "<string>\|null"}` | One-way design mode (Phase 4). Dev-server lifetime state; restart resets to `human`. |
| POST | `/mode` | `{"mode": "human"\|"agent", "holder"?: "<string>"}` | Same shape as GET | While `human`, mutating `enqueue-command` ops return **409 `human_mode`** (exempt: `noop`, `render_panel_preview`, `capture_panel_preview_data`). The Web UI polls this and shows a read-only overlay + **Take over** button while `agent`. |

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
| `operation` | string | yes | Operation name (e.g. `render_panel_preview`). Must be non-empty. |
| `args` | object | no | Defaults to `{}` if missing or not an object. Operation-specific keys (see the operation table below). |
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

After applying (or failing), the tab POSTs to `/__api/screenshot-designer/command-result` with `slug`, `operation`, `requestId`, `ok`, optional `error`. This is for dev-server logging only; `import-to-canvas.mjs` does not call this endpoint.

**Operations that must use enqueue** (not `/execute` on the server)

Names come from `CLIENT_AUTHORITATIVE_OPERATIONS` in `web_ui/screenshot-designer-server.ts`. Summaries below match `web_ui/src/canvas/applyAgentCommand.ts`.

### Agent operations reference

| Operation | Summary |
|-----------|---------|
| `noop` | No canvas work. **`/execute`** returns `{ ok: true }` on the server; browser handler is a no-op. |
| `set_background` | Artboard background: solid **hex**, **gradient** object, or **image** URL (`background` / nested `type`+`value` style payload). Updates store + redraws. |
| `add_device_frame` | Inserts a device frame in **`panel_index`**, optional **`path`** (device PNG) and **`frame`** style id (defaults apply). |
| `add_text` | New textbox at **panel-local** **`x`**, **`y`** (top-left). **`font`** is a **`TextStylePresetId`** from `web_ui/src/constants/textStylePresets.ts` (`largeTitle`, `title1`, … `caption2`; omit or use **`body`** as default). Matches sidebar presets via **`addTextboxToCanvas`** (preset **width**, **fontSize**, **fontWeight**, **textAlign**, **layer name**, **fontStyle**). Legacy alias **`caption`** → **`caption1`**. Optional overrides: **`size`**, **`align`** (`left`\|`center`\|`right`), **`weight`** (`regular`\|`normal`\|`bold` or numeric); omitted keys keep the preset’s values. Hex **`color`**. |
| `align` | Moves **`layer_id`** so **`anchor`** (must be **`center_x`**, **`center_y`**, **`top`**, **`bottom`**, **`left`**, or **`right`**) aligns to **`reference`**: **`panel`** + panel index/number (panel-local rect), or another layer id (**same panel column** as target). `reference: canvas` is rejected. |
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
| `layer_patch` | **`layer_id`** + **`patch`** object (subset of layout fields: position, size, text props, etc.). If **`x`** / **`y`** in patch, **`panel_index`** (or panel_number) required for panel-local coords. **Text:** if **`width`** or **`height`** appears in **`patch`**, **both** must be set (positive numbers). **Device:** at least one of **`width`** / **`height`** may be set. |
| `layers_patch_bulk` | **`layers`**: array of `{ layer_id, patch, … }`. Same rules as `layer_patch` per entry; optional top-level default panel for entries that need it. |
| `batch` | **`operations`**: array of `{ operation, args }` applied **in order**; nested **`batch`** rejected. |
| `set_equal_spacing` | **`layer_ids`** (≥ 2) + **`axis`** + **`gap`**: stacks objects along axis with fixed gap between successive bounding edges (same panel). |
| `match_size` | **`source_layer_id`**, **`target_layer_ids`[]**, **`mode`**: `width` \| `height` \| `both`. Non-text: scale to match source scaled size. **Textbox**: width-only adjustment when width/both (height follows text). |
| `render_panel_preview` | **`panel_indexes`** (contiguous strip) **or** **`panel_index`** (0-based) **or** **`panel_number`** (1-based): crops that strip/single panel → agent preview PNG; optional **`preview_multiplier`**. Use a contiguous `panel_indexes` range spanning all columns for a full-strip capture. |
| `capture_panel_preview_data` | Same column selectors as **`render_panel_preview`** (no **`preview_multiplier`**): builds a **minimal** JSON snapshot for the requested strip (layer ids, panel-local layout fields for **`text`** / **`device`** only) and POSTs it to **`/agent-preview-data`**. Use PNG preview for visual/copy checks. |

**Caller**

| API | Location |
|-----|----------|
| `enqueue(operation, args)` helper (POST `/enqueue-command`) | `composer/import-to-canvas.mjs` |

No CLI calls these endpoints — only the browser (SSE) and `composer/import-to-canvas.mjs`.

### Not HTTP (same repo)

| What | How the tooling uses `web_ui` |
|------|---------------------------|
| Device frames catalog | Reads `web_ui/public/device-frames/index.json` from disk (`layout device-packs`). |
| Placeholder image URLs | Served by the dev server at `…/__api/datasource/placeholder/…` for **browser** fetches when applying commands. |

## Related screenshot-designer routes (browser / plugin)

These are served under the same Vite `/__api` middleware, driven by the browser (SSE) and `composer/import-to-canvas.mjs`:

| Method | Full path pattern | Used by |
|--------|-------------------|---------|
| GET | `/__api/screenshot-designer/command-events?slug=…` | Browser (SSE subscriber) |
| POST | `/__api/screenshot-designer/command-result` | Browser (result after applying command) |
| POST | `/__api/screenshot-designer/agent-preview` | Browser (upload latest PNG) |
| GET | `/__api/screenshot-designer/agent-preview-data` | `composer/import-to-canvas.mjs` (poll after capture) |
| POST | `/__api/screenshot-designer/agent-preview-data` | Browser (upload latest panel JSON after **`capture_panel_preview_data`**) |

The dev server persists the last preview under **`datasource/memories/`** (`.agent_last_preview.png`, `.agent_last_preview_data.json`). That directory is gitignored except `.gitkeep`.

### Panel preview data (enqueue + pull)

1. **enqueue** — `import-to-canvas.mjs` POSTs `capture_panel_preview_data` to `/enqueue-command` with **`panel_indexes`** (or **`panel_index`** / **`panel_number`**).
2. **Browser** — SSE delivers the op; Fabric projects a slim JSON DTO and POSTs to **`/agent-preview-data`**.
3. **poll** — GET **`/agent-preview-data`**; poll until **`revision`** changes after enqueue.

**GET `/agent-preview-data` JSON (version `1`)** — top-level: `version`, `revision`, `capturedAt`, `gap`, `workspace_width`, `workspace_height`, optional `background` (`type` + `value`), `panels[]`. **`revision`** includes `background` so background-only edits invalidate polls. Text layers may include `font`, `line_height`, `letter_spacing`. Each panel: `panel_index`, `panel_width`, `panel_height`, `panel_x`, `panel_y`, `layers[]` (panel-local geometry; see `web_ui/src/types/agentPanelPreviewData.ts`).

Live reads after canvas edits must use enqueue + pull; persisted `display_*.json` can lag auto-save.

## Datasource `/__api/datasource/…`

Used from **web_ui** TypeScript (`fetch` in `src/lib/*`); placeholder URLs may appear inside **args** sent to `/execute` or `/enqueue-command`.