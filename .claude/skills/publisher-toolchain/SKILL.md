---
name: publisher-toolchain
description: >-
  apps_publisher local environment — Python 3.11+, pip install for toolkit/
  requirements.txt, layout.py smoke check, Node per web_ui/.nvmrc, web_ui npm
  install, Vite dev server on port 4713, designer.py handoff/session checks.
  Use before screenshot_background or screenshot_panel, or when debugging
  toolkit_runner / Web UI startup.
---

# Publisher toolchain (skill)

Read **`references/toolchain-setup.md`** for prerequisites, bash commands, server checks, and reporting format.

**Do not** use **`curl`** for designer HTTP traffic from scripts — use **`python toolkit/scripts/designer.py`** (see **[`toolkit/SKILL.md`](../../../toolkit/SKILL.md)** and **`toolkit/references/screenshot-designer-toolkit-reference.md`**).

**Agent that executes these steps:** **[`.claude/agents/toolkit_runner.md`](../../agents/toolkit_runner.md)**.
