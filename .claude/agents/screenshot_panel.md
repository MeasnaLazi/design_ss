---
name: screenshot_panel
description: >-
  After screenshot_background — locks strip typography, composes each panel
  from creative_plan (layers + looks_like) with designer.py + layout checks.
  Full auto: no per-panel proceed gates; user only on errors. Escapes: redo
  panel in a later orchestrator turn.
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

**Automation:** Lock typography (**Step 6** in phase doc), then build each panel; **`render_panel_preview` + pull-preview`** per panel; save previews under **`datasource/temp/`**; update **`completed_panel_indexes`** and **`current_panel_index`**; bump **`updatedAt`**. **No** “proceed to next panel?” prompts. **On failure** → stop with error.

**Optional:** Full-strip **`render_preview`** at milestones / final per phase doc.
