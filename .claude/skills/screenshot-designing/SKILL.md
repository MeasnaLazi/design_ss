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

Do **not** guess `enqueue-op` operation names or flags; copy exact strings from **web-ui-reference**.

## Repo root

Let **`R`** = the **apps_publisher** repository root (this workspace). Run CLI commands from **`R`** unless a reference says otherwise.

## Single-panel default (non-negotiable)

- **Default:** Work **exactly one** strip column at a time. Declare an active **`panel_index`** (0-based) at the start of each plan → apply cycle. **`enqueue-op` / `batch`** should only mutate layers tied to **that** `panel_index` / `panel_number` unless the exception applies.  
- **Preview:** Prefer **`python toolkit/scripts/designer.py pull-preview --panels <n>`** with a **single** index to validate the active column.  
- **Exception — multi-panel:** You may touch **more than one** `panel_index` in one batch **only** when the design explicitly requires it (e.g. device visually spanning adjacent columns, or user-requested synchronized spacing). Write a **one-line rationale** before issuing those ops.  
- **Carousel order:** Complete panel **0** through § Workflow gates (or finish a declared cross-panel pass + full-strip visual sign-off), then panel **1**, … **Exception:** A one-time whole-strip step (e.g. `set_background`) may run first if already standard; then return to per-panel work.

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
- **Hard constraints** stay as in [checklist.md](checklist.md): no bbox overlap between text layers or between **text vs device**, safe margins / contrast, readable hierarchy. Use **`move_layer`**, **`align`**, **`layer_patch`**, **`set_z_index`** as needed — higher **`z_index`** draws **in front**; choice of stacking is a design decision, not “text always on top.”

## Workflow

1. **Stack ready:** `python toolkit/scripts/designer.py handoff` — if not `ok` / usable `web_ui_status`, follow **tool-running-agent** (see `R/.claude/agents/tool-running-agent.md`); do not edit `web_ui/src/**` unless the user asks (`R/.claude/settings.json` may deny it).  
2. **Session:** `python toolkit/scripts/designer.py session` — note canvas size, `screens`, gap, preset if relevant.  
3. **Declare** active **`panel_index`** (or cross-panel rationale). Read that row’s **Summary for designer** (and **Title** / **Subtitle** / **Description**) from **`screenshot_report.md`**.  
4. **Plan** a numbered list of concrete `enqueue-op` steps informed by **Summary for designer** (move, `layer_patch`, `text_set_*`, `device_*`, `set_z_index`, `batch`, …).  
5. **Apply** via `python toolkit/scripts/designer.py enqueue-op …` (prefer **`batch`** for ordered steps).  
6. **Render preview** when needed: e.g. `enqueue-op` **`render_panel_preview`** for the active column, then **`pull-preview --panels <n>`**.  
7. **Review:** Walk [checklist.md](checklist.md) for the active panel (visual + criteria rows). Use **`layout.py contrast`** and related helpers from **layout-reference** when you need numeric parity checks — there is **no** automated full-layout JSON gate in-repo anymore.

**Previews:** Do not spam `render_panel_preview` without cause.

## Done when

- [checklist.md](checklist.md) satisfied for **every** panel (or documented cross-panel exception + user-approved full-strip sign-off).

## Do not

- Invent `enqueue-op` names not listed in **designer-reference** (see invalid-alias table there).  
- Replace checklist tables with a prose-only summary when the user needs auditability.  
- Edit [checklist.md](checklist.md) on disk during normal runs.
