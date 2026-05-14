---
name: publisher-toolkit
description: >-
  Screenshot designer toolkit in apps_publisher: run python toolkit/scripts/layout.py
  and designer.py; layout parity, image helpers, store JSON, loopback HTTP to the
  local screenshot-designer API. Agents MUST read toolkit/references/designer-reference.md,
  toolkit/references/layout-reference.md, and toolkit/references/design-validate.md before
  invoking CLI (tables, enqueue-op allowlists, and validate-rules workflow are authoritative).
  Use when automating screenshot-designer, layout parity, designer handoff/session, or
  hybrid rules-then-vision validation.
---

# Publisher toolkit

## Reference docs (required)

Authoritative CLI and contracts live only in:

- **`toolkit/references/designer-reference.md`** — live canvas: `designer.py` handoff, session, **`enqueue-op`**, previews, setup/readiness.
- **`toolkit/references/layout-reference.md`** — presets, store JSON, device packs, `contrast`, **`layout image`**, offline helpers.
- **`toolkit/references/design-validate.md`** — **`validate-rules`** (non-vision checks on preview PNG + panel JSON) and **rules → vision → next panel / user review** workflow.

## When this skill applies

Use when you are about to run **`python toolkit/scripts/layout.py`** or **`python toolkit/scripts/designer.py`**, or reason about screenshot-designer **HTTP / enqueue-op** behavior from the repo. If the task is only store listing ASO JSON, prefer the project **aso-store-metadata** skill instead.

## How to use the references (required)

1. **Pick the reference by task type** — do not guess subcommands, flags, or operation names.

   | You need… | Read first |
   | --- | --- |
   | Presets, store JSON paths, device packs, `contrast`, **`layout image`** (CLI tables + image QA conventions) | **`toolkit/references/layout-reference.md`** |
   | `designer.py` handoff/session/preview, **`enqueue-op` names and args**, invalid op aliases | **`toolkit/references/designer-reference.md`** |
   | **`validate-rules`**, hybrid rules-then-vision workflow, check IDs / thresholds | **`toolkit/references/design-validate.md`** |

2. **Read before you run** — open the relevant reference and copy **exact** CLI strings and JSON shapes from its tables. The references are the source of truth; improvised flags or op names will fail or drift from server behavior.

3. **Follow cross-links inside references** — each file points to the others for overlapping flows (for example: presets, **`layout image`** CLI tables and image QA notes live in **layout-reference**; live canvas work is **designer-reference**; **design-validate** covers **`validate-rules`** after previews).

4. **Live canvas vs offline layout** — anything that uses the running designer session (`handoff`, `session`, `enqueue-op`, `pull-preview`, `pull-preview-data`) is covered in **`toolkit/references/designer-reference.md`**. Pure Python work without that session is mostly **`toolkit/references/layout-reference.md`**. Post-preview **rules and vision gates** are in **`toolkit/references/design-validate.md`**.

5. **Constraints agents often miss**

   - Run commands from the **publisher repo root** unless a reference explicitly says otherwise.
   - Optional **`--compact`** placement matches each reference (`layout.py` vs `designer.py`).
   - For **`enqueue-op`**, use **only** operation names and args documented in **`toolkit/references/designer-reference.md`** (and its tables); avoid deprecated aliases called out there (e.g. `delete_layer`, `set_bg`).
   - **`designer.py handoff` / session:** follow **Setup** and **Readiness** in **`toolkit/references/designer-reference.md`** before live **`enqueue-op`** (API reachability, dev server, designer tab subscribed on the correct display slug). If the reference’s conditions are not met, finish setup there or use a repo skill/agent whose role is bringing up the local dev stack—do not improvise URLs or operation names.

6. **Cross-panel previews and validation** — use **`render_panel_preview`** then **`pull-preview`** per **`toolkit/references/designer-reference.md`** when you need PNG crops of strip columns. Use **`capture_panel_preview_data`** then **`pull-preview-data`** when you need **`layer_id`** and panel-local layout fields for the next **`enqueue-op`**. After writing **`--out`** paths, run **`python toolkit/scripts/designer.py validate-rules`** (see **`toolkit/references/design-validate.md`**) before any multimodal vision step: if it exits **`1`**, fix with **`enqueue-op`** and re-preview; only when it exits **`0`** should you attach the PNG for vision. On vision **`pass`**, advance to the next **`panel_index`** or, on the **last** panel, **ask the user** to review the full design; on vision **`fail`**, fix **`enqueue-op`** and repeat **validate-rules then vision** for the same panel.

## Outcome

Commands and payloads match the reference tables, and handoff is verified before mutating the canvas when the reference requires it.
