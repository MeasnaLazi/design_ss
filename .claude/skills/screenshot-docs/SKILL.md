---
name: screenshot-docs
description: >-
  Multi-agent screenshot workflow for apps_publisher — design_brief.json schema
  (requirements, creative_plan, background, panel), agent sequence (requirements
  → planning → toolkit_runner → background → panel), phase reference docs, and
  layout vs designer boundaries. Use when coordinating screenshot_requirements,
  screenshot_planning, screenshot_background, screenshot_panel, or
  toolkit_runner; when merging the brief; or when the user asks about screenshot
  agents or design_brief.json.
---

# Screenshot workflow docs (skill)

Canonical reference files live in **`references/`** next to this file. **Read them** when doing screenshot work in this repo.

## When to load

- Before or during **screenshot_requirements**, **screenshot_planning**, **screenshot_background**, **screenshot_panel**
- When editing **`datasource/temp/design_brief.json`**
- When the user asks how agents hand off or what fields the brief contains

## Reference files (read in this order when onboarding)

| File | Contents |
|------|----------|
| [`references/screenshot-agents-overview.md`](references/screenshot-agents-overview.md) | Flow diagram, agent order, **`designer handoff`** ownership |
| [`references/screenshot-tooling-rules.md`](references/screenshot-tooling-rules.md) | Allowed `layout.py` / `designer.py` commands; forbidden `web_ui/` bash |
| [`references/screenshot_design_brief.md`](references/screenshot_design_brief.md) | **`requirements`**, **`creative_plan`**, **`background`**, **`panel`** |
| [`references/phase-requirements.md`](references/phase-requirements.md) | Requirements-phase steps and merges |
| [`references/phase-planning.md`](references/phase-planning.md) | Creative plan structure and approval gate |
| [`references/phase-background.md`](references/phase-background.md) | Preset catalog, theme math, auto background apply |
| [`references/phase-panel.md`](references/phase-panel.md) | Typography lock, panel-local coords, auto panel build |

Related: **[`CLAUDE.md`](../../../CLAUDE.md)**, **[`.claude/workflows/mobile-publisher-workflow.md`](../workflows/mobile-publisher-workflow.md)**, **[`.claude/agents/`](../../agents/)**, **`toolkit/SKILL.md`**, **`toolkit/references/screenshot-designer-toolkit-reference.md`**, **`.claude/skills/publisher-toolchain/`**, **`.claude/skills/aso-store-metadata/`**.
