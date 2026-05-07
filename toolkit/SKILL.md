---
name: publisher-toolkit
description: >-
  Screenshot designer toolkit in apps_publisher: run python toolkit/scripts/layout.py
  and designer.py; layout parity, image helpers, store JSON, session/export checks,
  loopback HTTP to web_ui. Agents MUST read toolkit/references/*.md before invoking
  CLI (tables and enqueue-op allowlists are authoritative). Use when automating
  screenshot-designer, layout QA, predict-checks, or designer handoff/session/export.
---

# Publisher toolkit

## When this skill applies

Use when you are about to run **`python toolkit/scripts/layout.py`** or **`python toolkit/scripts/designer.py`**, benchmark preview scripts, or reason about screenshot-designer **HTTP / enqueue-op** behavior from the repo. If the task is only store listing ASO JSON, prefer the project **aso-store-metadata** skill instead.

## How to use the references (required)

1. **Pick the reference by task type** — do not guess subcommands, flags, or operation names.

   | You need… | Read first |
   | --- | --- |
   | Presets, store JSON paths, device packs, grid/safe-zone/text metrics, offline `align`, `predict-checks`, `contrast`, `preview-budget` | `toolkit/references/layout-reference.md` |
   | `designer.py` handoff/session/execute, preview/export, **`enqueue-op` names and args**, invalid op aliases | `toolkit/references/web-ui-reference.md` |
   | Pillow image helpers under `layout.py image …` (info, resize, crop, colors, preset dimension checks) | `toolkit/references/vision-reference.md` |

2. **Read before you run** — open the relevant reference and copy **exact** CLI strings and JSON shapes from its tables. The references are the source of truth; improvised flags or op names will fail or drift from server behavior.

3. **Follow cross-links inside references** — each file points to the others for overlapping flows (for example: export workflow in layout-reference defers to web-ui-reference; image work defers to vision-reference).

4. **Live canvas vs offline layout** — anything that hits the Vite/Web UI API (`handoff`, `session`, `execute`, `enqueue-op`, `pull-preview`, `pull-export`) is covered in **web-ui-reference**. Pure Python parity and validation without a browser session is mostly **layout-reference**.

5. **Constraints agents often miss**

   - Run commands from the **publisher repo root** unless a reference explicitly says otherwise.
   - Optional **`--compact`** placement matches each reference (`layout.py` vs `designer.py`).
   - For **`enqueue-op`**, use **only** operation names listed in web-ui-reference; use the **Invalid names** table to avoid deprecated aliases (`delete_layer`, `set_bg`, etc.).
   - **`designer.py handoff`**: proceed with live ops only when the reference’s readiness conditions are met (`"ok": true` and acceptable `web_ui_status`); otherwise start `web_ui` / toolchain first.

6. **After `export_json` + `pull-export`** — use the export → `predict-checks --from-export` path in **layout-reference** (save full strip when coordinates matter). Optional **`--require-text-single-panel`** when all marketing text must share one strip column.

## Outcome

Commands and payloads match the reference tables, handoff is verified before mutating the canvas, and quality checks run on the correct JSON shape (`SessionCheckInput` vs export summary per layout-reference).
