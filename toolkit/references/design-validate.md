# Design validation (hybrid: rules CLI + agent vision)

Use with live previews from **`designer-reference.md`** (`render_panel_preview` / `pull-preview`, `capture_panel_preview_data` / `pull-preview-data`). **Offline** color math matches **`layout-reference.md`** (`layout contrast`); the rules CLI calls the same contrast implementation in Python.

## `validate-rules` (non-vision)

| CLI | Arg | Summary |
| --- | --- | --- |
| `python toolkit/scripts/designer.py validate-rules` | Required **`--png <path>`** — PNG from **`pull-preview`**. Optional **`--panel-data <path>`** — JSON from **`pull-preview-data`** (version **`1`**). Optional **`--panel-index <n>`** when `panels[]` has more than one entry. Optional **`--preset-id`** or **`--canvas-size`** (`iphone` \| `ipad` \| `phone` \| `tablet`) for PNG dimension match (same resolution as `layout image match-preset`). Optional tunables: **`--margin-frac`**, **`--margin-floor-px`**, **`--margin-max-px`**, **`--margin-tolerance-px`**, **`--margin-text-bbox-shrink-px`**, **`--margin-text-horizontal-extra-px`**, **`--max-text-span`**, **`--max-device-pair-overlap`**. | Prints JSON **`{ "ok", "phase": "rules", "checks": [...] }`**. **Exit `0`** only if every check has **`"ok": true`**. **No HTTP** — runs offline. |

### Check IDs (`checks[].id`)

Each row is one object in **`checks`** with **`id`**, **`ok`**, **`detail`**.

| `id` | Meaning |
| --- | --- |
| **`png_preset_match`** | PNG width/height match the resolved preset (from **`--preset-id`** / **`--canvas-size`**; defaults match `layout` preset resolution). |
| **`panel_data_required`** | Only when **`--panel-data`** was omitted: geometry rules were skipped; **`ok`** is still **`true`** with a skip note. |
| **`panel_data_version`** | Snapshot **`version`** must be **`1`**. |
| **`panel_resolve`** | Could not pick a panel (empty `panels[]`, unknown **`--panel-index`**, or multiple panels without **`--panel-index`**). |
| **`text_no_overlap`** | Text–text AABB overlap in the same **`panel_index`** (positive intersection area). |
| **`text_safe_margins`** | Every text bbox inside panel insets after **per-axis shrink**: vertical uses **`margin_text_bbox_shrink_px`** (default **18**) capped by **`height/2`**; horizontal uses **`margin_text_bbox_shrink_px` + `margin_text_horizontal_extra_px`** (extra default **16**) capped by **`width/2`** — fixes wide shallow Textboxes that only violated **left/right**. Then nominal margin (**`max(floor, frac×min side)`**), **`margin_max_px`** cap, **`margin_tolerance_px`**. **`violations_detail`** on failure. |
| **`text_contrast_background`** | Each text **`color`** vs mean colors in a **thin halo just outside** the text’s panel-local bounding box in the PNG (matches pixels next to the glyphs). If no halo strips exist (degenerate layout), falls back to **panel edge** strip means. Large text (**`size` ≥ 48**) uses WCAG large-text ratio **3.0**; smaller uses **4.5**. If PNG size ≠ that panel’s **`panel_width` × `panel_height`**, this check **`ok`: true** with **`skipped`** in **`detail`** (rely on **vision** for contrast). Violation objects may include **`contrast_sample_source`** (`local_bbox_halo` \| `panel_edges_fallback`) and **`background_samples_used`**. |
| **`text_span_sensible`** | Each text **`width / panel_width` ≤ `max_text_span`** (default **0.94**). |
| **`text_device_no_overlap`** | No text AABB vs device AABB overlap (device **`x`,`y`** = panel-local **center** of align bbox). |
| **`device_height_band`** | Each device **`height / panel_height`** in **[0.50, 0.90]** (inclusive). |
| **`device_pairs_low_overlap`** | If two or more devices in one panel: **`intersection_area / min(area_a, area_b)` ≤ `max_device_pair_overlap`** (default **0.15**). |

### Example

```bash
python3 toolkit/scripts/designer.py enqueue-op \
  --operation render_panel_preview \
  --args-json '{"panel_index":0}'

python3 toolkit/scripts/designer.py pull-preview --out ../output/temp/panel0.png

python3 toolkit/scripts/designer.py enqueue-op \
  --operation capture_panel_preview_data \
  --args-json '{"panel_index":0}'

python3 toolkit/scripts/designer.py pull-preview-data --out ../output/temp/panel0.json

python3 toolkit/scripts/designer.py validate-rules \
  --png ../output/temp/panel0.png \
  --panel-data ../output/temp/panel0.json \
  --preset-id appstore_iphone_portrait
```

Use **`--canvas-size iphone`** instead of **`--preset-id`** when you only know the slug.

## Agent workflow: rules first, then vision (no Python vision API)

1. Produce **`--png`** (and **`--panel-data`** for full rules) for the **active** strip column.
2. Run **`validate-rules`**. If **`ok`** is **`false`**, fix with **`enqueue-op`** / **`batch`**, re-preview, and run **`validate-rules`** again. **Do not** run the vision step until rules pass.
3. When **`validate-rules`** exits **`0`**, attach the **same PNG** to the chat and evaluate with **multimodal vision** using a **fixed JSON shape**, for example:
   - **`pass`**: boolean
   - **`issues`**: array of short strings (hierarchy, legibility, alignment, safe area, text–device **visual** overlap, device scale/bezels, multi-device composition, contrast on gradients where rules skipped or sampling was weak)
   - **`notes`**: optional string
4. **If `pass` is `true`:** if there is a **next** `panel_index`, continue the per-panel loop; if this was the **last** panel, **stop** automated passes and **ask the user** to review the full strip / approve or request changes.
5. **If `pass` is `false`:** treat as a failed gate — fix with **`enqueue-op`**, re-preview, then run **`validate-rules`** and **vision** again for the **same** panel until both pass.

For manual contrast debugging, use **`python toolkit/scripts/layout.py contrast --a <hex> --b <hex>`** (`layout-reference.md`).
