# web_ui — Screenshot / display designer

Browser-based editor for Store–style screenshot layouts. It runs as a **Vite + React** app with a **Fabric.js** canvas, persists designs under the repo **`datasource/`** folder (dev server only), and exposes a **loopback HTTP API** for the Python **toolkit** and agents.

## Purpose

- **Visual design** — Compose multi-panel artboards with text layers, device frames (mockups), images, and backgrounds (solid, gradient, or image).
- **Preset artboards** — Switch store-size presets (iPhone, iPad, etc.); each preset maps to a `datasource/display_<slug>.json` file.
- **Persistence** — Load and save display documents via the Vite dev plugin (`/__api/datasource/…`). Auto-save and manual save (keyboard shortcut) write the current canvas to disk when the dev server is running.
- **Toolkit & agent integration** — While `npm run dev` is up, the Python toolkit (`toolkit/scripts/designer.py`) and automation can drive the open tab over **Server-Sent Events** (enqueue canvas operations, pull previews). See [TOOLKIT.md](./TOOLKIT.md) for the full API contract.

This UI is the **live editor** half of **apps_publisher**; offline layout helpers and validation live in **`toolkit/`**.

## Setup requirements

| Requirement | Notes |
|-------------|--------|
| **Node.js** | **22.x** (see [`.nvmrc`](./.nvmrc), e.g. `22.15.0`). Use `nvm use` in `web_ui/` if you use nvm. |
| **npm** | Comes with Node. Install dependencies once: `npm install` (from this directory). |
| **Repo layout** | Run from the **apps_publisher** repo. The dev server reads/writes **`datasource/`** and agents use **`output/`** at the repo root. See [Manual cleanup](#manual-cleanup-you-must-do-this). |
| **Port** | Default dev/preview port **4713** ([`vite.config.ts`](./vite.config.ts)). Ensure nothing else binds that port, or change the config consistently with `DESIGNER_API_BASE` in `toolkit/.env`. |
| **Toolkit (optional)** | For CLI/agent control: Python venv + `toolkit/requirements.txt`, `PYTHONPATH=toolkit/scripts`, and `DESIGNER_API_BASE` (defaults to `http://localhost:4713/__api/screenshot-designer`). Documented in [`toolkit/references/designer-reference.md`](../toolkit/references/designer-reference.md). |

No separate `.env` is required for basic local UI use; optional Vite env vars (e.g. preview multiplier) are documented in toolkit references where relevant.

Paths below are relative to the **apps_publisher repo root** (parent of `web_ui/`). The dev server and agents read/write them while you run `npm run dev`.

## Manual cleanup (you must do this)

**Nothing in these folders is removed automatically.** After agent runs or design sessions, **you need to clear them manually** when you want a fresh state, free disk space, or a clean tree before commit/share.

| Clear when… | Folder (from repo root) | What to do |
|-------------|-------------------------|------------|
| Finished an agent screenshot pass or previews look wrong | **`output/temp/`** | Delete the folder contents (or the whole `temp/` directory). Agents recreate files on the next run. |
| Debugging agents or the dev server feels stuck | **`datasource/screenshots/`** | Delete image files. |
| Stale canvas previews from the open designer tab | **`datasource/memories/`** | Delete contents manually. |
| Starting over on store metadata or reports | **`output/`** (keep only what you need) | Remove `appstore.json`, `playstore.json`, `screenshot_report.md`, etc. |
| Resetting a preset’s saved layout | **`datasource/`** | Remove the matching `display_*.json` or screenshots you no longer need. |

There is **no** `npm run clean`, toolkit purge command, or scheduled cleanup — **only manual deletion** (Finder, `rm`, or your editor).

All of the above are gitignored (see [`.gitignore`](../.gitignore) at repo root). Toolkit preview examples often use **`output/temp/`**; treat it as disposable unless you are actively reviewing those files.

## How to use

### Run the dev server

From **`web_ui/`**:

```bash
npm install   # first time only
npm run dev
```

Open **http://localhost:4713** (or the URL Vite prints). Keep the tab open if you use toolkit **enqueue** commands — the browser must subscribe to the command stream for your active artboard **slug**.

### Edit in the UI

- Pick an **artboard preset** from the UI (or `?artboard=` in the URL) to load the matching `display_*.json` or start empty if missing.
- Add **text**, **device frames**, and **images** from the left sidebar; use contextual toolbars for selection.
- **Undo / redo**, copy/paste, nudge, and delete layers via keyboard shortcuts (see hooks under `src/hooks/`).
- **Save** — Manual save hotkey and auto-save write to `datasource/` when the dev server is running; if the API is unavailable, the app may fall back to downloading JSON locally.

### No Production Allowed

The project must run for the **development** only (`npm run dev`).

### Work with the Python toolkit

1. Start **`npm run dev`** in `web_ui/`.
2. Open the designer in a browser tab on the preset you care about.
3. From the repo root, e.g. `python toolkit/scripts/designer.py handoff` or `enqueue-op` (see designer reference).

Probe readiness: `python toolkit/scripts/designer.py handoff` reports whether **`/session`** on the designer API responds.

### Other scripts

| Command | Description |
|---------|-------------|
| `npm run lint` | ESLint |
| `npm run build` | Typecheck + production bundle |

### Further reading

- [TOOLKIT.md](./TOOLKIT.md) — HTTP paths, enqueue-command, SSE, agent preview payloads.
- [`toolkit/references/designer-reference.md`](../toolkit/references/designer-reference.md) — CLI commands and operation allowlists.
