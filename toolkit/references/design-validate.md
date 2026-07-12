# Design validation (hybrid: rules CLI + agent vision)

Use with live previews from **`designer-reference.md`** (`render_panel_preview` / `pull-preview`, `capture_panel_preview_data` / `pull-preview-data`). Optional manual WCAG math: **`layout contrast`** in **`layout-reference.md`** (not part of **`validate-rules`**).

## Workflow (rules → vision → strip → user)

**screenshot-designer-agent:** One panel at a time. **Do not** start **`panel_index` N+1** until **`validate-rules`** for **`N`** exits **`0`** (checklist alone is not enough). Log **`Panel N gate: validate-rules exit 0`** when advancing.

**Plan ahead (fewer validate cycles):** Before the first **`enqueue-op`**, read check IDs below and **screenshot-designing** → **§ Validation-aware planning**. Build one **`batch`** that already satisfies margins, device height band, text↔device gap, etc. On failure, fix **all** failed checks in **one** repair **`batch`**, then re-validate (target ≤ **2** runs per panel).

1. For each **`panel_index`**: produce **`--png`** and **`--panel-data`** (required — do not skip panel JSON).
2. Run **`validate-rules`**. On failure, apply **all** **`suggested_fix`** / planned ops in **one** **`batch`**, re-preview, repeat **for the same panel** — do not advance.
3. When **`validate-rules`** exits **`0`**, run **vision rubric** (below) on the same PNG + checks summary (recommended; rules gate is mandatory).
4. After the **last** panel passes vision, run **`validate-strip-rules`** on the full multi-panel JSON (and optional **`--png-dir`**).
5. Ask the user to review the full strip.

```bash
python3 toolkit/scripts/designer.py validate-rules \
  --png ../output/temp/panel0.png \
  --panel-data ../output/temp/strip.json \
  --panel-index 0 \
  --preset-id appstore_iphone_portrait \
  --profile appstore_hero

python3 toolkit/scripts/designer.py validate-strip-rules \
  --panel-data ../output/temp/strip.json \
  --png-dir ../output/temp/panels \
  --profile appstore_hero
```

## `validate-rules` (non-vision)

| CLI | Arg | Summary |
| --- | --- | --- |
| `python toolkit/scripts/designer.py validate-rules` | Required **`--png`**. Required **`--panel-data`**. Optional **`--panel-index`**, **`--preset-id`** / **`--canvas-size`**, **`--profile`** (`default` \| `appstore_hero` \| `play_feature`), **`--tier`** (`safety` \| `all`; default **`safety`**), **`--emit-fixes`**. Tunables: margin, span, device overlap, font min, wrap ratio, device height band, text↔device gap, etc. | JSON **`{ "ok", "phase": "rules", "tier", "checks": [...], "style_failures": [...], "ok_all_checks" }`**. Exit code follows the **tier gate** (below). |

### Tiers (`--tier`, default `safety`)

Every check is classified **`safety`** (objective defect) or **`style`** (layout-taste heuristic) — see `designer/validate_tiers.py`. Professional layouts often violate style heuristics on purpose (cropped device, off-center hero, text over a shadowed frame), so style failures **warn** instead of failing the gate by default.

| Tier value | Exit `0` when | Use |
| --- | --- | --- |
| **`safety`** (default) | Every **safety** check passes (style failures listed in **`style_failures`**) | Composer/agent gate — aesthetics are judged by vision review, not rules |
| **`all`** | Every check passes (previous behavior) | Legacy canvas workflow, conservative layouts |

**Safety checks:** `png_preset_match`, `panel_data_required`, `panel_data_version`, `panel_resolve`, `text_no_overlap`, `text_safe_margins`, `text_font_min_size`, `text_ink_inside_safe_area`, `layer_z_order_sane` (+ strip: `strip_multi_panel`, `strip_gap_consistent`). Unknown/future check ids default to safety (fail closed).

**Style checks:** `text_span_sensible`, `text_single_line_bbox`, `text_device_no_overlap`, `text_device_vertical_gap`, `device_height_band`, `device_pairs_low_overlap`, `device_horizontal_center`, `device_safe_bottom`, `text_vertical_rhythm`, `text_hierarchy_sizes`, `text_align_consistency`, `text_preset_size_band`, `background_not_default_gray`, `panel_empty_margin_bands` (false-positives on intentional flat light themes), `device_region_not_blank` (+ strip: `cross_panel_*`, `strip_background_not_default_gray`).

### Profiles

| Profile | Panel behavior |
| --- | --- |
| **`default`** | Standard thresholds (48px min primary text, device height 60–80% of panel). |
| **`appstore_hero`** | Stricter margins, 16px min text gap, device centered on X, strict ink/gray checks. |
| **`play_feature`** | Slightly wider device band, looser device pair overlap. |

### Check IDs (`checks[].id`)

Each check has **`id`**, **`ok`**, **`detail`**. Violations in **`detail.violations`** may include **`suggested_fix`**: `{ "operation", "args" }` for **`enqueue-op`**.

