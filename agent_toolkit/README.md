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
python -m agent_toolkit layout store-json --platform iphone   # output/appstore.json + presetId
```

**Designer API** (requires `web_ui` with `/__api` enabled: **`npm run dev`** or **`npm run prod`**). Base URL comes from, in order: environment variable **`DESIGNER_API_BASE`**, then **`agent_toolkit/.env`** (see `agent_toolkit/.env.example`), then default `http://localhost:4713/__api/screenshot-designer`.

```bash
cd agent_toolkit && cp .env.example .env   # once
python -m agent_toolkit designer handoff                    # { ok, handoff { web_ui_url, designer_api_base, web_ui_status }, session }
python -m agent_toolkit designer session
python -m agent_toolkit designer display-events --slug iphone
python -m agent_toolkit designer execute --json execute.json          # noop only; layout ops use enqueue-op
python -m agent_toolkit designer execute-op --operation noop --args-json "{}"
python -m agent_toolkit designer enqueue-op --operation add_device_frame --args-json '{"path":"/device-frames/iphone_12_pro/frame/front.svg","frame":"front"}'
python -m agent_toolkit designer pull-preview --out /tmp/agent.png    # after Web UI “Agent PNG” or enqueue render_preview
python -m agent_toolkit designer pull-export                        # after enqueue export_json (compact layout summary JSON)
```

See `docs/screenshot-designer-toolkit-reference.md` for the screenshot-designer command reference, and `.claude/agents/screenshot_designer.md` for workflow/quality rules.
