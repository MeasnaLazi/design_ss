---
name: screenshot-designing
disable-model-invocation: true
description: >-
  Senior store screenshot UI workflow for apps_publisher: read output/screenshot_report.md,
  drive designer.py / enqueue-op in one panel at a time by default, pull-preview and
  pull-export, run layout.py predict-checks --from-export. Use when acting as
  screenshot-designer-agent or when the user names this skill.
---

# Screenshot designing

## When this applies

Use **whenever** you act as **screenshot-designer-agent** or the user asks you to load this skill. It governs **single-panel-first** iteration, toolkit usage, and acceptance checks.

## Required reading (order)

1. **This skill** — especially **§ Single-panel default** and **§ Workflow** below.  
2. **Publisher toolkit** — [`toolkit/SKILL.md`](../../../toolkit/SKILL.md), then open the references it points to before running commands:  
   - Live canvas / `enqueue-op` allowlist: [`toolkit/references/web-ui-reference.md`](../../../toolkit/references/web-ui-reference.md)  
   - `predict-checks`, presets, safe zone, preview budget: [`toolkit/references/layout-reference.md`](../../../toolkit/references/layout-reference.md)
   - View screenshot image, standard enough? professional enough? attractive enough?: [`toolkit/references/vision-reference.md`](../../../toolkit/references/vision-reference.md)

Do **not** guess `enqueue-op` operation names or flags; copy exact strings from **web-ui-reference**.

## Repo root

Let **`R`** = the **apps_publisher** repository root (this workspace). Run CLI commands from **`R`** unless a reference says otherwise.

## Single-panel default (non-negotiable)

- **Default:** Work **exactly one** strip column at a time. Declare an active **`panel_index`** (0-based) at the start of each plan → apply cycle. **`enqueue-op` / `batch`** should only mutate layers tied to **that** `panel_index` / `panel_number` unless the exception applies.  
- **Preview:** Prefer **`python toolkit/scripts/designer.py pull-preview --panels <n>`** with a **single** index to validate the active column.  
- **Export:** Save **full-strip** JSON from **`pull-export`** (no `--panels` slice) for **`predict-checks --from-export`** so layer coordinates stay in strip space.  
- **Exception — multi-panel:** You may touch **more than one** `panel_index` in one batch **only** when the design explicitly requires it (e.g. device visually spanning adjacent columns, or user-requested synchronized spacing). Write a **one-line rationale** before issuing those ops.  
- **Carousel order:** Complete panel **0** through § Workflow gates (or finish a declared cross-panel pass + full-strip sign-off), then panel **1**, … **Exception:** A one-time whole-strip step (e.g. `set_background`) may run first if already standard; then return to per-panel work.

## Inputs

| Source | Use |
| --- | --- |
| `R/output/screenshot_report.md` | Messaging, panel order, designer “why” — **always** read for the task. |
| `R/output/appstore.json` / `R/output/playstore.json` | Theme / copy when needed; **same file** as the report’s store (do not mix App Store theme with Play panels). |

Do **not** overwrite `output/screenshot_report.md` unless the user explicitly asks.

## Workflow

1. **Stack ready:** `python toolkit/scripts/designer.py handoff` — if not `ok` / usable `web_ui_status`, follow **tool-running-agent** (see `R/.claude/agents/tool-running-agent.md`); do not edit `web_ui/src/**` unless the user asks (`R/.claude/settings.json` may deny it).  
2. **Session:** `python toolkit/scripts/designer.py session` — note canvas size, `screens`, gap, preset if relevant.  
3. **Declare** active **`panel_index`** (or cross-panel rationale).  
4. **Plan** a numbered list of concrete `enqueue-op` steps (move, `layer_patch`, `text_set_*`, `device_*`, `set_z_index`, `batch`, …).  
5. **Apply** via `python toolkit/scripts/designer.py enqueue-op …` (prefer **`batch`** for ordered steps).  
6. **Render preview** when needed: e.g. `enqueue-op` **`render_panel_preview`** for the active column, then **`pull-preview --panels <n>`**.  
7. **Export:** `enqueue-op export_json`, then **`pull-export`** → save JSON to a temp path under `R/` (e.g. `output/` or `datasource/temp/`).  
8. **Quality:** From **`R`**:  
   `python toolkit/scripts/layout.py predict-checks --json <export.json> --from-export`  
   For multi-panel strips where **all** marketing text must sit in **one** column: add **`--require-text-single-panel`**.  
9. **Checklist:** Walk [checklist.md](checklist.md) **§0–§4** for the active panel (and §1 global `ok`).  
10. On failure: go to step 4 for the same panel (or adjust cross-panel plan). On success: next **`panel_index`** until all panels done and **`predict-checks`** `ok` on the latest full export.

**Preview budget:** Respect render limits documented in **layout-reference** (`preview-budget`, `MAX_ITERATIONS_PER_SCREENSHOT` in toolkit constants). Do not spam `render_panel_preview` without cause.

## Done when

- Latest full-strip export passes **`predict-checks --from-export`** with **`ok: true`** (use **`--require-text-single-panel`** when that rule applies).  
- [checklist.md](checklist.md) satisfied for **every** panel (or documented cross-panel exception + full-strip visual approval from the user).

## Do not

- Invent `enqueue-op` names not listed in **web-ui-reference** (see invalid-alias table there).  
- Replace checklist tables with a prose-only summary when the user needs auditability.  
- Edit [checklist.md](checklist.md) on disk during normal runs.
