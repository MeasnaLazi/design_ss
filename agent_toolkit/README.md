# agent-toolkit

**Layout** math and **image** helpers aligned with `web_ui/screenshot-designer-server.ts`, plus a **designer** HTTP client (stdlib) for `GET/POST` to the screenshot-designer API (`npm run dev` or **`npm run prod`** in `web_ui/`) on **loopback only**.

Run from repo root (after `pip install -e ./agent_toolkit` or a venv inside `agent_toolkit/`).

Global `--compact` must appear **immediately** after `agent-toolkit` / `python -m agent_toolkit` (before `layout` or `designer`).

```bash
python -m agent_toolkit layout list-presets
python -m agent_toolkit --compact layout list-presets
python -m agent_toolkit layout resolve-preset --canvas-size iphone
python -m agent_toolkit layout predict-checks --json session.json
python -m agent_toolkit layout image info --path preview.png
python -m agent_toolkit layout image match-preset --path preview.png --canvas-size iphone
```

**Designer API** (requires `web_ui` with `/__api` enabled: **`npm run dev`** or **`npm run prod`**). Base URL comes from, in order: environment variable **`DESIGNER_API_BASE`**, then **`agent_toolkit/.env`** (see `agent_toolkit/.env.example`), then default `http://localhost:4713/__api/screenshot-designer`.

```bash
cd agent_toolkit && cp .env.example .env   # once
python -m agent_toolkit designer handoff                    # { ok, handoff { web_ui_url, designer_api_base, web_ui_status }, session }
python -m agent_toolkit designer session --canvas-size iphone
python -m agent_toolkit designer execute --json execute.json
python -m agent_toolkit designer execute-op --operation clear_canvas --args-json "{}"
python -m agent_toolkit designer save-display --preset-id appstore_iphone_portrait
```

See `.claude/agents/screenshot_designer.md` for when to use this alongside the designer API.
