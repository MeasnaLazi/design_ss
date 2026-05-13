---
name: publisher-toolkit
description: >-
  Screenshot designer toolkit in apps_publisher: run python toolkit/scripts/layout.py
  and designer.py; layout parity, image helpers, store JSON,
  loopback HTTP to web_ui. Agents MUST read toolkit/references/*.md before invoking
  CLI (tables and enqueue-op allowlists are authoritative). Use when automating
  screenshot-designer, layout parity, or designer handoff/session.
---

# Publisher toolkit

## When this skill applies

Use when you are about to run **`python toolkit/scripts/layout.py`** or **`python toolkit/scripts/designer.py`**, or reason about screenshot-designer **HTTP / enqueue-op** behavior from the repo. If the task is only store listing ASO JSON, prefer the project **aso-store-metadata** skill instead.

## How to use the references (required)

1. **Pick the reference by task type** — do not guess subcommands, flags, or operation names.

   | You need… | Read first |
   | --- | --- |
   | Presets, store JSON paths, device packs, `contrast`, **`layout image`** (CLI tables + image QA conventions) | `toolkit/references/layout-reference.md` |
   | `designer.py` handoff/session/preview, **`enqueue-op` names and args**, invalid op aliases | `toolkit/references/designer-reference.md` |

2. **Read before you run** — open the relevant reference and copy **exact** CLI strings and JSON shapes from its tables. The references are the source of truth; improvised flags or op names will fail or drift from server behavior.

3. **Follow cross-links inside references** — each file points to the others for overlapping flows (for example: presets, **`layout image`** CLI tables and image QA notes live in **layout-reference**; live canvas work is **designer-reference**).

4. **Live canvas vs offline layout** — anything that hits the Vite/Web UI API (`handoff`, `session`, `enqueue-op`, `pull-preview`, `pull-preview-data`) is covered in **designer-reference**. Pure Python parity without a browser session is mostly **layout-reference**.

5. **Constraints agents often miss**

   - Run commands from the **publisher repo root** unless a reference explicitly says otherwise.
   - Optional **`--compact`** placement matches each reference (`layout.py` vs `designer.py`).
   - For **`enqueue-op`**, use **only** operation names listed in designer-reference / **`web_ui/TOOLKIT.md`**; avoid deprecated aliases (`delete_layer`, `set_bg`, etc.).
   - **`designer.py handoff`**: proceed with live ops only when the reference’s readiness conditions are met (`"ok": true` and acceptable `web_ui_status`); otherwise start `web_ui` / toolchain first.

6. **Cross-panel previews** — use **`render_panel_preview`** then **`pull-preview`** per **designer-reference** when you need PNG crops of strip columns. Use **`capture_panel_preview_data`** then **`pull-preview-data`** when you need **`layer_id`** and panel-local layout fields for the next **`enqueue-op`**; keep PNG for visual or copy checks.

## Outcome

Commands and payloads match the reference tables, and handoff is verified before mutating the canvas when the reference requires it.
