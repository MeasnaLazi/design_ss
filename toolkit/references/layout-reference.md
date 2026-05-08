# Layout toolkit reference

All commands run as **`python toolkit/scripts/layout.py <subcommand> …`** from the publisher repo root (unless noted). They cover **preset catalog**, **store listing JSON**, **device pack metadata**, **`layout image`** (Pillow; table below), and **`contrast`**. Optional global flag: **`--compact`** immediately after `layout.py`.

**Image concepts** (crop conventions, QA workflow — no CLI tables): **`vision-reference.md`**. **Live canvas** (`designer.py`, preview): **`web-ui-reference.md`**.

## Presets

| CLI | Arg | Summary |
| --- | --- | --- |
| `python toolkit/scripts/layout.py list-presets` | No arguments. | JSON rows: `presetId`, `displaySlug`, `width`, `height`, `placeholder` |

## Store listings

| CLI | Arg | Summary |
| --- | --- | --- |
| `python toolkit/scripts/layout.py store-json` | Required **`--platform`** with value **`iphone`**, **`ipad`**, **`phone`**, or **`tablet`** (`iphone` / `ipad` → `output/appstore.json`; `phone` / `tablet` → `output/playstore.json`). Optional **`--repo-root <path>`** (defaults to publisher root). | Load `output/appstore.json` (iphone/ipad) or `output/playstore.json` (phone/tablet); returns `store`, `presetId`, `canvasSize`, `absolutePath` |

## Device packs and frames (repo JSON)

| CLI | Arg | Summary |
| --- | --- | --- |
| `python toolkit/scripts/layout.py device-packs` | Optional **`--type <string>`** (e.g. `iphone`, `ipad`, `phone`, `tablet` — filters packs in `web_ui/public/device-frames/index.json`). Optional **`--repo-root <path>`**. | List packs from `web_ui/public/device-frames/index.json` |
| `python toolkit/scripts/layout.py load-frame` | Required **`--pack <pack_id>`**. Optional **`--repo-root <path>`**. | Read `frame.json` for pack (`name`, `description`, `framePath`, …) |

## Quality helpers

| CLI | Arg | Summary |
| --- | --- | --- |
| `python toolkit/scripts/layout.py contrast` | Required **`--a <hex>`**, **`--b <hex>`** (e.g. `#ffffff`, `#101827`). | WCAG contrast ratio between two colors |

## Image (`layout image …`, Pillow)

Run as **`python toolkit/scripts/layout.py image <subcommand> …`** (optional **`--compact`** after `layout.py`). Subcommands:

| CLI | Arg | Summary |
| --- | --- | --- |
| `python toolkit/scripts/layout.py image info` | Required **`--path <path>`** (image file on disk). | Image metadata (dimensions, mode, etc.) |
| `python toolkit/scripts/layout.py image from-base64` | Required **`--input <path>`** or **`--input -`** (read base64 text from file or stdin). Optional **`--out <path>`** — when set, decodes to PNG at that path; JSON still includes dimensions (and `saved` path when written). | Decode PNG from base64; optional write to disk |
| `python toolkit/scripts/layout.py image match-preset` | Required **`--path <path>`**. Optional **`--canvas-size <slug>`** and/or **`--preset-id <id>`** (same rules as **`store-json`** / **`list-presets`**; both omitted uses default preset). | Compare image dimensions to resolved preset |
| `python toolkit/scripts/layout.py image region-hex` | Required **`--path <path>`**, **`--left`**, **`--top`**, **`--right`**, **`--bottom`** (ints; Pillow box, **`right`** and **`bottom`** are **exclusive**). | Mean color hex for rectangle |
| `python toolkit/scripts/layout.py image dominant` | Required **`--path <path>`**. Optional **`--k <int>`** (number of colors, default **5**). | Heuristic dominant colors (quantize) |
