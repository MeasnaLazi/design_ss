---
name: screenshot-designing
disable-model-invocation: true
description: >-
  Senior store screenshot UI workflow for apps_publisher: read output/screenshot_report.md,
  drive designer.py / enqueue-op in one panel at a time by default, pull-preview for crops.
  Artboard backgrounds: theme-mixed gradients via set_background (primary/secondary from
  report or same-store JSON). Per panel: required title + subtitle text layers; description
  caption optional. Use when acting as screenshot-designer-agent or when the user
  names this skill.
---

# Screenshot designing

## When this applies

Use **whenever** you act as **screenshot-designer-agent** or the user asks you to load this skill. It governs **single-panel-first** iteration, toolkit usage, and acceptance checks.

## Required reading (order)

1. **This skill** — especially **§ Single-panel default** and **§ Workflow** below.  
2. **Publisher toolkit** — [`toolkit/SKILL.md`](../../../toolkit/SKILL.md), then open the references it points to before running commands:  
   - Live canvas / `enqueue-op` allowlist: [`toolkit/references/designer-reference.md`](../../../toolkit/references/designer-reference.md)  
   - Presets, listings, device packs, contrast, **`layout image`** (CLI tables + image QA conventions): [`toolkit/references/layout-reference.md`](../../../toolkit/references/layout-reference.md)

Do **not** guess `enqueue-op` operation names or flags; copy exact strings from **designer-reference**.

## Toolkit CLI only (non-negotiable)

- Use only **`python toolkit/scripts/designer.py`** and **`python toolkit/scripts/layout.py`** subcommands documented in **`toolkit/references/`**.
- **Never** use `python -c`, `python3 -c`, heredoc Python, or throwaway scripts for hex blending, contrast, store JSON, or `enqueue-op` payloads.
- **Theme gradient stops:** `python toolkit/scripts/layout.py color mix` and `color toward` (see **layout-reference**). **Contrast:** `layout contrast`. **Store theme:** `layout store-json` or the report’s **Theme** section.

## Repo root

Let **`R`** = the **apps_publisher** repository root (this workspace). Run CLI commands from **`R`** unless a reference says otherwise.

## Single-panel default (non-negotiable)

- **Default:** Work **exactly one** strip column at a time. Declare an active **`panel_index`** (0-based) at the start of each plan → apply cycle. **`enqueue-op` / `batch`** should only mutate layers tied to **that** `panel_index` / `panel_number` unless the exception applies.  
- **Preview:** **`render_panel_preview`** for one column, then **`pull-preview --out`** (see **§ Workflow** table).  
- **Exception — multi-panel:** You may touch **more than one** `panel_index` in one batch **only** when the design explicitly requires it (e.g. device visually spanning adjacent columns, or user-requested synchronized spacing). Write a **one-line rationale** before issuing those ops.  
- **Carousel order:** Complete panel **0** through the **per-panel gate** (§ Workflow — **`validate-rules` exit 0** before panel **1**), then **1**, … **Exception:** A one-time whole-strip step (e.g. `set_background`) may run first; then return to per-panel work and still run the gate per panel before advancing.

## Artboard background (`set_background`) — design policy

This section is **agent behavior**. For **CLI args and JSON shapes** only, read **`toolkit/references/designer-reference.md`** → **`set_background`** / **§ `set_background` args**.

### Default: theme-mixed gradient

Use **`type` / `mode`: `gradient`** for almost every strip / carousel artboard. Flat solid fields read unfinished on store listings unless the brand is intentionally minimal.

**Theme source (required before `set_background`):**

1. Read **`## Theme (from store JSON)`** in **`screenshot_report.md`** for the store you are designing (**App Store** vs **Play** — never mix).
2. Let **`P`** = primary hex, **`S`** = secondary hex (verbatim from the report, or from **`theme`** in the **same** `appstore.json` / `playstore.json` as the panels).
3. If either value is `—` or empty, use the other for both stops (lighten/darken variants) or ask the user—**do not** fall back to generic slate (`#0f172a` / `#1e293b`) or copy preset hex from this skill.

**Build stops from `P` and `S` (creative but on-brand):**

- **Every stop** must be traceable to **`P`**, **`S`**, or a **blend** of them (e.g. ~50% mix toward black for a deep hero, ~30% mix toward white for a highlight edge).
- Compute stop hexes with **`layout color mix`** / **`layout color toward`** — not `python -c`.
- Use **2–4 stops**. Typical patterns (pick one; vary **angleDeg** / **kind** across runs and panels when the story allows):
  - **Linear brand sweep:** darkened **`P`** at `offset: 0` → **`S`** or P→S blend at mid → lightened **`S`** at `1`.
  - **Radial hero:** **`kind: "radial"`** — lighter **`P`** or tint near center, deepened **`S`** at outer stop (good for device-forward panels).
  - **Dual-accent:** **`P`** at `0`, blend at `0.45`, **`S`** at `1` with different **angleDeg** than the last panel if you vary per column.
