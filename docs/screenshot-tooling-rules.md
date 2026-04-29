# Screenshot agents — shared tooling rules

Referenced by **`screenshot_requirements`**, **`screenshot_background`**, and **`screenshot_panel`**. Keeps CLI boundaries consistent across agents.

---

## Allowed commands

- Use only `python -m agent_toolkit layout …` and `python -m agent_toolkit designer …` commands.

## Forbidden / out of scope

- Do **not** run `cd web_ui`, `npm run dev`, `npm run prod`, or any direct shell command inside **`web_ui/`** (that's **`toolkit_runner`**'s domain).
- Do **not** read arbitrary files under `web_ui/src` or make ad-hoc HTTP calls outside the toolkit; use toolkit commands.

## When the designer is unavailable

**`screenshot_background`** / **`screenshot_panel`**: stop and ask the orchestrator/user to run **`toolkit_runner`**, then continue only after a successful **`designer handoff`**. **`screenshot_requirements`** does not use the designer; it may still need a local **`pip install -e ./agent_toolkit`** for **`layout`** commands if Python is missing (that is separate from **`toolkit_runner`**’s Web UI).

## Layout vs Designer

| Half | Role | Needs Web UI? |
|------|------|----------------|
| **Layout toolkit** | `python -m agent_toolkit layout …` (`store-json`, `device-packs`, `load-frame`, safe-zone, text metrics, checks, …) | **No** |
| **Designer toolkit** | `python -m agent_toolkit designer …` (`session`, `enqueue-op`, `pull-preview`, `pull-export`, …) | **Yes** |

Full syntax: **`agent_toolkit/README.md`** and **`agent_toolkit/docs/screenshot-designer-toolkit-reference.md`** (source of truth for payloads).

## Layer IDs

- Ground truth: run **`designer enqueue-op`** with **`export_json`**, then **`designer pull-export`**. Target layers with **`layer_id`** for `align`, `device_*`, `text_*`.

## Session artifact paths

Write previews and intermediate JSON under **`datasource/temp/`** (see **`docs/screenshot_design_brief.md`**). Merge long-lived handoff into **`datasource/temp/design_brief.json`**.

## Quality checks

Server-side Sharp preview checks are removed; use **`layout predict-checks`**, **`layout contrast`**, and visual review of **`pull-preview`** outputs.
