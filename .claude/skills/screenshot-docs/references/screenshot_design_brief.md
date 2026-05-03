# Design brief (`datasource/temp/design_brief.json`)

Runtime handoff file between **`screenshot_requirements`**, **`screenshot_planning`**, **`screenshot_background`**, and **`screenshot_panel`**. Agents **read** the latest JSON at session start after delegation and **merge** their section before forwarding work.

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
| `creative_plan` | object | Filled by **screenshot_planning** — approved before **`toolkit_runner`** |
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

## `creative_plan` (Planning agent)

Written **after** **`requirements`** and **before** **`toolkit_runner`**. **No** `designer.py` in this phase.

| Field | Type | Description |
|-------|------|-------------|
| `user_approved` | boolean | **`true`** only after the user explicitly approves the full plan (single gate for creative feedback) |
| `version` | number | Optional monotonic revision counter when the plan is rewritten |
| `background` | object | Strip-wide intent — see below |
| `panels` | array | One entry per panel index **`0 … n-1`** aligned with **`requirements.store.screenshots`** order |

### `creative_plan.background`

| Field | Type | Description |
|-------|------|-------------|
| `preset_number` | number \| null | **1–13** from Background catalog (see **`phase-background.md`**) — `null` if only mood text |
| `preset_name` | string | Exact catalog name (e.g. `Aurora`) or empty if TBD |
| `mood_notes` | string | Optional freeform direction tied to **`store.theme`** |
| `contrast_notes` | string | Optional (e.g. light presets, future text tweaks) |

### `creative_plan.panels[]` entries

| Field | Type | Description |
|-------|------|-------------|
| `index` | number | 0-based; must match **`store.screenshots[index]`** |
| `looks_like` | string | Plain-language composition (“hero device top, title above…”) |
| `layers` | array | Ordered stack of planned layers — see below |

### `creative_plan.panels[].layers[]`

| Field | Type | Description |
|-------|------|-------------|
| `role` | string | e.g. `title`, `title_secondary`, `subtitle`, `subtitle_secondary`, `kicker`, `body`, `device_frame`, `badge`, `decorative` |
| `content_source` | string | e.g. `screenshots[i].title` or literal copy hint |
| `frame_hint` | string | Optional — which **`load-frame`** entry / style from pack |
| `notes` | string | Alignment, weight, or hierarchy notes for **screenshot_panel** |
| `layout` | object \| null | Optional measurable hints for **screenshot_panel** — see **`layout`** below. Omit for legacy plans; tiers from Step 6 apply when absent. |

#### `creative_plan.panels[].layers[].layout` (optional)

All keys are optional. Use **`text`** for copy layers, **`device`** for `device_frame` layers. Coordinates are **panel-local** where applicable; align with **`toolkit/references/screenshot-designer-toolkit-reference.md`** (16px grid, `font` tokens, hex colors).

| Sub-object | Suggested keys | Meaning |
|------------|------------------|---------|
| `text` | `font_token`, `size_px`, `weight`, `color_hex`, `align`, `max_width_px`, `x_px`, `y_px`, `region`, `line_height`, `letter_spacing`, `rotation_deg` | `font_token` must be one of `headline` \| `subheadline` \| `body` \| `caption` (designer API). `region` is a coarse hint (e.g. `top_third`) if explicit x/y omitted. |
| `device` | `frame` / path hint, `anchor_panel_index`, `center_x_px`, `center_y_px`, `target_width_px`, `tilt_deg`, `z_index_hint`, `spanning_panel_indexes` | `anchor_panel_index`: column for **`add_device_frame`** / **`panel_index`**. `spanning_panel_indexes`: adjacent strip columns the frame should read across (preview with **`panel_indexes`**). |
| `spatial` | `margin_top_px`, `margin_sides_px`, `text_to_text_gap_px`, `text_to_device_clearance_px` | Planning-side clearance targets. |
| `stack` | `stack_order` | Integer; lower = further back among layers in the same panel storyboard. |

**Downstream:** **`screenshot_background`** implements **`creative_plan.background`**. **`screenshot_panel`** implements each **`panels[i]`** in order. When a layer has **`layout`**, **screenshot_panel** should prefer those values over default tier inference for that layer. **`toolkit_runner`** must not run until **`creative_plan.user_approved`** is **`true`**.

---

## `background` (Background agent)

| Field | Type | Description |
|-------|------|-------------|
| `preset_number` | number \| null | 1–13 from catalog, or `null` until applied |
| `preset_name` | string | e.g. `Aurora`, `Slate Depth` |
| `user_approved` | boolean | **`true`** when strip background is finalized (interactive approval **or** successful **plan-driven auto** run) |
| `applied_from_plan` | boolean | Optional; set **`true`** when **`user_approved`** was reached by executing **`creative_plan`** without extra user prompts |
| `background_type` | string | `gradient` \| `color` (option 13 solid) |
| `set_background_payload` | object | Ready for `set_background` op: theme-derived `angleDeg` + `stops`, or `color` value for solid |
| `contrast_notes` | string | Optional: light presets, text color tweaks |

