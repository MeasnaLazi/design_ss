# Agent toolkit (screenshot layout + designer API)

Layout math and image helpers aligned with `web_ui/screenshot-designer-server.ts`, plus a designer HTTP client (stdlib) for GET/POST to the screenshot-designer API (`npm run dev` or **`npm run prod`** in `web_ui/`) on loopback only.

## When to use

Use this skill whenever a screenshot agent needs **layout / parity checks**, **image helpers**, or **designer HTTP calls** against the Web UI on port **4713** (after `toolkit_runner` has started or verified the server).

## Setup

From repo root:

```bash
pip install -r toolkit/requirements.txt
```

Optional venv inside `toolkit/` is fine. Copy env once: `cp toolkit/.env.example toolkit/.env`.

## Invocation

| Old (`python -m agent_toolkit`, removed) | New |
| --- | --- |
| `layout …` | `python toolkit/scripts/layout.py …` |
| `designer …` | `python toolkit/scripts/designer.py …` |

Global **`--compact`** must appear **immediately** after the script name (before subcommands such as `list-presets`).

### Layout / image

```bash
python toolkit/scripts/layout.py list-presets
python toolkit/scripts/layout.py --compact list-presets
python toolkit/scripts/layout.py resolve-preset --canvas-size iphone
python toolkit/scripts/layout.py predict-checks --json session.json
python toolkit/scripts/layout.py image info --path preview.png
python toolkit/scripts/layout.py image match-preset --path preview.png --canvas-size iphone
python toolkit/scripts/layout.py store-json --platform iphone   # output/appstore.json + presetId
```

### Designer API

Requires `web_ui` with `/__api` enabled. Base URL resolution order: **`DESIGNER_API_BASE`** env var, then **`toolkit/.env`**, then default `http://localhost:4713/__api/screenshot-designer`.

```bash
python toolkit/scripts/designer.py handoff
python toolkit/scripts/designer.py session
python toolkit/scripts/designer.py execute --json execute.json
python toolkit/scripts/designer.py execute-op --operation noop --args-json "{}"
python toolkit/scripts/designer.py enqueue-op --operation add_device_frame --args-json '{"path":"/device-frames/iphone_12_pro/frame/front.svg","frame":"front"}'
python toolkit/scripts/designer.py pull-preview --out /tmp/agent.png
python toolkit/scripts/designer.py pull-preview --panels "0,1" --out /tmp/seg.png
python toolkit/scripts/designer.py pull-export
python toolkit/scripts/designer.py pull-export --panels "0,1"
```

## References

- Full payloads and command reference: **`references/screenshot-designer-toolkit-reference.md`**
- Multi-agent workflow and **`datasource/temp/design_brief.json`**: **`.claude/skills/screenshot-docs/`** (**`SKILL.md`** index + **`references/`**) and **`.claude/agents/screenshot_*.md`**
