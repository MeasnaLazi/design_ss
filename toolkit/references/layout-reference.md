# Layout toolkit reference

All commands run as **`python toolkit/scripts/layout.py <subcommand> …`** from the publisher repo root (unless noted). They cover **preset catalog**, **store listing JSON**, **device pack metadata**, **safe zone / grid / text metrics**, **offline align parity** with `web_ui/screenshot-designer-server.ts`, and **session / designer-export JSON validation** (`predict-checks`, `contrast`, `preview-budget`). Optional global flag: **`--compact`** immediately after `layout.py`.

**Image bytes** (`layout image …`, Pillow): **`vision-reference.md`**. **Live canvas** (`designer.py`, preview/export): **`web-ui-reference.md`**.

## Presets

| CLI | Arg | Summary |
| --- | --- | --- |
| `python toolkit/scripts/layout.py list-presets` | No arguments. | JSON rows: `presetId`, `displaySlug`, `width`, `height`, `placeholder` |
| `python toolkit/scripts/layout.py resolve-preset` | Optional **`--canvas-size <slug>`** and/or **`--preset-id <id>`** (both may be omitted → default preset). `canvas-size` uses the same slug family as `store-json` / `safe-zone` (e.g. `iphone`, `ipad`, `phone`, `tablet`); `preset-id` accepts catalog ids (legacy ids normalized internally). | Resolve one preset to dimensions + metadata |

## Store listings

| CLI | Arg | Summary |
| --- | --- | --- |
| `python toolkit/scripts/layout.py store-json` | Required **`--platform`** with value **`iphone`**, **`ipad`**, **`phone`**, or **`tablet`** (`iphone` / `ipad` → `output/appstore.json`; `phone` / `tablet` → `output/playstore.json`). Optional **`--repo-root <path>`** (defaults to publisher root). | Load `output/appstore.json` (iphone/ipad) or `output/playstore.json` (phone/tablet); returns `store`, `presetId`, `canvasSize`, `absolutePath` |

## Device packs and frames (repo JSON)

| CLI | Arg | Summary |
| --- | --- | --- |
| `python toolkit/scripts/layout.py device-packs` | Optional **`--type <string>`** (e.g. `iphone`, `ipad`, `phone`, `tablet` — filters packs in `web_ui/public/device-frames/index.json`). Optional **`--repo-root <path>`**. | List packs from `web_ui/public/device-frames/index.json` |
| `python toolkit/scripts/layout.py load-frame` | Required **`--pack <pack_id>`**. Optional **`--repo-root <path>`**. | Read `frame.json` for pack (`name`, `description`, `framePath`, …) |

## Geometry, grid, text metrics

| CLI | Arg | Summary |
| --- | --- | --- |
| `python toolkit/scripts/layout.py safe-zone` | Optional **`--canvas-size <slug>`** and/or **`--preset-id <id>`** (preset resolution identical to `resolve-preset`). | Safe-zone rect for preset canvas |
| `python toolkit/scripts/layout.py snap-to-grid` | Required **`--value <float>`**. **`--mode`** is **`nearest`**, **`floor`**, or **`ceil`** (default **`nearest`**). | Snap a scalar to design grid |
| `python toolkit/scripts/layout.py assert-grid` | Required **`--x <float>`**, **`--y <float>`**. | Exit non-zero if coordinates not grid-aligned |
| `python toolkit/scripts/layout.py estimate-text-width` | Required **`--content <string>`**, **`--size <float>`** (font size px). | Mirror server `estimateTextWidth` |
| `python toolkit/scripts/layout.py estimate-text-height` | Required **`--size <float>`** (font size px). | Mirror text layer height factor |
| `python toolkit/scripts/layout.py align` | Required **`--layer-w`**, **`--layer-h`**, **`--anchor`** (`center_x`, `center_y`, `top`, `bottom`, `left`, or `right`), **`--ref-w`**, **`--ref-h`**. Optional **`--layer-x`**, **`--layer-y`**, **`--ref-x`**, **`--ref-y`** (each defaults to **0**). Parity note: live `align` uses panel-local refs (`reference: "panel"` + `panel_index` / `panel_number`); `reference: "canvas"` is rejected server-side. | Offline align position (mirror server align op) |
| `python toolkit/scripts/layout.py scaled-device-size` | Required **`--view-w <float>`**, **`--view-h <float>`**, **`--scale <float>`**. | Scaled device dimensions |
| `python toolkit/scripts/layout.py device-height-ratio` | Required **`--device-height <float>`**, **`--canvas-height <float>`**. JSON output includes **`ok`** when ratio is in ~**0.55–0.75** (same band as `predict-checks`). | Ratio device height / canvas height |

## Quality and session JSON

| CLI | Arg | Summary |
| --- | --- | --- |
| `python toolkit/scripts/layout.py predict-checks` | Required **`--json <path>`** or **`--json -`** (stdin): raw **`SessionCheckInput`** JSON (`core.models`). | Run quality checks on **`SessionCheckInput`** JSON (`core.models`) |
| `python toolkit/scripts/layout.py predict-checks` | Same **`--json`**, plus **`--from-export`** (boolean flag). | Input is **`AgentLayoutSummaryV1`** from **`designer.py pull-export`**; CLI converts to `SessionCheckInput` then runs checks (safe-zone, overlaps, contrast, headline heuristic, device vs canvas height, …) |
| `python toolkit/scripts/layout.py contrast` | Required **`--a <hex>`**, **`--b <hex>`** (e.g. `#ffffff`, `#101827`). | WCAG contrast ratio between two colors |
| `python toolkit/scripts/layout.py preview-budget` | Required **`--count <int>`**. | Render-iteration budget helper |

**Export workflow:** after `enqueue-op export_json` + `pull-export` (see **`web-ui-reference.md`**), save JSON (full strip recommended for `--from-export` so layer `left`/`top` stay in `sourceCanvas` coordinates), then e.g. `python toolkit/scripts/layout.py predict-checks --json datasource/temp/session_export.json --from-export`. Re-export from the canvas and re-run until `ok` is true.
