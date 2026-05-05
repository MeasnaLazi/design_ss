# Vision / image toolkit reference

Layout CLI image helpers (`Pillow`): inspect, decode, resize, crop, color sampling, and preset dimension checks. Run from publisher repo root. Optional: `python toolkit/scripts/layout.py --compact image <subcommand> ...`.

**Layout** (`layout.py`: presets, store JSON, packs, grid, text, `predict-checks`, …): **`layout-reference.md`**. **Live canvas**: **`web-ui-reference.md`**.

| CLI | Arg | Summary |
| --- | --- | --- |
| `python toolkit/scripts/layout.py image info` | Required **`--path <path>`** (image file on disk). | Image metadata (dimensions, mode, etc.) |
| `python toolkit/scripts/layout.py image from-base64` | Required **`--input <path>`** or **`--input -`** (read base64 text from file or stdin). Optional **`--out <path>`** — when set, decodes to PNG at that path; JSON still includes dimensions (and `saved` path when written). | Decode PNG from base64; optional write to disk |
| `python toolkit/scripts/layout.py image match-preset` | Required **`--path <path>`**. Optional **`--canvas-size <slug>`** and/or **`--preset-id <id>`** (same preset resolution rules as **`layout resolve-preset`**; both omitted uses default preset). | Compare image dimensions to resolved preset |
| `python toolkit/scripts/layout.py image resize-max-edge` | Required **`--path <path>`**, **`--max-edge <int>`** (max length of longest side in px), **`--out <path>`** (output PNG path). | Resize so longest edge ≤ N |
| `python toolkit/scripts/layout.py image crop` | Required **`--path <path>`**, **`--left`**, **`--top`**, **`--right`**, **`--bottom`** (ints; Pillow box, **`right`** and **`bottom`** are **exclusive**), **`--out <path>`**. | Crop to pixel rectangle |
| `python toolkit/scripts/layout.py image region-hex` | Required **`--path <path>`**, **`--left`**, **`--top`**, **`--right`**, **`--bottom`** (ints; same exclusive **`right`** / **`bottom`** convention as **`image crop`**). | Mean color hex for rectangle |
| `python toolkit/scripts/layout.py image dominant` | Required **`--path <path>`**. Optional **`--k <int>`** (number of colors, default **5**). | Heuristic dominant colors (quantize) |
| `python toolkit/scripts/layout.py image assert-png` | Required **`--path <path>`**. | Exit 0 if file starts with PNG magic |

Typical QA after a designer preview: `image info` on the saved PNG; `match-preset` to confirm dimensions match the target `canvas-size` / preset.
