# Designer toolkit reference

Commands run as **`python toolkit/scripts/designer.py <subcommand> …`** from the publisher repo root. They call the **web_ui** screenshot-designer HTTP API on **loopback** only (`localhost`, `127.0.0.1`, `::1`).

**Offline layout** (presets, store JSON, `layout image`, contrast): **`layout-reference.md`**.

**HTTP route contracts** (enqueue SSE, agent-preview storage): **`web_ui/TOOLKIT.md`**.

## Setup

| Item | Detail |
| --- | --- |
| **Dev server** | In `web_ui/`: `npm run dev` (default `http://localhost:4713`). |
| **API base** | `DESIGNER_API_BASE` in `toolkit/.env`, or default `http://localhost:4713/__api/screenshot-designer`. |
| **Python path** | `export PYTHONPATH=toolkit/scripts` when running outside a configured environment. |
| **Live tab** | An open designer tab must subscribe on the matching display **slug** for **`enqueue-op`**; otherwise enqueue returns **`no_subscribers`**. |

Optional global flag on the parent CLI: **`--compact`** (one-line JSON where the subcommand prints JSON).

## Readiness

| CLI | Summary |
| --- | --- |
| `python toolkit/scripts/designer.py handoff` | Resolve `web_ui_url` and `designer_api_base`; optional GET **`/session`** probe (`web_ui_status`: `ready` or `unverified`). |
| `python toolkit/scripts/designer.py session` | GET **`/session`** — canvas width/height, `presetId`, `displayFile`, optional `savedAt`. |


## `enqueue-op` (all client-authoritative ops)

| CLI | Arg | Summary |
| --- | --- | --- |
| `python toolkit/scripts/designer.py enqueue-op` | Required **`--operation <name>`**. **`--args-json`** JSON object (default `{}`), or **`@path.json`**. Optional **`--request-id`**, **`--timeout`** (default 120s). | POST **`/enqueue-command`**; operation runs in the open Web UI tab via SSE. |

Operation names and per-op args match **`web_ui/TOOLKIT.md`** (e.g. `add_text`, `move_layer`, `layer_patch`, `batch`). Use only documented names; do not use deprecated aliases such as `delete_layer` or `set_bg`.


## Panel preview (enqueue + pull)

Cross-panel PNG crops use two steps: enqueue **`render_panel_preview`** in the browser, then **`pull-preview`** fetches the last stored PNG.

1. **`enqueue-op`** — POST **`/enqueue-command`**. Response is JSON ack (`ok`, `slug`, `operation`, `requestId`), not image bytes.
2. **Browser** — SSE delivers the op; Fabric crops the strip and POSTs PNG to **`/agent-preview`**.
3. **`pull-preview`** — GET **`/agent-preview`**; with **`--out`**, writes the PNG and prints JSON metadata on stdout.

### Example: column 0 at multiplier 1

```bash
python3 toolkit/scripts/designer.py enqueue-op \
  --operation render_panel_preview \
  --args-json '{"panel_indexes":[0],"preview_multiplier":1}'

python3 toolkit/scripts/designer.py pull-preview --out ../output/temp/preview.png
```

With **`--out`**, stdout is JSON: `{"ok": true, "bytes": <n>, "path": "<path>"}`. Omit **`--out`** to stream raw PNG bytes to stdout.

### `render_panel_preview` args (`--args-json`)

| Field | Required | Summary |
| --- | --- | --- |
| **`panel_indexes`** | One of column selectors | 0-based strip columns forming one **contiguous** segment (e.g. `[0]`, `[0,1]`, `[2,3,4]`). |
| **`panel_index`** | Alternative | Single column, 0-based. |
| **`panel_number`** | Alternative | Single column, 1-based. |
| **`preview_multiplier`** | No | `1` (faster) or `2` (sharper). Omit to use web_ui `VITE_AGENT_PREVIEW_MULTIPLIER` (default **2**). |

Toolkit validates **`preview_multiplier`** before enqueue (`designer/enqueue_validate.py`).

## `pull-preview`

| CLI | Arg | Summary |
| --- | --- | --- |
| `python toolkit/scripts/designer.py pull-preview` | Optional **`--out <path>`** — write PNG and print JSON metadata. Optional **`--timeout`** (default 60s). | GET **`/agent-preview`**. **404** / **`no_preview_yet`** if nothing has been uploaded yet. |

Does **not** enqueue **`render_panel_preview`** or poll for a new crop; run **`enqueue-op`** first when the stored preview is missing or stale.
