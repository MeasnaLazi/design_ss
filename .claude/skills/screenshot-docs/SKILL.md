---
name: screenshot-docs
description: >-
  Guides the multi-agent screenshot workflow for apps_publisher — handoff JSON
  schema (`datasource/temp/design_brief.json`), agent sequence
  (requirements → toolkit_runner → background → panel), and boundaries between
  layout scripts and the designer API. Use when coordinating
  screenshot_requirements, screenshot_background, screenshot_panel, or
  toolkit_runner; when merging or validating the design brief; or when the user
  asks about screenshot agents, design_brief.json, or publisher screenshot docs.
---

# Screenshot workflow docs (skill)

Canonical reference files live in **`references/`** next to this file (same skill folder). **Read them** when doing screenshot work in this repo.

## When to load

- Before or during **screenshot_requirements**, **screenshot_background**, **screenshot_panel**
- When editing **`datasource/temp/design_brief.json`**
- When the user asks how agents hand off or what fields the brief contains

## Reference files (read in this order when onboarding)

| File | Contents |
|------|----------|
| [`references/screenshot-agents-overview.md`](references/screenshot-agents-overview.md) | Flow diagram, **`toolkit_runner`** placement, **`designer handoff`** ownership |
| [`references/screenshot-tooling-rules.md`](references/screenshot-tooling-rules.md) | Allowed `layout.py` / `designer.py` commands; forbidden `web_ui/` bash |
| [`references/screenshot_design_brief.md`](references/screenshot_design_brief.md) | **`requirements`** / **`background`** / **`panel`** field definitions |

Related (outside this skill): **[`CLAUDE.md`](../../../CLAUDE.md)** orchestrator, **[`.claude/agents/`](../../agents/)** sub-agent prompts, **`toolkit/SKILL.md`**, **`toolkit/references/screenshot-designer-toolkit-reference.md`**.
