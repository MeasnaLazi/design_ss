# Design brief (`datasource/temp/design_brief.json`)

Runtime handoff file between **`screenshot_requirements`**, **`screenshot_background`**, and **`screenshot_panel`**. Agents **read** the latest JSON at session start after delegation and **merge** their section before forwarding work.

**Location:** [`datasource/temp/design_brief.json`](../../../../datasource/temp/design_brief.json) (created/updated by agents; ignored by git unless you add a `!` exception in [`.gitignore`](../../../../.gitignore)).

**Other session files in `datasource/temp/`:**

- Preview PNGs from `pull-preview`: e.g. `panel_0_*.png`, `strip_*.png`
- One-off API payload JSON for `designer enqueue-op` when not merged into this brief

---

## Top-level shape

| Field | Type | Description |
|-------|------|-------------|
| `$schema` | string | Optional URI or label for tooling (e.g. `"publisher-design-brief-v1"`) |
| `updatedAt` | string | ISO-8601 timestamp of last merge |
| `requirements` | object | Filled by **screenshot_requirements** |
| `background` | object | Filled by **screenshot_background** |
| `panel` | object | Filled by **screenshot_panel** |

---

## `requirements` (Requirements agent)

| Field | Type | Description |
|-------|------|-------------|
| `handoff_ok` | boolean | Set by **`screenshot_background`** after `designer handoff` reports `ok: true` (omit or `false` until then; **not** set by **`screenshot_requirements`**) |
| `web_ui_status` | string | From handoff: `ready` \| `started` \| `already_running` — merged by **`screenshot_background`** with **`handoff_ok`** |
| `user_started` | boolean | `true` after **`screenshot_requirements`** Step 0 approval (or narrow skip) |
| `platform` | string | `iphone` \| `ipad` \| `phone` \| `tablet` |
| `pack_id` | string | Device pack directory name (e.g. `iphone_12_pro`) |
| `pack_path` | string | Path from `layout device-packs` |
| `store_json_path` | string | Absolute path to chosen store file (e.g. `output/appstore.json`) |
| `preset_id` | string | Artboard preset ID from `layout store-json` when available |
| `store` | object | Copy or reference: at minimum `name`, `theme`, `screenshots[]` (titles for listing) |
| `target_panel_count` | number | Intended `min(max(5, screenshots.length), 10)` per Web UI limits |
| `notes` | string | Optional freeform |

---

## `background` (Background agent)

| Field | Type | Description |
|-------|------|-------------|
| `preset_number` | number \| null | 1–13 from catalog, or `null` until chosen |
| `preset_name` | string | e.g. `Aurora`, `Slate Depth` |
| `user_approved` | boolean | `true` when user approves the current strip background |
| `background_type` | string | `gradient` \| `color` (option 13 solid) |
| `set_background_payload` | object | Ready for `set_background` op: theme-derived `angleDeg` + `stops`, or `color` value for solid |
| `contrast_notes` | string | Optional: light presets, text color tweaks |

Until `user_approved` is `true`, the **Panel agent** must not assume typography lock on a final background (but Requirements/Background may already have set `set_background` iteratively).

---

## `panel` (Panel agent)

| Field | Type | Description |
|-------|------|-------------|
| `typography_locked` | boolean | `true` after Step 6 tiers + spacing ladder recorded in this object |
| `title_tier` | object | `font`, `size`, `weight` + optional `color` hex from theme |
| `subtitle_tier` | object | Same structure; must differ visibly from title |
| `body_tier` | object \| null | Optional caption tier |
| `spacing_ladder_px` | object | e.g. `{ "title_to_subtitle": 24, "subtitle_to_device": 32 }` |
| `current_panel_index` | number | 0-based active panel (or jump target per user) |
| `completed_panel_indexes` | number[] | Indices considered shippable |
| `explicit_user_command_wins` | boolean | Set `true` when user overrides default linear order |

---

## Example (illustrative)

After **`screenshot_requirements`** only, **`handoff_ok`** / **`web_ui_status`** may be absent until **`screenshot_background`** runs **`designer handoff`**.

```json
{
  "$schema": "publisher-design-brief-v1",
  "updatedAt": "2026-04-28T12:00:00Z",
  "requirements": {
    "handoff_ok": true,
    "web_ui_status": "ready",
    "user_started": true,
    "platform": "iphone",
    "pack_id": "iphone_12_pro",
    "pack_path": "…/device_packs/iphone_12_pro",
    "store_json_path": "…/output/appstore.json",
    "preset_id": "preset-uuid",
    "store": {
      "name": "MyApp",
      "theme": { "primary_color": "#6366f1", "background_color": "#0f172a" },
      "screenshots": [{ "title": "…", "subtitle": "…", "description": "…" }]
    },
    "target_panel_count": 5
  },
  "background": {
    "preset_number": 2,
    "preset_name": "Aurora",
    "user_approved": false,
    "background_type": "gradient",
    "set_background_payload": { "type": "gradient", "value": { "angleDeg": 125, "stops": [] } }
  },
  "panel": {
    "typography_locked": false,
    "current_panel_index": 0,
    "completed_panel_indexes": []
  }
}
```
