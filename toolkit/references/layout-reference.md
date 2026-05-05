# Layout toolkit reference

All commands run as **`python toolkit/scripts/layout.py <subcommand> …`** from the publisher repo root (unless noted). They cover **preset catalog**, **store listing JSON**, **device pack metadata**, **safe zone / grid / text metrics**, **offline align parity** with `web_ui/screenshot-designer-server.ts`, and **session / designer-export JSON validation** (`predict-checks`, `contrast`, `preview-budget`). Optional global flag: **`--compact`** immediately after `layout.py`.

**Image bytes** (`layout image …`, Pillow): **`vision-reference.md`**. **Live canvas** (`designer.py`, preview/export): **`web-ui-reference.md`**.

## Presets

| CLI | Arg | Summary |
| --- | --- | --- |
| `python toolkit/scripts/layout.py list-presets` | — | JSON rows: `presetId`, `displaySlug`, `width`, `height`, `placeholder` |
| `python toolkit/scripts/layout.py resolve-preset` | optional `--canvas-size`, `--preset-id` | Resolve one preset to dimensions + metadata |

## Store listings

| CLI | Arg | Summary |
| --- | --- | --- |
| `python toolkit/scripts/layout.py store-json` | `--platform` one of `iphone`, `ipad`, `phone`, `tablet`; optional `--repo-root` | Load `output/appstore.json` (iphone/ipad) or `output/playstore.json` (phone/tablet); returns `store`, `presetId`, `canvasSize`, `absolutePath` |

## Device packs and frames (repo JSON)

| CLI | Arg | Summary |
| --- | --- | --- |
| `python toolkit/scripts/layout.py device-packs` | optional `--type` (e.g. iphone), optional `--repo-root` | List packs from `web_ui/public/device-frames/index.json` |
| `python toolkit/scripts/layout.py load-frame` | `--pack <pack_id>`, optional `--repo-root` | Read `frame.json` for pack (`name`, `description`, `framePath`, …) |

## Geometry, grid, text metrics

| CLI | Arg | Summary |
| --- | --- | --- |
| `python toolkit/scripts/layout.py safe-zone` | optional `--canvas-size`, `--preset-id` | Safe-zone rect for preset canvas |
| `python toolkit/scripts/layout.py snap-to-grid` | `--value`, `--mode` one of `nearest`, `floor`, `ceil` (default `nearest`) | Snap a scalar to design grid |
| `python toolkit/scripts/layout.py assert-grid` | `--x`, `--y` | Exit non-zero if coordinates not grid-aligned |
| `python toolkit/scripts/layout.py estimate-text-width` | `--content`, `--size` | Mirror server `estimateTextWidth` |
| `python toolkit/scripts/layout.py estimate-text-height` | `--size` | Mirror text-layer height factor |
| `python toolkit/scripts/layout.py align` | `--layer-w`, `--layer-h`, `--anchor`, `--ref-w`, `--ref-h`; optional `--layer-x`,`--layer-y`, `--ref-x`,`--ref-y` | Offline align position (mirror server align op) |
| `python toolkit/scripts/layout.py scaled-device-size` | `--view-w`, `--view-h`, `--scale` | Scaled device dimensions |
| `python toolkit/scripts/layout.py device-height-ratio` | `--device-height`, `--canvas-height` | Ratio device height / canvas height |

## Quality and session JSON

| CLI | Arg | Summary |
| --- | --- | --- |
| `python toolkit/scripts/layout.py predict-checks` | `--json` file path or `-` (stdin) | Run quality checks on **`SessionCheckInput`** JSON (`core.models`) |
| `python toolkit/scripts/layout.py predict-checks` | same `--json` plus **`--from-export`** | Input is **`AgentLayoutSummaryV1`** from **`designer.py pull-export`**; CLI converts to `SessionCheckInput` then runs checks (safe-zone, overlaps, contrast, headline heuristic, device vs canvas height, …) |
| `python toolkit/scripts/layout.py contrast` | `--a`, `--b` (hex) | WCAG contrast ratio between two colors |
| `python toolkit/scripts/layout.py preview-budget` | `--count` | Render-iteration budget helper |

**Export workflow:** after `enqueue-op export_json` + `pull-export` (see **`web-ui-reference.md`**), save JSON (full strip recommended for `--from-export` so layer `left`/`top` stay in `sourceCanvas` coordinates), then e.g. `python toolkit/scripts/layout.py predict-checks --json datasource/temp/session_export.json --from-export`. Re-export from the canvas and re-run until `ok` is true.
