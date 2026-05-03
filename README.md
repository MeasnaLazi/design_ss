# apps_publisher
An agent to generate store information and design screenshots.

Screenshot workflow: **`.claude/skills/screenshot-docs/`** (`SKILL.md` + `references/`). Python tooling: **`toolkit/`** (`pip install -r toolkit/requirements.txt`).

source ~/.bashrc

Usage (quick)
1. Run web_ui with the designer open for the target artboard (so command-events has a subscriber).
2. From repo root:
python3 toolkit/scripts/designer.py enqueue-op --operation add_device_frame --args-json '{"path":"/device-frames/iphone_12_pro/frame/front.svg","frame":"front"}'
3. Push PNG / JSON for the agent: toolbar Agent PNG / Agent JSON, or pull-preview / pull-export after the matching enqueue-op.

