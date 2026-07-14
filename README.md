# apps_publisher

**Main purpose:** This project is built **for developers** — app engineers and publisher workflows who need repeatable, scriptable control over store screenshots, not a consumer-facing design product.

**apps_publisher** is an open-source toolkit for designing and automating **App Store** and **Play Store** screenshot layouts. It pairs a browser-based visual editor with an HTML-first composer and agent-friendly HTTP APIs so you can edit in the browser, drive the canvas from scripts or agents, and keep everything in your repo.

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

Agents can drive the same canvas over loopback (via `composer/import-to-canvas.mjs`) while `npm run dev` is running — see [Agents](#agents) and [`web_ui/TOOLKIT.md`](web_ui/TOOLKIT.md).

## What it does

- **Multi-panel artboards** — Compose store-sized layouts with text, device mockups, images, and backgrounds (solid, gradient, or image).
- **Preset-driven workflows** — Switch between iPhone, iPad, phone, and tablet sizes; each preset maps to a display document under `datasource/`.
- **Live + offline tooling** — Edit in the browser while per-skill `script/` helpers resolve device packs and frame paths without guessing file formats.
- **Agent integration** — Author strips as HTML, render to PNGs with Playwright, then replay them into the canvas over Server-Sent Events for human touch-up.

The repo is intended for **local development**: run the Vite dev server, keep a designer tab open, and drive changes from the UI or from `composer/import-to-canvas.mjs` on loopback.

## Repository layout

| Path | Role |
|------|------|
| [`web_ui/`](web_ui/) | **Screenshot / display designer** — Vite + React + Fabric.js editor; persists designs via the dev server into `datasource/`. |
| [`composer/`](composer/) | **HTML-first strip composer** — agents author whole strips as HTML/CSS ([`strip-schema.md`](composer/strip-schema.md)), `render.mjs` exports store-size PNGs + a `strip-data.json` snapshot via Playwright, `import-to-canvas.mjs` replays a strip into the live canvas as editable layers. |
| [`.claude/skills/`](.claude/skills/) | **Agents & skills** — the `screenshot-brief` skill bundles its `script/` helpers (`device-packs.mjs`, `load-frame.mjs`). Plain Node, no deps. |
| [`datasource/`](datasource/) | Local design data and agent/browser scratch ([`temp/`](datasource/temp/), `memories/`). Gitignored — clear manually ([`web_ui/README.md`](web_ui/README.md#manual-cleanup-you-must-do-this)). |
| [`output/`](output/) | **Agent outputs** at repo root: store JSON, `screenshot_report.md`, and **`output/temp/`** (agent working files). Gitignored — clear manually ([`web_ui/README.md`](web_ui/README.md#manual-cleanup-you-must-do-this)). |
| [`mask_analysis/`](mask_analysis/) | **Standalone** browser tool to analyze SVG device-frame screen masks and composite screenshots with OpenCV.js (no npm build). |
| [`config.json`](config.json) | **Optional override** — explicit `ios_project_path` / `android_project_path`. By default the app project is the **parent folder** of apps_publisher (place this repo in your app project's root). |

## Architecture

```text
┌─────────────────────────────────────────────────────────────────┐
│                        apps_publisher (repo)                     │
├──────────────────────────────┬──────────────────────────────────┤
│  web_ui (Vite dev :4713)     │  composer (Node + Playwright)    │
│  • Fabric canvas editor      │  • render.mjs — HTML strip → PNGs│
│  • datasource read/write     │  • import-to-canvas.mjs — replay │
│  • /__api/screenshot-designer│  skill-local script/ helpers     │
│    (import-to-canvas replay) │  (Node, no deps)                 │
└──────────────┬───────────────┴──────────────┬───────────────────┘
               │ loopback HTTP + SSE           │
               └──────────────┬────────────────┘
                              ▼
         datasource/  (displays, screenshots, temp/)  ·  output/  (store JSON, reports, temp/)
```

**Agent design loop (HTML-first, default):**

1. Agent writes the whole strip as one HTML document per [`composer/strip-schema.md`](composer/strip-schema.md) (real screenshots warped into device frames via `frame.json` homography).
2. `node composer/render.mjs --strip … --out … --full` — export-size PNGs + `strip-data.json`.
3. Agent reviews the PNGs against [`composer/references/`](composer/references/), edits the HTML, re-renders until it looks right.
4. Handoff to the editor: `node composer/import-to-canvas.mjs --strip …` — rebuilds the strip in the live canvas as editable layers for human touch-up (requires the dev server and an open designer tab).

After import, the human finishes the design in the **`web_ui`** editor. The agent does not drive the canvas directly.

## Agents

Claude Code agents live under [`.claude/agents/`](.claude/agents/). One command runs the whole pipeline: **`screenshot-agent --platform ios|android`** does the prep phases, then spawns a focused **`screenshot-design-agent`** subagent for the design.

| Agent | Skill | Summary |
|-------|-------|---------|
| [`screenshot-agent`](.claude/agents/screenshot-agent.md) | [`screenshot-brief`](.claude/skills/screenshot-brief/SKILL.md) | **Entry point.** Takes `--platform`; **Phase 1** gathers listing metadata + theme, picks the device pack, writes `output/appstore.json` / `output/playstore.json` (five slots) and posts the in-chat checklist; **Phase 2** turns it into the creative brief `output/screenshot_report.md`. Pauses for review, then launches the design subagent. |
| [`screenshot-design-agent`](.claude/agents/screenshot-design-agent.md) | [`screenshot-design`](.claude/skills/screenshot-design/SKILL.md) | **Design subagent.** Ensures the composer/web_ui dev stack, authors the whole strip as one HTML/CSS document ([`composer/`](composer/)), renders with Playwright, self-reviews against [`composer/references/`](composer/references/), iterates, then hands off via `import-to-canvas.mjs` for human touch-up in the editor. |

## Quick start

### 1. Web UI (required for visual design and the import handoff)

```bash
cd web_ui
nvm use          # Node 22.x — see web_ui/.nvmrc
npm install
npm run dev
```

Open **http://localhost:4713** (default port). The dev server reads and writes **`datasource/`** at the repo root.

Details: [`web_ui/README.md`](web_ui/README.md) · API contract: [`web_ui/TOOLKIT.md`](web_ui/TOOLKIT.md)

### 2. Composer (HTML renderer)

The per-skill layout helpers under `.claude/skills/*/script/` need no install (plain Node ESM). For the HTML renderer:

```bash
cd composer
npm install
npx playwright install chromium
```

Details: [`composer/README.md`](composer/README.md)

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
| **composer** | Node.js **22.x**, npm, Playwright Chromium |
| **skill scripts** | Node.js **22.x** (no dependencies) |
| **Designer API** | `web_ui` dev server on port **4713** (only for the `import-to-canvas` handoff) |
| **mask_analysis** | Any static HTTP server; network for OpenCV.js CDN on first load |

## Documentation map

| Topic | Location |
|-------|----------|
| Web UI setup & usage | [`web_ui/README.md`](web_ui/README.md) |
| Manual cleanup (`datasource/`, `output/`, `temp/`) | [`web_ui/README.md` — Manual cleanup](web_ui/README.md#manual-cleanup-you-must-do-this) |
| Designer HTTP / SSE API | [`web_ui/TOOLKIT.md`](web_ui/TOOLKIT.md) |
| Layout helpers (`device-packs`, `load-frame`) | `.claude/skills/screenshot-brief/script/` |
| HTML strip composer | [`composer/README.md`](composer/README.md) · [`composer/strip-schema.md`](composer/strip-schema.md) |
| SVG screen mask tool | [`mask_analysis/README.MD`](mask_analysis/README.MD) |

## Development notes

### Local folders (not committed)

Generated paths are in [`.gitignore`](.gitignore). **You must clear `datasource/`, `output/`, and their `temp/` folders manually** — see [`web_ui/README.md` — Manual cleanup](web_ui/README.md#manual-cleanup-you-must-do-this).

- **`output/`** — `appstore.json`, `playstore.json`, `screenshot_report.md`; agents also use **`output/temp/`** for preview PNGs and panel JSON during design.
- **`datasource/`** — Canvas saves (`display_*.json`), screenshots, templates; **`datasource/temp/`** and **`datasource/memories/`** hold session/agent scratch from the dev server.

### Tooling

- **Lint** — From `web_ui/`: `npm run lint`.

The screenshot designer is built for **`npm run dev`** workflows, not as a hosted production app.

## Contributing

Issues and pull requests are welcome.

**Code & automation** — When changing the `script/` helpers or the `/__api/screenshot-designer/` endpoints, update the relevant skill's `script/` and keep [`web_ui/TOOLKIT.md`](web_ui/TOOLKIT.md) aligned.

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
