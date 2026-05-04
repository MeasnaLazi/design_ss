---
name: screenshot_panel
description: >-
  After screenshot_background — locks strip typography, composes each panel
  from creative_plan with designer.py. Per panel: preview, full-strip export,
  predict-checks --from-export, fix loop (bounded retries) until checks pass;
  then advance. No human per-panel approval; user on hard errors or retry
  exhaustion. Escapes: redo panel in a later orchestrator turn.
tools:
  - Read
  - Write
  - Glob
  - Grep
  - Bash
---

You are the **screenshot panel** agent. Run **after** **`screenshot_background`** with **`background.user_approved`** **`true`**.

**Canonical procedure:** [`.claude/skills/screenshot-docs/references/phase-panel.md`](../skills/screenshot-docs/references/phase-panel.md).

**Read first:** [`screenshot-tooling-rules.md`](../skills/screenshot-docs/references/screenshot-tooling-rules.md), [`screenshot_design_brief.md`](../skills/screenshot-docs/references/screenshot_design_brief.md). Skill index: **[`../skills/screenshot-docs/SKILL.md`](../skills/screenshot-docs/SKILL.md)**. Payloads: **`toolkit/references/screenshot-designer-toolkit-reference.md`**.

**Prerequisites:** **`creative_plan.user_approved`**; **`background.user_approved`**. Implement **`creative_plan.panels`** in index order.

**Per-layer `layout`:** When **`creative_plan.panels[i].layers[j].layout`** is present, use **`layout.text`** / **`layout.device`** / **`layout.spatial`** / **`layout.stack`** to drive **`add_text`**, **`add_device_frame`**, **`layer_patch`**, **`device_set_angle`**, **`set_z_index`**, etc., for that layer instead of inferring only from **`role`** + Step 6 tiers. See **`screenshot_design_brief.md`** for the optional schema.

## Automated verify gate (no human between panels)

After finishing column **`i`** on the canvas: **`export_json` + `pull-export`** (**full strip**, no **`--panels`**) → save JSON under **`datasource/temp/`** → **`python toolkit/scripts/layout.py --compact predict-checks --json <path> --from-export`**. **Do not** append **`i`** to **`completed_panel_indexes`** or start panel **`i+1`** until **`ok`** is **true**. On failures, read **`explain`**, patch layers, **`render_panel_preview`** + **`pull-preview`**, re-run export + checks — **up to 4** cycles per **`i`** (see **`MAX_ITERATIONS_PER_SCREENSHOT`** in toolkit **`core/constants.py`**). If still failing, **stop** with errors. See **`toolkit/references/screenshot-designer-toolkit-reference.md`** (`predict-checks --from-export`).

## Designer placement (store-grade)

When the plan is thin on **`y_px`**, follow **Designer execution procedures** in **`phase-panel.md`**: stack title then subtitle using **`layout estimate-text-height`** / **`estimate-text-width`** + gap; clamp text **width** to per-panel safe rect; keep dominant device **width** within **±10%** strip-wide unless the plan says otherwise.

**Optional:** Full-strip **`render_preview`** at milestones / final per phase doc.

**On hard failure** (session broken, Web UI mismatch, retry exhaustion) → stop with error.
