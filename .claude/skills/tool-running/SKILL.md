---
name: tool-running
disable-model-invocation: true
description: >-
  Verifies and installs prerequisites for apps_publisher Python toolkit/
  (requirements.txt, optional venv) and web_ui/ (npm dependencies), probes
  whether the Vite dev server is listening, starts npm run dev in web_ui when
  needed, then confirms readiness. Use when acting as tool-running-agent or when
  the user names tool-running / asks to prepare or run the local dev stack.
---

# Tool running (toolkit + web_ui)

## Repo root

Let **`R`** = the **apps_publisher** repository root.

## Ports and commands (source of truth)

- **Dev server:** `web_ui` Vite **`server.port`** in **`R/web_ui/vite.config.ts`** (currently **4713**). If that file changes, update this skill’s port references.
- **Probe URL:** **`http://127.0.0.1:<port>/`** — treat HTTP success (any non-connection error counts as “something is listening”; prefer **200** if you use `curl -f`).
- **Start UI:** From **`R/web_ui`**: **`npm run dev`** (long-running → run in **background** in Claude Code).

## Workflow (strict order)

1. **`cd`** to **`R`** for all relative paths.
2. **Python toolchain**
   - Require **`python3`** (or **`python`** on Windows if present and callable as Python 3). If absent, install per OS (macOS often Homebrew **`brew install python`**) then continue.
   - **Toolkit deps:** Prefer an isolated env:
     - Create **`R/toolkit/.venv`** if missing: `python3 -m venv toolkit/.venv`
     - Install: **`toolkit/.venv/bin/pip install -r toolkit/requirements.txt`** (Windows: **`toolkit\.venv\Scripts\pip`**).
   - Quick sanity optional: **`toolkit/.venv/bin/python -c "import pydantic, PIL"`** (packages from `requirements.txt`).
3. **Node toolchain**
   - Require **`node`** and **`npm`**. If missing, install Node LTS (e.g. **https://nodejs.org/** or **`brew install node`** on macOS).
   - In **`R/web_ui`**: if **`node_modules`** is missing or user asked for a clean reinstall, install deps:
     - If **`package-lock.json`** exists → **`npm ci`**
     - Else → **`npm install`** (current repo layout).
4. **Is web_ui already running?**
   - Probe **`http://127.0.0.1:4713/`** (or current `server.port` from **vite.config.ts** if you re-read it).
   - If the probe succeeds, **do not** start a second dev server unless the user asked to restart.
5. **Start dev server only if probe failed**
   - From **`R/web_ui`** run **`npm run dev`** in the **background**.
   - **`server`** in **vite.config.ts** does not set **`strictPort`**; if **4713** is taken, Vite may pick another port. After start, confirm the **`Local:`** URL from the dev-server **terminal output**, or probe the port printed there—not only **4713**.
   - Re-probe until the URL responds or surface **stderr** with a clear next step (missing module after install failure, etc.).
6. **Done**
   - Tell the user **the tool is ready** when: toolkit venv deps are installed **and** the dev URL answers.
   - Summarize briefly: what you installed or created **venv**/`node_modules`, whether you started the server, absolute **URL**.

## Constraints

- **Do not** edit **`web_ui/src/**`** unless the user explicitly asks; repo Claude permissions may deny it anyway.
- Prefer **idempotent** steps safe to rerun.
- If port **4713** is occupied by something that is **not** this Vite app, report **PID / process** hints (`lsof -i :4713` on macOS) and avoid killing processes unless the user agrees.
