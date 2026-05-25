# Toolkit

Python CLI helpers for automating **screenshot-designer** in the **apps_publisher** repo: offline layout and image work, loopback HTTP to the live canvas, and rule-based validation of preview PNGs.

## Purpose

This toolkit gives agents and scripts a **stable, documented interface** for App Store / Play Store screenshot workflows without ad-hoc Python or guessing API shapes.

| Area | Role |
| --- | --- |
| **Layout** (`layout.py`) | Preset catalog, store listing JSON, device packs, WCAG contrast, theme color math, Pillow image QA — all **offline** (no browser tab required). |
| **Designer** (`designer.py`) | Handoff, session, **`enqueue-op`** (canvas mutations via SSE), preview pull, **`validate-rules`** / **`validate-strip-rules`** — requires a **running** `web_ui` dev server and an open designer tab. |

It is meant to run from the **publisher repo root** (the directory that contains `web_ui/public/device-frames`). Authoritative command tables live under [`references/`](references/).

## How it works

### Two entry points, one implementation

Both scripts dispatch into the same CLI (`scripts/cli/main.py`):

```bash
python toolkit/scripts/layout.py <subcommand> …
python toolkit/scripts/designer.py <subcommand> …
```

Optional **`--compact`** prints one-line JSON where a subcommand returns JSON.

### Layout (offline)

`layout.py` reads repo assets and runs pure Python helpers:

- **Presets & store** — `list-presets`, `store-json` (`output/appstore.json` / `output/playstore.json`).
- **Devices** — `device-packs`, `load-frame` from `web_ui/public/device-frames/`.
- **Color** — `color mix`, `color toward` for gradient stops (used with designer `set_background`).
- **Image** — `image info`, `from-base64`, `match-preset`, `region-hex`, `dominant` (Pillow).
- **Contrast** — WCAG ratio between two hex colors.

See [`references/layout-reference.md`](references/layout-reference.md).

### Designer (live canvas)

`designer.py` talks to the screenshot-designer HTTP API on **loopback only** (`localhost`, `127.0.0.1`, `::1`):

1. **`handoff`** / **`session`** — confirm API base URL and canvas state.
2. **`enqueue-op`** — POST an operation; the **open Web UI tab** runs it over SSE (tab must be subscribed on the correct display slug).
3. **`pull-preview`** / **`pull-preview-data`** — fetch the last PNG or slim panel JSON pushed from the browser after ops like `render_panel_preview` / `capture_panel_preview_data`.
4. **`validate-rules`** / **`validate-strip-rules`** — non-vision checks on preview PNG + panel JSON; exit code `0` only when all checks pass.

Typical per-panel gate (do not advance to the next panel until rules pass):

```text
enqueue-op (render_panel_preview) → pull-preview --out → validate-rules (exit 0) → vision review → next panel
```

After the last panel: **`validate-strip-rules`**, then user strip review.

See [`references/designer-reference.md`](references/designer-reference.md) and [`references/design-validate.md`](references/design-validate.md).

### Agents

Cursor agents can load [`SKILL.md`](SKILL.md) (`toolkit`) so they read the reference docs before running CLI commands. **Do not** use `python -c` or one-off scripts for toolkit work — use the documented subcommands only.

## Setup requirements

### Prerequisites

| Requirement | Notes |
| --- | --- |
| **Python** | 3.10+ recommended (project tested with 3.13). |
| **Publisher repo** | Clone `apps_publisher`; commands assume cwd is repo root (or a parent that contains `web_ui/public/device-frames`). |
| **Live designer** (designer commands only) | In `web_ui/`: `npm install` then `npm run dev` (default `http://localhost:4713`). Open the screenshot-designer tab for the target display slug before **`enqueue-op`**. |

### Python environment

From the repo root:

```bash
cd toolkit
python3 -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

Dependencies: `pydantic`, `pillow`, `python-dotenv`, `pytest` (see [`requirements.txt`](requirements.txt)).

### Environment variables

Copy the example env file and adjust if the dev server port or API path differs:

```bash
cp toolkit/.env.example toolkit/.env
```

| Variable | Default | Purpose |
| --- | --- | --- |
| `DESIGNER_API_BASE` | `http://localhost:4713/__api/screenshot-designer` | Loopback base URL for `designer.py` HTTP calls |

### `PYTHONPATH`

When running CLI outside a preconfigured IDE task, set:

```bash
export PYTHONPATH=toolkit/scripts
```

(`pytest` already adds `scripts` via [`pytest.ini`](pytest.ini).)

### Verify install

```bash
# From publisher repo root, with venv active and PYTHONPATH set
python toolkit/scripts/layout.py list-presets
python toolkit/scripts/designer.py handoff

# Unit tests
cd toolkit && pytest
```

### Reference docs (required for automation)

| Doc | Use when |
| --- | --- |
| [`references/layout-reference.md`](references/layout-reference.md) | Presets, store JSON, devices, color, image, contrast |
| [`references/designer-reference.md`](references/designer-reference.md) | Handoff, session, `enqueue-op` allowlist, previews |
| [`references/design-validate.md`](references/design-validate.md) | `validate-rules`, profiles, hybrid rules → vision workflow |