- **Mood** comes from **Overview** / **Summary for designer** (warm vs cool, calm vs energetic)—achieve it by **how much** you darken/lighten **`P`**/**`S`**, not by swapping in unrelated palette families.
- **Forbidden defaults:** Do not paste **`web_ui`** default slate, **`designer-reference`** example hex, or named preset colors **without** remapping every stop through **`P`**/**`S`**.

**Strip vs per-panel:**

- One strip-wide **`set_background`** is fine when all columns share one artboard.
- When **Overview** or continuity calls for rhythm, vary **angleDeg**, **kind** (`linear` vs `radial`), or stop weights—but keep stops theme-derived.

### Structure presets (remap colors only)

Use these **layouts** for inspiration; **replace every `#…` stop** with your theme-mixed hexes from **`P`**/**`S`**.

| Structure | Mood hint | Layout (remap all colors to theme) |
| --- | --- | --- |
| **Depth sweep** | Default hero / utility | `linear`, 120–160°, 2 stops: dark **`P`** → lighter **`S`** |
| **Tri-accent** | Tech, feature density | `linear`, 3 stops: dark **`P`** → blend → **`S`** |
| **Stage radial** | Device hero | `radial`, 3 stops: tint **`P`** center → mid blend → deep **`S`** edge |
| **Warm push** | Lifestyle, energy | `linear`, 3 stops: deep **`P`** → saturated mix → bright **`S`** |
| **Calm glass** | Health, finance-adjacent | `linear`, 180°, 3 stops: very dark **`P`** → mid **`S`** → softened **`S`** |
| **Premium edge** | Consumer luxury | `linear`, 45–90°, 3 stops: near-black **`P`** → accent mix → muted **`S`** |

### Rare exceptions

| Mode | When |
| --- | --- |
| **`color`** (solid) | User or **`screenshot_report.md`** **explicitly** requires a flat field; or gradient cannot meet contrast and flat is the only fix — prefer **`P`** or darkened **`P`**, not arbitrary gray. |
| **`image`** | User or brief supplies a background asset URL only — no stock photos by default. |

### Apply + verify

Substitute your computed theme hexes for `<P_dark>`, `<S_light>`, etc.:

```bash
python toolkit/scripts/designer.py enqueue-op \
  --operation set_background \
  --args-json '{"type":"gradient","value":{"kind":"linear","angleDeg":140,"stops":[{"offset":0,"color":"<P_dark>"},{"offset":0.5,"color":"<P_S_blend>"},{"offset":1,"color":"<S_light>"}]}}'
```

After **`set_background`**, check text contrast against **darkest and lightest** gradient stops with **`layout contrast`** (see [checklist.md](checklist.md)).

## Inputs

| Source | Use |
| --- | --- |
| `R/output/screenshot_report.md` | **Always** read before designing. Per panel: **Title**, **Subtitle**, **Description**, and especially **Summary for designer** (planning-agent message for that slot). Also **Overview**, **`## Theme (from store JSON)`** (required for **`set_background`**), **Continuity / handoff** for context. |
| `R/output/appstore.json` / `R/output/playstore.json` | Theme / copy when needed; **same file** as the report’s store (do not mix App Store theme with Play panels). |

Do **not** overwrite `output/screenshot_report.md` unless the user explicitly asks.

## Planning brief (`Summary for designer`)

**`output/screenshot_report.md`** is written by **planning-agent**. For each strip column you work on, locate the matching row in **`## App Store — panel detail`** and/or **`## Play Store — panel detail`** (panel number **`n`** ↔ **`panel_index` `n − 1`**).

**Required reading per active panel:**

1. **`Summary for designer`** — the planning-agent’s message for **this** slot: why the panel exists, what to communicate, how it fits the carousel. **Treat this as your primary creative brief** for layout decisions (device emphasis, copy hierarchy, whether to show optional caption, mood). It does **not** override toolkit rules (safe zone, contrast, no overlap) or **§ Per-panel copy layers** (still exactly one title + one subtitle on canvas).
2. **`Continuity / handoff`** — how this panel connects to the next (use for story rhythm; optional for single-panel composition).
3. **`## Overview (for the designer)`** — read once per run for whole-carousel context.

**Summary for designer** may suggest *ideas* (e.g. “hero device”, “trust badge”) — you interpret them visually; planning does not specify fonts, positions, or hex beyond Theme.

## Per-panel copy layers (required vs optional)

For each active **`panel_index`**, read that row’s **Title**, **Subtitle**, **Description**, and **Summary for designer** from **`output/screenshot_report.md`**. Map **Title / Subtitle / Description** to **`add_text`** layers on the canvas; use **Summary for designer** to guide *how* you compose the panel:

| Brief field | Canvas layer | Required? | Typical `font` preset |
| --- | --- | --- | --- |
| **Title** | One **title** textbox | **Yes** — exactly **one** per panel | `title2`, `title3`, or `largeTitle` (shorter copy) |
| **Subtitle** | One **subtitle** textbox | **Yes** — exactly **one** per panel | `subheadline` or `headline` |
| **Description** | **Caption** textbox | **Optional** — add **only** when it strengthens the panel (extra detail, CTA, legal line). If empty, redundant with title/subtitle, or cluttered, **omit** the caption layer. | `callout`, `footnote`, or `caption1` |

**Do not** add a second title, second subtitle, or a caption “because the JSON has three fields.” Two text layers (title + subtitle) is the normal case; three only when the description earns its place.

### Sanitize title and subtitle strings

Before **`add_text`** / **`text_set_content`**, normalize **title** and **subtitle** copy:

**Trim** ends; collapse repeated spaces to one.

Apply the same newline stripping to **description** when you choose to show it as an optional caption.

Placement of the **title / subtitle / optional caption** block may still vary by panel (not always top-aligned); see **§ Layout and text placement**.

## Layout and text placement

- **Coordinates ≠ layout rule:** Toolkit docs describe text **`x`/`y`** as **panel-local top-left** — that is how positions are **measured**, not an instruction to pin every headline to the **top edge** of the panel.  
- **Do not default every panel** to “title band across the top + device below” unless **`screenshot_report.md`** or the user asks for that pattern. Prefer **variety across carousel panels** (copy mid-panel, lower third, beside the device, asymmetric balance) when the brief allows.
- **Tighten text ↔ device:** When copy sits above the frame, keep vertical gap modest (roughly **≤ 8–10%** of panel height). **`validate-rules`** fails **`text_device_vertical_gap`** if the band is too large—use **`device_move_delta`** / **`move_layer`**, not a tiny device floating in the lower half with a huge empty middle.  
- **Hard constraints** stay as in [checklist.md](checklist.md): no bbox overlap between text layers or between **text vs device**, safe margins / contrast, readable hierarchy. Use **`move_layer`**, **`align`**, **`layer_patch`**, **`set_z_index`** as needed — higher **`z_index`** draws **in front**; choice of stacking is a design decision, not “text always on top.”

## Validation-aware planning (before enqueue — reduces re-validation)

**Goal:** Most panels pass **`validate-rules`** on the **first** run. Plan like a senior designer who already knows the rule IDs in **`toolkit/references/design-validate.md`**.

### Plan template (paste in your message per panel)

```text
Active panel: N
Summary: <one line from report>
Profile: appstore_hero | default | play_feature
Panel: WxH from session
Planned checks addressed:
  - text_device_vertical_gap: <device y / gap estimate ≤ 8–10% H>
  - device_height_band: <height ≈ 0.75–0.85 H>
  - text_safe_margins, text_no_overlap, text_font_min_size: <positions/sizes>
  - text_contrast_*: <layout contrast results for text vs gradient stops>
Enqueue batch (ordered):
  1. set_background …
  2. add_text title …
  3. add_text subtitle …
  4. add_device_frame …
  5. device_set_position / device_set_size / align …
  6. set_z_index …
```

Execute steps **1–6** as **one `batch`** when possible. Use **`layout contrast`** and **`layout color`** while writing the plan, not after validation fails.

### Preventive rules (common failures → plan ops upfront)

| Likely `checks[].id` | Plan ahead (before first validate) |
| --- | --- |
| **`text_device_vertical_gap`** | Place device so gap from text stack bottom to device top **≤ 8%** panel H (`appstore_hero`) or **10%** (`default`). Prefer **`device_set_position`** + **`device_set_size`** together—not title at `y≈80` and device center at `y≈0.75×H` with empty middle. |
| **`device_height_band`** | Size device to **~75–85%** of panel height (`device_set_size` / `device_size_delta`). |
| **`device_horizontal_center`** | **`align`** device **`center_x`** to **`panel`** (`appstore_hero`). |
| **`text_safe_margins`** / **`text_ink_inside_safe_area`** | Inset text from edges (~4% min side + profile margin). Use **`align`** to panel **`left`** / **`top`** with margin, not raw `x=0`. |
| **`text_font_min_size`** | Title **`size` ≥ 48** (or preset **`title2`**+); subtitle smaller but readable. |
| **`text_no_overlap`** / **`text_vertical_rhythm`** | Stack title → subtitle with **≥ 16px** gap; no overlapping bboxes. |
| **`text_device_no_overlap`** | Separate text band and device band vertically (or side-by-side with clear columns). |
| **`text_contrast_background`** / **`text_color_on_theme`** | **`layout contrast --a <text> --b <darkest stop>`**; lighten text or darken stop until pass. |
| **`text_span_sensible`** | Avoid full-width text boxes; wrap copy or reduce **`width`**. |
| **`layer_z_order_sane`** | If text overlaps device bbox, text **`z_index`** higher. |

### When validation still fails

1. Read **every** failed **`checks[].id`** and **`detail.violations`** (and **`suggested_fix`** if present).
2. Write a short **Repair batch** list addressing **all** failures at once.
3. Run **one** **`batch`**, then **one** re-preview + **`validate-rules`**.
4. **Max 2** validate cycles per panel, then escalate to the user with failed IDs.

**Do not** fix only the first failed check and re-validate five times.

## Workflow

### Setup (once per run)

1. **Stack ready:** `python toolkit/scripts/designer.py handoff` — if not `ok`, follow **tool-running-agent**; do not edit `web_ui/src/**` unless the user asks.  
2. **Session:** `python toolkit/scripts/designer.py session` — note canvas size, `screens`, gap, preset.  
3. **Panel JSON (once):** `enqueue-op` **`capture_panel_preview_data`** for all strip columns you will validate, then **`pull-preview-data --out R/output/temp/strip.json`** (keep path for every panel’s **`validate-rules`**).

### Per-panel loop (repeat for `panel_index` = 0, 1, … — do not skip a gate)

| Step | Action | Block next panel if skipped |
| --- | --- | --- |
| A | **Declare** **Active panel: `N`**. Read **Summary for designer** + copy fields. | — |
| B | **Validation-aware plan** (template above) → **one `batch`** for panel **`N`** (unless cross-panel exception). | — |
| C | **`render_panel_preview`** `{"panel_index":N}` → **`pull-preview --out R/output/temp/panelN.png`** | — |
| D | **`validate-rules`** (below) — must exit **`0`** | **Yes** |
| E | [checklist.md](checklist.md) for panel **`N`** | **Yes** (after D) |
| F | Log **`Panel N gate: validate-rules exit 0`**, then only then start step A for **`N+1`** | — |

**`validate-rules` (step D — required every panel):**

```bash
python toolkit/scripts/designer.py enqueue-op \
  --operation render_panel_preview \
  --args-json '{"panel_index":N}'

python toolkit/scripts/designer.py pull-preview --out output/temp/panelN.png

python toolkit/scripts/designer.py validate-rules \
  --png output/temp/panelN.png \
  --panel-data output/temp/strip.json \
  --panel-index N \
  --preset-id <from session or list-presets> \
  --profile appstore_hero \
  --platform iphone
```

On exit **non-zero**: list **all** failed IDs → **one repair `batch`** (§ Validation-aware planning) → repeat C+D once (≤ **2** validate runs total per panel). **Never** open **Active panel: `N+1`** until step D exits **0**.

**Previews:** Do not spam `render_panel_preview` without cause.

### After last panel

- **`validate-strip-rules`** on full **`strip.json`** per **`design-validate.md`**, then user strip review.

## Done when

- Every panel has **`Panel N gate: validate-rules exit 0`** in the run log, [checklist.md](checklist.md) satisfied per panel, **`validate-strip-rules`** when applicable (or documented cross-panel exception + user-approved full-strip sign-off).

## Do not

- Invent `enqueue-op` names not listed in **designer-reference** (see invalid-alias table there).  
- Replace checklist tables with a prose-only summary when the user needs auditability.  
- Edit [checklist.md](checklist.md) on disk during normal runs.
- Use **`python -c`** or any ad-hoc Python instead of documented toolkit CLI (see **§ Toolkit CLI only**).
- Mark a panel complete or start the next **`panel_index`** without **`validate-rules` exit 0`** for the current panel.
- Run more than **2** **`validate-rules`** cycles on one panel without user approval; or enqueue layout one op at a time when a single validation-aware **`batch`** would suffice.
