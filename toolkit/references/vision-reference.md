# Vision / image toolkit reference

Layout CLI image helpers (`Pillow`): inspect, decode, resize, crop, color sampling, and preset dimension checks. Run from publisher repo root. Optional: `python toolkit/scripts/layout.py --compact image <subcommand> ...`.

**Layout** (`layout.py`: presets, store JSON, packs, grid, text, `predict-checks`, …): **`layout-reference.md`**. **Live canvas**: **`web-ui-reference.md`**.

| CLI | Arg | Summary |
| --- | --- | --- |
| `python toolkit/scripts/layout.py image info` | `--path <file>` | Image metadata (dimensions, mode, etc.) |
| `python toolkit/scripts/layout.py image from-base64` | `--input` file path or `-` (stdin), optional `--out <path>` | Decode PNG from base64; optional write to disk |
| `python toolkit/scripts/layout.py image match-preset` | `--path <file>`, optional `--canvas-size`, optional `--preset-id` | Compare image dimensions to resolved preset |
| `python toolkit/scripts/layout.py image resize-max-edge` | `--path <file>`, `--max-edge <n>`, `--out <path>` | Resize so longest edge ≤ N |
| `python toolkit/scripts/layout.py image crop` | `--path <file>`, `--left`, `--top`, `--right`, `--bottom`, `--out <path>` | Crop to pixel rectangle |
| `python toolkit/scripts/layout.py image region-hex` | `--path <file>`, `--left`, `--top`, `--right`, `--bottom` | Mean color hex for rectangle |
| `python toolkit/scripts/layout.py image dominant` | `--path <file>`, optional `--k` (default 5) | Heuristic dominant colors (quantize) |
| `python toolkit/scripts/layout.py image assert-png` | `--path <file>` | Exit 0 if file starts with PNG magic |

Typical QA after a designer preview: `image info` on the saved PNG; `match-preset` to confirm dimensions match the target `canvas-size` / preset.
