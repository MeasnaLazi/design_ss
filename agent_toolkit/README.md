# agent-toolkit

Phase 1: **layout** math aligned with `web_ui/screenshot-designer-server.ts`, plus **image** helpers (PNG/JPEG/WebP via Pillow).

Run from repo root (after `pip install -e ./agent_toolkit` or a venv inside `agent_toolkit/`).

Global `--compact` must appear **immediately** after `agent-toolkit` / `python -m agent_toolkit` (before `layout`).

```bash
python -m agent_toolkit layout list-presets
python -m agent_toolkit --compact layout list-presets
python -m agent_toolkit layout resolve-preset --canvas-size iphone
python -m agent_toolkit layout predict-checks --json session.json
python -m agent_toolkit layout image info --path preview.png
python -m agent_toolkit layout image match-preset --path preview.png --canvas-size iphone
```

See `.claude/agents/screenshot_designer.md` for when to use this alongside the designer API.