| `id` | Meaning |
| --- | --- |
| **`png_preset_match`** | PNG dimensions match preset. |
| **`panel_data_required`** | **`--panel-data` missing** → **`ok: false`**. |
| **`panel_data_version`** | Snapshot **`version`** must be **`1`**. |
| **`panel_resolve`** | Could not pick a panel. |
| **`text_no_overlap`** | Text AABB overlap. |
| **`text_safe_margins`** | Text inside safe insets (shrunk bbox). **`violations_detail`** per edge. |
| **`text_span_sensible`** | Text width / panel width ≤ **`max_text_span`** (default **0.94**). |
| **`text_font_min_size`** | Primary text (not caption presets) **`size` ≥ 48px** (0 disables). |
| **`text_single_line_bbox`** | Unintended wrap heuristic (no `\n`, tall bbox). |
| **`text_device_no_overlap`** | No text vs device AABB overlap. |
| **`device_height_band`** | Device height / panel height in **[0.60, 0.80]** (profile may widen). |
| **`device_pairs_low_overlap`** | Multi-device overlap fraction cap. |
| **`text_vertical_rhythm`** | Min vertical gap between primary text layers. |
| **`text_hierarchy_sizes`** | Hero (top band / largest) must dominate other primary text sizes. |
| **`text_align_consistency`** | Primary text align matches (hero may differ). |
| **`device_horizontal_center`** | Device center X near panel center ( **`appstore_hero`** ). |
| **`device_safe_bottom`** | Device bbox within bottom safe inset. |
| **`layer_z_order_sane`** | Overlapping text must be above device in **`z_index`**. |
| **`text_preset_size_band`** | Optional font preset vs size band (profile-gated). |
| **`background_not_default_gray`** | Strict profiles: flat light-gray panel edges. |
| **`text_ink_inside_safe_area`** | Strict ink margin ( **`appstore_hero`** ). |
| **`panel_empty_margin_bands`** | Large flat **light** edge bands (mis-crop). |
| **`text_device_vertical_gap`** | Vertical dead space between the text stack and device when separated (default **≤ 10%** of panel height; **appstore_hero** **≤ 8%**). |
| **`device_region_not_blank`** | Device interior not uniform empty vs background. |

### Example (single panel)

```bash
python3 toolkit/scripts/designer.py enqueue-op \
  --operation render_panel_preview \
  --args-json '{"panel_index":0}'

python3 toolkit/scripts/designer.py pull-preview --out ../output/temp/panel0.png

python3 toolkit/scripts/designer.py enqueue-op \
  --operation capture_panel_preview_data \
  --args-json '{"panel_indexes":[0,1,2]}'

python3 toolkit/scripts/designer.py pull-preview-data --out ../output/temp/strip.json

python3 toolkit/scripts/designer.py validate-rules \
  --png ../output/temp/panel0.png \
  --panel-data ../output/temp/strip.json \
  --panel-index 0 \
  --preset-id appstore_iphone_portrait \
  --platform iphone
```

## `validate-strip-rules`

| CLI | Arg | Summary |
| --- | --- | --- |
| `python toolkit/scripts/designer.py validate-strip-rules` | Required **`--panel-data`** (all panels). Optional **`--png-dir`** (`panel0.png`, `0.png`, …). **`--profile`**, **`--expected-gap`**, **`--tier`** (`safety` \| `all`; default **`safety`**), **`--emit-fixes`**. | Strip-level consistency. Exit code follows the tier gate (see **§ Tiers**). |

| `id` | Meaning |
| --- | --- |
| **`strip_multi_panel`** | Need ≥ 2 panels in JSON. |
| **`strip_gap_consistent`** | **`gap`** matches profile / **`--expected-gap`**. |
| **`cross_panel_device_scale`** | Device height ratios similar across panels. |
| **`cross_panel_text_scale`** | Title-scale text sizes within ±4px across panels. |
| **`cross_panel_margin_rhythm`** | Top primary text **y** inset similar. |
| **`cross_panel_color_harmony`** | Edge mean colors similar (needs **`--png-dir`**). |
| **`strip_background_not_default_gray`** | Strict profile: no default gray edges per panel PNG. |

## Vision rubric (agent multimodal — no Python vision API)

After **`validate-rules`** passes, attach the **same PNG** and evaluate with this **required JSON shape**:

```json
{
  "pass": false,
  "panel_index": 0,
  "scores": {
    "hierarchy": 4,
    "spacing_rhythm": 3,
    "alignment": 4,
    "color_harmony": 5,
    "device_composition": 3,
    "legibility": 5
  },
  "issues": [
    {
      "severity": "high",
      "category": "spacing",
      "description": "Headline sits ~20px too close to device top bezel",
      "layer_hint": "text_hero",
      "fix_hint": "move_layer"
    }
  ],
  "notes": "optional"
}
```

**Input bundle:** PNG + paste failed/passed **`validate-rules`** summary + text/device table from panel JSON (**`layer_id`**, **`size`**, **`color`**, positions).

**Checklist (scan every category):**

- Margins and safe areas (panel edges, status-bar zone)
- Inter-element padding (headline ↔ subtitle ↔ device)
- Type scale (**title + subtitle only**; ignore caption unless illegible)
- Alignment (grid, center axis, optical centering)
- Contrast on gradients (judgment; use **`layout contrast`** if needed — not in **`validate-rules`**)
- Device scale, bezels, rotation, composition
- **Text ↔ device spacing:** no large empty band between headline block and device (rules: **`text_device_vertical_gap`**)
- Visual (not just bbox) text–device overlap
- Clutter and hierarchy clarity

**Rules:**

- One issue → one **`fix_hint`** naming an **`enqueue-op`** from **`designer-reference.md`**
- No vague “looks off”; use approximate px / % language
- Max **2** vision fail loops per panel, then escalate to the user

## Debugging

- Optional legibility: `python toolkit/scripts/layout.py contrast --a <text_hex> --b <bg_hex>` (**`layout-reference.md`**).
- Compact fixes only: **`validate-rules ... --emit-fixes`**.