Until **`creative_plan.user_approved`** is **`true`**, do not start **`toolkit_runner`** / background execution. Until **`background.user_approved`** is **`true`**, **screenshot_panel** must not assume a finalized strip background.

---

## `panel` (Panel agent)

| Field | Type | Description |
|-------|------|-------------|
| `typography_locked` | boolean | `true` after Step 6 tiers + spacing ladder recorded in this object |
| `title_tier` | object | `font`, `size`, `weight` + optional `color` hex from theme |
| `subtitle_tier` | object | Same structure; must differ visibly from title |
| `body_tier` | object \| null | Optional caption tier |
| `spacing_ladder_px` | object | e.g. `{ "title_to_subtitle": 24, "subtitle_to_device": 32 }` |
| `current_panel_index` | number | 0-based active panel (or jump target per user **in a later session** if redoing) |
| `completed_panel_indexes` | number[] | Indices considered shippable |
| `explicit_user_command_wins` | boolean | Set `true` when user overrides default linear order (interactive sessions; usually `false` in full-auto runs) |

---

## Example (illustrative)

After **`screenshot_planning`** with an approved plan (before **`toolkit_runner`**), **`handoff_ok`** may still be absent until **`screenshot_background`** runs **`designer handoff`**.

```json
{
  "$schema": "publisher-design-brief-v1",
  "updatedAt": "2026-05-02T12:00:00Z",
  "requirements": {
    "user_started": true,
    "platform": "iphone",
    "pack_id": "iphone_12_pro",
    "pack_path": "…/device_packs/iphone_12_pro",
    "store_json_path": "…/output/appstore.json",
    "preset_id": "preset-uuid",
    "store": {
      "name": "MyApp",
      "theme": { "primary_color": "#6366f1", "background_color": "#0f172a" },
      "screenshots": [
        { "title": "Hero", "subtitle": "Hook", "description": "" },
        { "title": "Feature A", "subtitle": "", "description": "" }
      ]
    },
    "target_panel_count": 5
  },
  "creative_plan": {
    "user_approved": true,
    "version": 1,
    "background": {
      "preset_number": 2,
      "preset_name": "Aurora",
      "mood_notes": "Cool gradient; brand primary visible in mid stop."
    },
    "panels": [
      {
        "index": 0,
        "looks_like": "Two phones stacked isometric: hero rear-tilt, smaller foreground; title + kicker in upper negative space; subtitle clears both bezels.",
        "layers": [
          {
            "role": "title",
            "content_source": "screenshots[0].title",
            "layout": {
              "text": {
                "font_token": "headline",
                "size_px": 88,
                "weight": "700",
                "color_hex": "#ffffff",
                "align": "left",
                "max_width_px": 520,
                "margin_top_px": 56
              },
              "stack": { "stack_order": 20 }
            }
          },
          {
            "role": "kicker",
            "content_source": "literal:New",
            "layout": {
              "text": { "font_token": "caption", "size_px": 28, "weight": "600", "color_hex": "#94a3b8", "align": "left" },
              "stack": { "stack_order": 21 }
            }
          },
          {
            "role": "subtitle",
            "content_source": "screenshots[0].subtitle",
            "layout": {
              "text": { "font_token": "subheadline", "size_px": 36, "weight": "400", "color_hex": "#e2e8f0", "align": "left" },
              "spatial": { "text_to_text_gap_px": 16 },
              "stack": { "stack_order": 22 }
            }
          },
          {
            "role": "device_frame",
            "frame_hint": "angled steel frame rear",
            "notes": "Rear phone; lower z",
            "layout": {
              "device": {
                "anchor_panel_index": 0,
                "center_x_px": 400,
                "center_y_px": 1100,
                "target_width_px": 420,
                "tilt_deg": -14,
                "spanning_panel_indexes": [0, 1]
              },
              "stack": { "stack_order": 5 }
            }
          },
          {
            "role": "device_frame",
            "frame_hint": "front primary",
            "notes": "Foreground hero",
            "layout": {
              "device": {
                "anchor_panel_index": 0,
                "center_x_px": 360,
                "center_y_px": 1280,
                "target_width_px": 480,
                "tilt_deg": 8
              },
              "stack": { "stack_order": 15 }
            }
          }
        ]
      }
    ]
  },
  "background": {
    "preset_number": 2,
    "preset_name": "Aurora",
    "user_approved": false,
    "applied_from_plan": false,
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
