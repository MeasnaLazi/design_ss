# Phase: screenshot_planning

**Agent:** [`.claude/agents/screenshot_planning.md`](../../../agents/screenshot_planning.md)

## Purpose

Produce a single **`creative_plan`** object in **`datasource/temp/design_brief.json`** that is detailed enough for **`screenshot_background`** and **`screenshot_panel`** to execute **without further creative questions** (full-auto downstream).

## What to include

### Strip background (`creative_plan.background`)

- Prefer **`preset_number` 1–13** and matching **`preset_name`** from the Background catalog (**`phase-background.md`**). If the user insists on mood-only direction, set **`preset_number`** `null` and spell **`mood_notes`** so Background can still map to a catalog choice deterministically.
- Tie language to **`requirements.store.theme`** (primary, background, text, accent).

### Per panel (`creative_plan.panels`)

- One object per index **`0 … n-1`** where **`n`** matches the agreed screenshot strip (typically **`requirements.target_panel_count`** and **`store.screenshots.length`**).
- **`looks_like`:** concrete visual paragraph (hierarchy, density, device vs copy lead).
- **`layers`:** ordered list. Each layer **`role`** (`title`, `subtitle`, `body`, `device_frame`, `badge`, …), **`content_source`** (e.g. `screenshots[2].title` or literal text), optional **`frame_hint`** / **`notes`**.

## User loop (only creative gate)

1. Draft **`creative_plan`** from **`requirements.store`** + pack context. Merge into the brief; bump **`updatedAt`**; set **`creative_plan.user_approved`: false** until final.
2. Present the plan clearly (background summary + per-panel index headers).
3. Incorporate feedback; revise **`creative_plan`** (optional bump **`version`**).
4. **Mandatory:** Ask for explicit approval, e.g. *Reply **approved** to lock this plan and start the Web UI / execution phases.*
5. On approval tokens (approved, yes, looks good, ship it when clearly final), set **`creative_plan.user_approved`: true`**, merge, bump **`updatedAt`**, stop.

## Merge rules

- **Preserve** **`requirements`**, **`background`**, **`panel`** keys unless the user explicitly asks to reset downstream sections for a fresh run.
- Do **not** set **`requirements.handoff_ok`** / **`web_ui_status`** — Background agent owns those after **`designer handoff`**.

## Checklist

- [ ] **`creative_plan.panels.length`** matches intended panel count for this session.
- [ ] Every **`panels[i].index`** matches **`store.screenshots[i]`** semantics.
- [ ] **`creative_plan.user_approved`** is **`true`** only after explicit user approval.
- [ ] No **`designer.py`** calls from this phase.
