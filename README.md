# apps_publisher

**Main purpose:** This project is built **for developers** — app engineers and publisher workflows who need repeatable, scriptable control over store screenshots, not a consumer-facing design product.

**apps_publisher** is an open-source toolkit for designing, validating, and automating **App Store** and **Play Store** screenshot layouts. It pairs a browser-based visual editor with a Python CLI and agent-friendly HTTP APIs so you can edit in the browser, drive the canvas from scripts or agents, and keep everything in your repo.

## Demo
Design by Human! 🧑🏽‍💻 ~ 5 minutes (continue from AI) <br><br>
![Screenshot designer UI](docs/workspace.png)

Design by Claude! 🤖 ~ 17 minutes <br><br>
[![Watch demo on YouTube](https://img.youtube.com/vi/NJOYo_1MTBE/hqdefault.jpg)](https://www.youtube.com/watch?v=NJOYo_1MTBE)

## Workspace features

The **[`web_ui/`](web_ui/)** screenshot designer is the visual workspace. Highlights:

- **App Store and Play Store artboards** — Preset panel sizes for iPhone, iPad, Play phone, and Play tablet (portrait and landscape); switch presets without leaving the editor.
- **Multi-panel carousels** — One horizontal strip with 1–N screenshot panels, adjustable gap, per-panel alignment guides, and export-sized slots.
- **Device mockups** — Catalog of SVG device-frame packs (iPhone, iPad, Android phone/tablet) with multiple angles (front, isometric, perspective); drop a frame onto any panel column.
- **Screenshots inside frames** — Upload an image into the device screen opening; rectangular and isometric frames warp the shot to the screen mask.
- **Text layers** — Add plain text or store-scaled style presets (title, headline, body, captions); per-layer font, size, weight, color, and alignment from the contextual toolbar.
- **Custom fonts** — Install `.ttf` / `.otf` / `.woff` fonts from your computer (stored in the browser for this workspace until you remove them).
- **Images** — Upload image layers and optional full-artboard background images (saved under `datasource/screenshots/` when the dev server is running).
- **Backgrounds** — Solid fills, multi-stop gradients, or image fills for the artboard.
- **Layers and templates** — Reorder, rename, and select layers; save and reload layout templates from the sidebar.
- **Editing workflow** — Undo/redo, copy/paste, keyboard nudges, zoom, auto-save and manual save to `datasource/display_*.json`.

Agents and the Python toolkit can drive the same canvas over loopback while `npm run dev` is running — see [Agents](#agents) and [`web_ui/TOOLKIT.md`](web_ui/TOOLKIT.md).

## What it does

- **Multi-panel artboards** — Compose store-sized layouts with text, device mockups, images, and backgrounds (solid, gradient, or image).
- **Preset-driven workflows** — Switch between iPhone, iPad, phone, and tablet sizes; each preset maps to a display document under `datasource/`.
- **Live + offline tooling** — Edit in the browser while scripts run layout math, image QA, contrast checks, and rule-based validation without guessing file formats.
- **Agent integration** — Queue canvas operations over Server-Sent Events, pull panel previews (PNG + slim JSON), and gate progress with automated strip rules.

The repo is intended for **local development**: run the Vite dev server, keep a designer tab open, and drive changes from the UI or from `toolkit/` on loopback.

## Repository layout

| Path | Role |
|------|------|
| [`web_ui/`](web_ui/) | **Screenshot / display designer** — Vite + React + Fabric.js editor; persists designs via the dev server into `datasource/`. |
| [`toolkit/`](toolkit/) | **Python CLI** — Offline layout (`layout.py`) and live-canvas control (`designer.py`) against the running UI. |
| [`datasource/`](datasource/) | Local design data and agent/browser scratch ([`temp/`](datasource/temp/), `memories/`). Gitignored — clear manually ([`web_ui/README.md`](web_ui/README.md#manual-cleanup-you-must-do-this)). |
| [`output/`](output/) | **Agent & toolkit outputs** at repo root: store JSON, `screenshot_report.md`, and **`output/temp/`** (agent working files). Gitignored — clear manually ([`web_ui/README.md`](web_ui/README.md#manual-cleanup-you-must-do-this)). |
| [`mask_analysis/`](mask_analysis/) | **Standalone** browser tool to analyze SVG device-frame screen masks and composite screenshots with OpenCV.js (no npm build). |
| [`config.json`](config.json) | Optional paths to sibling app projects (e.g. iOS/Android) for publisher workflows. |

## Architecture

```text
┌─────────────────────────────────────────────────────────────────┐
│                        apps_publisher (repo)                     │
├──────────────────────────────┬──────────────────────────────────┤
│  web_ui (Vite dev :4713)     │  toolkit (Python 3.10+)          │
│  • Fabric canvas editor      │  • layout.py  — presets, color,  │
│  • datasource read/write     │    image QA, store JSON (offline)│
│  • /__api/screenshot-designer│  • designer.py — handoff,        │
│    SSE enqueue + previews    │    enqueue-op, validate-rules    │
└──────────────┬───────────────┴──────────────┬───────────────────┘
               │ loopback HTTP + SSE           │
               └──────────────┬────────────────┘
                              ▼
         datasource/  (displays, screenshots, temp/)  ·  output/  (store JSON, reports, temp/)
```

**Typical automation loop** (one panel at a time):

1. Start `npm run dev` in `web_ui/` and open the designer for the target artboard slug.
2. `python toolkit/scripts/designer.py enqueue-op` — mutate the canvas in the browser.
3. `pull-preview` / `pull-preview-data` — fetch the latest PNG or panel layout JSON.
4. `validate-rules` / `validate-strip-rules` — automated checks before moving on or requesting vision review.

See [`toolkit/references/designer-reference.md`](toolkit/references/designer-reference.md) and [`toolkit/references/design-validate.md`](toolkit/references/design-validate.md) for the full command contracts.

## Agents

Specialized Claude Code agents live under [`.claude/agents/`](.claude/agents/). Each agent loads a matching skill under [`.claude/skills/`](.claude/skills/) (plus [`toolkit/SKILL.md`](toolkit/SKILL.md) for designer work). Typical order: **tool-running** → **data-gathering** → **planning** → **screenshot-designer**.

| Agent | Skill | Summary |
|-------|-------|---------|
| [`tool-running-agent`](.claude/agents/tool-running-agent.md) | [`tool-running`](.claude/skills/tool-running/SKILL.md) | Verifies Python venv + `toolkit/requirements.txt`, `web_ui` npm deps, probes port **4713**, starts `npm run dev` when needed, and confirms the designer is reachable. |
| [`data-gathering-agent`](.claude/agents/data-gathering-agent.md) | [`data-gathering`](.claude/skills/data-gathering/SKILL.md) | Reads [`config.json`](config.json), collects listing metadata (scan or Q&A), picks layout platform + device pack, writes `output/appstore.json` / `output/playstore.json` with five screenshot slots, and posts the full in-chat checklist. |
| [`planning-agent`](.claude/agents/planning-agent.md) | [`planning`](.claude/skills/planning/SKILL.md) | Turns store JSON into a messaging-only creative brief at `output/screenshot_report.md` (theme hex, per-panel copy, continuity) and pastes the full report in chat for the designer. |
| [`screenshot-designer-agent`](.claude/agents/screenshot-designer-agent.md) | [`screenshot-designing`](.claude/skills/screenshot-designing/SKILL.md), [`publisher-toolkit`](toolkit/SKILL.md) | Designs store panels one at a time via `designer.py` / `layout.py`, theme-mixed backgrounds, preview → `validate-rules` gate per panel, then strip-level checks. |

## Quick start

### 1. Web UI (required for visual design and designer commands)

```bash
cd web_ui
nvm use          # Node 22.x — see web_ui/.nvmrc
npm install
npm run dev
```

Open **http://localhost:4713** (default port). The dev server reads and writes **`datasource/`** at the repo root.

Details: [`web_ui/README.md`](web_ui/README.md) · API contract: [`web_ui/TOOLKIT.md`](web_ui/TOOLKIT.md)

### 2. Python toolkit

```bash
cd toolkit
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env    # optional; sets DESIGNER_API_BASE
```

Details: [`toolkit/README.md`](toolkit/README.md)

### 3. Mask analysis (optional)

Static tool for tuning perspective screen quads on SVG device frames:

```bash
cd mask_analysis
python3 -m http.server 8080
# open http://localhost:8080
```

Details: [`mask_analysis/README.MD`](mask_analysis/README.MD)

## Requirements

| Component | Requirement |
|-----------|-------------|
| **web_ui** | Node.js **22.x**, npm |
| **toolkit** | Python **3.10+** (tested on 3.13), venv recommended |
| **Designer API** | `web_ui` dev server on port **4713** (configurable via `toolkit/.env`) |
| **mask_analysis** | Any static HTTP server; network for OpenCV.js CDN on first load |

## Documentation map

| Topic | Location |
|-------|----------|
| Web UI setup & usage | [`web_ui/README.md`](web_ui/README.md) |
| Manual cleanup (`datasource/`, `output/`, `temp/`) | [`web_ui/README.md` — Manual cleanup](web_ui/README.md#manual-cleanup-you-must-do-this) |
| Designer HTTP / SSE API | [`web_ui/TOOLKIT.md`](web_ui/TOOLKIT.md) |
| Toolkit overview | [`toolkit/README.md`](toolkit/README.md) |
| Layout CLI reference | [`toolkit/references/layout-reference.md`](toolkit/references/layout-reference.md) |
| Designer CLI & enqueue allowlist | [`toolkit/references/designer-reference.md`](toolkit/references/designer-reference.md) |
| Rules + hybrid validation workflow | [`toolkit/references/design-validate.md`](toolkit/references/design-validate.md) |
| SVG screen mask tool | [`mask_analysis/README.MD`](mask_analysis/README.MD) |

## Development notes

### Local folders (not committed)

Generated paths are in [`.gitignore`](.gitignore). **You must clear `datasource/`, `output/`, and their `temp/` folders manually** — see [`web_ui/README.md` — Manual cleanup](web_ui/README.md#manual-cleanup-you-must-do-this).

- **`output/`** — `appstore.json`, `playstore.json`, `screenshot_report.md`; agents also use **`output/temp/`** for preview PNGs and panel JSON during design/validation.
- **`datasource/`** — Canvas saves (`display_*.json`), screenshots, templates; **`datasource/temp/`** and **`datasource/memories/`** hold session/agent scratch from the dev server.

**`layout.py store-json`** reads `output/appstore.json` and `output/playstore.json` when present.

### Tooling

- **Tests** — From `toolkit/`: `pytest` (see `toolkit/pytest.ini`).
- **Lint** — From `web_ui/`: `npm run lint`.

The screenshot designer is built for **`npm run dev`** workflows, not as a hosted production app. If you change the dev port, update `DESIGNER_API_BASE` in `toolkit/.env` to match.

## Contributing

Issues and pull requests are welcome.

**Code & automation** — When changing toolkit or designer APIs, update the relevant reference under `toolkit/references/` and keep CLI behavior aligned with [`web_ui/TOOLKIT.md`](web_ui/TOOLKIT.md).

**Device frames (especially welcome)** — The catalog is small today (see [`web_ui/public/device-frames/`](web_ui/public/device-frames/)). Contributors who can supply **device mockup packs** are a big help. We are looking for:

| Contribution | Examples |
|--------------|----------|
| **Different devices** | More iPhone / iPad models, Android phones and tablets, other form factors |
| **Different angles** | Front, slight Y-axis rotation (`angled-left` / `angled-right`), tilted views |
| **Different edges** | Frames that show left/right/top/bottom bezels and buttons, not only a flat front |
| **Different isometric / 3D-style views** | e.g. `isometric-left`, `isometric-right`, and other perspective variants |
| **More variants per device** | Several SVG styles per pack so layouts can mix poses on one artboard |

Please use **original or properly licensed** artwork only, and include a short note in the PR describing the device model and which angles/edges each SVG represents. OR send to my email directly [sovannmeasna.ly@gmail.com](mailto:sovannmeasna.ly@gmail.com).

## License

This project is licensed under the [MIT License](LICENSE).
