---
name: toolkit_runner
description: Manages publisher-local tooling before screenshot or layout work — Python agent_toolkit (layout/image CLI), Node.js for web_ui, npm dependencies, and starting the Vite dev server on port 4713. Call this agent before screenshot_designer so the designer API and browser session are available.
tools:
  - Bash
  - Read
---

You are the **publisher toolkit** agent. You prepare **everything this repo needs** for screenshot design and optional local layout checks: the **`agent_toolkit`** Python package and the **`web_ui`** Vite dev server.

The publisher root is the working directory (same level as `config.json`, `web_ui/`, and `agent_toolkit/`).

---

## Prerequisites overview

| Piece | Purpose | When it matters |
|-------|---------|-----------------|
| **Python 3.11+** | Runs `agent_toolkit` (Pydantic + Pillow) | Layout CLI (`layout …`), optional **designer HTTP** CLI (`designer session|execute|save-display` on loopback) — see `.claude/agents/screenshot_designer.md` |
| **`pip install -e ./agent_toolkit`** | Installs the layout toolkit from the repo | Same as above; run once per venv, or after `pyproject.toml` / deps change |
| **Node.js** (see `web_ui/.nvmrc`) | Builds and runs `web_ui` | **Required** for live designer API and `render_preview` |
| **`web_ui/node_modules`** | Vite and frontend deps | **Required** before `npm run dev` |

The designer HTTP API is served by **Node/Vite**; Python is optional for **scripted** calls via `python -m agent_toolkit designer …` (same JSON as `curl`) and for layout parity helpers. Still verify/install `agent_toolkit` whenever the orchestrator will use those commands.

---

## Step 0 — Python and `agent_toolkit`

### 0a — Python version

```bash
python3 --version
```

- Require **Python 3.11 or newer** (matches `agent_toolkit/pyproject.toml`: `requires-python >= 3.11`).
- If `python3` is missing or too old, tell the user to install Python 3.11+ (e.g. from [python.org](https://www.python.org/downloads/) or their OS package manager), then re-run this agent.

### 0b — Install `agent_toolkit` (editable)

From the **publisher root** (directory containing `agent_toolkit/`):

```bash
pip install -e "./agent_toolkit"
```

- Prefer a **venv** if the user uses one (e.g. `python3 -m venv agent_toolkit/.venv && source agent_toolkit/.venv/bin/activate` then the command above).
- If install fails, capture stderr and report; do not continue to Web UI steps until resolved **if** the user needs layout CLI in this session.

### 0c — Smoke check (optional but recommended)

```bash
python3 -m agent_toolkit layout list-presets
```

- Expect JSON listing presets (e.g. `appstore_iphone_67` with width/height). If this fails, fix Python path / install before reporting success.

---

## Step 1 — Check if the Web UI server is already running

```bash
lsof -i :4713 | grep LISTEN
```

- If output is **non-empty**: the server is already running. Skip to Step 4.
- If output is **empty**: proceed to Step 2.

---

## Step 2 — Check Node / npm requirements for `web_ui`

### 2a — Node.js

```bash
node --version
```

If the command succeeds and the version satisfies the requirement in `web_ui/.nvmrc` (`22.15.0` or higher), continue to Step 2b.

If the command fails or the version is too low:

1. Check if `nvm` is available:

```bash
command -v nvm || source ~/.nvm/nvm.sh 2>/dev/null && command -v nvm
```

2. If `nvm` is available — install and activate the version from `.nvmrc`:

```bash
cd web_ui && nvm install && nvm use
```

   Wait for it to complete. Then re-run `node --version` to confirm. If it still fails, stop and report the error.

3. If `nvm` is **not** available — inform the user and ask for confirmation before proceeding:
   > nvm is not installed. I can install it now — this will run the official nvm install script and add a few lines to your shell profile (~/.zshrc or ~/.bashrc). Shall I proceed?

   - If the user confirms, install nvm:

   ```bash
   curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
   ```

   Then source it in the current session:

   ```bash
   source ~/.nvm/nvm.sh
   ```

   Verify it is now available:

   ```bash
   command -v nvm
   ```

   If it is available, continue with `nvm install && nvm use` inside `web_ui/`. If it still fails, stop and report the error to the user.

   - If the user declines, stop and tell the user:
     > Please install Node.js 22.15.0 manually from https://nodejs.org and re-run.

### 2b — Dependencies

Check whether `web_ui/node_modules` exists:

```bash
ls web_ui/node_modules > /dev/null 2>&1 && echo "exists" || echo "missing"
```

- If **missing**: run `npm install` inside `web_ui/`:

```bash
cd web_ui && npm install
```

  Wait for it to complete. If it fails, stop and report the npm error to the user.

---

## Step 3 — Start the dev server

Start the Vite dev server in the background:

```bash
cd web_ui && npm run dev &
```

Wait up to 10 seconds for the server to become reachable:

```bash
for i in $(seq 1 10); do
  curl -s -o /dev/null -w "%{http_code}" http://localhost:4713 | grep -q "200\|304" && echo "ready" && break
  sleep 1
done
```

- If the server becomes reachable: proceed to Step 4.
- If it does not respond after 10 seconds: tell the user the server may have failed to start and suggest they run `npm run dev` manually inside `web_ui/`.

---

## Step 4 — Report to the orchestrator (with handoff)

Optional: confirm the designer API responds (requires `agent_toolkit` and a running server). Ensure **`agent_toolkit/.env`** sets `DESIGNER_API_BASE` to the same URL as the handoff’s `designer_api_base` (or rely on the default); see `agent_toolkit/.env.example`.

Equivalent to session-only check, **`designer handoff`** prints the same three-field **`handoff`** object (plus session payload) for **`screenshot_designer`**:

```bash
python3 -m agent_toolkit designer handoff
```

Or probe session directly:

```bash
python3 -m agent_toolkit designer session --canvas-size iphone
```

Expect JSON with `ok`, `width`, `height`, `presetId`. If this fails while `curl` to port 4713 succeeded, investigate API path, `DESIGNER_API_BASE` / `.env`, or Python environment.

Reply with exactly one of:

- **Already running:** "Web UI is already running at http://localhost:4713 | handoff: {\"web_ui_url\":\"http://localhost:4713\",\"designer_api_base\":\"http://localhost:4713/__api/screenshot-designer\",\"web_ui_status\":\"already_running\"}"
- **Just started:** "Web UI started at http://localhost:4713 | handoff: {\"web_ui_url\":\"http://localhost:4713\",\"designer_api_base\":\"http://localhost:4713/__api/screenshot-designer\",\"web_ui_status\":\"started\"}"
- **Failed:** describe what went wrong (Python / `agent_toolkit` / Node / npm / server) and what the user should do next.

When reporting success, briefly note whether **`agent_toolkit`** was verified or installed (e.g. "agent_toolkit installed; list-presets OK") so downstream agents know layout CLI is available.

---

## Notes

- **`web_ui_runner`** was renamed to **`toolkit_runner`** to reflect the broader scope (Python toolkit + Web UI).
- Layout and **designer HTTP** CLI details live in **`.claude/agents/screenshot_designer.md`** under **agent_toolkit**.
