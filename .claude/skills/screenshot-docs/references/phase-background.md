# Phase: screenshot_background

**Agent:** [`.claude/agents/screenshot_background.md`](../../../agents/screenshot_background.md)

**Designer command form** (publisher root): `python toolkit/scripts/designer.py [--compact] <subcommand> …` — **`--compact`** immediately after **`designer.py`**. **`toolkit/SKILL.md`** and **`toolkit/references/screenshot-designer-toolkit-reference.md`**.

Persist preview PNGs under **`datasource/temp/`** (e.g. `strip_review_<timestamp>.png`) when **`pull-preview`** yields files you save.

---

## Prerequisites

- **`requirements`** populated (platform, pack, store, theme).
- **`creative_plan.user_approved`** is **`true`**. If missing/false → stop; return to **`screenshot_planning`**.
- **`toolkit_runner`** has brought Web UI up; if **`designer handoff`** fails, stop and ask orchestrator to run **`toolkit_runner`**, then retry handoff.

---

## Designer handoff (first action)

Run **`python toolkit/scripts/designer.py handoff`** from publisher root. Require **`"ok": true`** and **`web_ui_status`** ∈ `ready` | `started` | `already_running`. Merge **`requirements.handoff_ok`**: `true`, **`requirements.web_ui_status`**: value from handoff; bump **`updatedAt`**.

---

## Preset selection (plan-driven auto)

When **`creative_plan.background.preset_number`** / **`preset_name`** are set, **use them** — do **not** ask the user to pick a preset again. If only **`mood_notes`** exist, map deterministically to the closest catalog preset and record **`preset_number`** / **`preset_name`** in **`background`**.

**Contrast:** Light presets (**Golden Hour**, **Arctic Ice**) may need **`layout contrast`** / **`layout predict-checks`**; text color tweaks via Panel **`text_set_color`** only if needed.

---

### Theme tint math (same `store.theme` for the whole strip)

**Valid hex:** `#` + six `0-9a-fA-F`.

**Resolve anchors** (fallback if missing/invalid):

| Symbol | Source | Fallback |
|--------|--------|----------|
| **P** | `store.theme.primary_color` | `#6366f1` |
| **Bg** | `store.theme.background_color` | `#0f172a` |
| **Ac** | `store.theme.accent_color` | **P** |
| **Tx** | `store.theme.text_color` | `#e2e8f0` |

**Parse** `#RRGGBB` → R,G,B ∈ [0,255].

- **`blend(C1,C2,t)`** — weight **t** on **C1**; per-channel `round`; clamp to `#rrggbb`.
- **`darken(C,s)`** — **`blend(#000000, C, s)`** (larger **s** = darker).
- **`lighten(C,s)`** — **`blend(#ffffff, C, s)`** (larger **s** = brighter).

Every stop emits **computed** `#RRGGBB` (no alpha).

---

### Catalog — preset → `angleDeg` + recipe

| # | Name | `angleDeg` | Stop recipe |
|---:|------|---:|-------------|
| 1 | Slate Depth | 145 | `0: darken(Bg,0.52)` · `0.5: blend(P, Bg, 0.22)` · `1: blend(P, Tx, 0.38)` |
| 2 | Aurora | 125 | `0: darken(P, 0.74)` · `0.45: blend(P, Bg, 0.12)` · `1: lighten(blend(P, Ac, 0.55), 0.20)` |
| 3 | Sunset | 35 | `0: darken(P, 0.80)` · `0.4: blend(P, Ac, 0.48)` · `1: lighten(Ac, 0.26)` |
| 4 | Midnight Ink | 165 | `0: darken(Bg, 0.58)` · `0.55: darken(P, 0.48)` · `1: blend(P, Bg, 0.28)` |
| 5 | Ocean Drift | 180 | `0: darken(blend(P, Bg, 0.42), 0.38)` · `0.5: blend(P, Bg, 0.18)` · `1: lighten(P, 0.24)` |
| 6 | Forest Canopy | 95 | `0: darken(Bg, 0.48)` · `0.45: darken(P, 0.32)` · `1: lighten(P, 0.22)` |
| 7 | Rose Quartz | 155 | `0: darken(P, 0.68)` · `0.5: P` · `1: lighten(blend(P, Ac, 0.52), 0.28)` |
| 8 | Lavender Mist | 135 | `0: darken(P, 0.72)` · `0.5: blend(P, Bg, 0.18)` · `1: lighten(P, 0.30)` |
| 9 | Ember Glow | 40 | `0: darken(P, 0.76)` · `0.45: P` · `1: lighten(Ac, 0.22)` |
| 10 | Golden Hour | 25 | `0: lighten(Bg, 0.12)` · `0.5: blend(Bg, P, 0.32)` · `1: darken(P, 0.12)` |
| 11 | Arctic Ice | 200 | `0: lighten(Bg, 0.28)` · `0.55: blend(Bg, P, 0.40)` · `1: darken(P, 0.08)` |
| 12 | Charcoal Steel | 90 | `0: darken(Bg, 0.40)` · `0.5: blend(P, Bg, 0.14)` · `1: blend(P, Tx, 0.26)` |
| 13 | Solid (theme base) | — | **`{"type":"color","value":"<hex>"}`** with **`<hex>` = `Bg`** (valid hex) else `#1a1a1a` |

Gradient JSON shape:

```json
{"type":"gradient","value":{"angleDeg":125,"stops":[{"offset":0,"color":"#..."},{"offset":0.45,"color":"#..."},{"offset":1,"color":"#..."}]}}
```

---

## Apply (**designer session** + **`enqueue-op`**) — auto

1. **`designer session`** if needed to align with Web UI.
2. **`set_background`** with computed payload from **`creative_plan`** + theme.
3. **`render_preview`** + **`pull-preview`** for **full strip**; save PNG under **`datasource/temp/`**.
4. **Do not** wait for user approval. On success: set **`background.user_approved`**: **`true`**, **`background.applied_from_plan`**: **`true`**, persist **`set_background_payload`**, **`preset_number`**, **`preset_name`**, **`background_type`**, bump **`updatedAt`**.

On **failure** (API error, missing session, bad payload): stop with actionable error — user intervenes.

---

## Handoff

Report strip preview path(s). Orchestrator delegates **`screenshot_panel`** next.

---

## Background-phase checklist

- [ ] **`creative_plan.user_approved`** was **`true`** before handoff.
- [ ] **`set_background_payload`** recorded; **`user_approved`** + **`applied_from_plan`** set after successful apply.
- [ ] **`updatedAt`** bumped.
