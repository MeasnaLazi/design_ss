# Vision / image toolkit reference

Conceptual guide for **image QA** on screenshot previews and assets using the publisher toolkit’s Pillow-based helpers (**`layout image`** — command tables are only in **`layout-reference.md`**).

**Layout CLI tables** (including **`layout image`**): **`layout-reference.md`**. **Live canvas** (`designer.py`, preview PNGs): **`web-ui-reference.md`**.

## Scope

- **Metadata** — dimensions, mode, format from files on disk.
- **Decode** — base64 PNG payloads (e.g. pasted or piped text) to bytes / optional save.
- **Geometry / regions** — **`region-hex`** samples an axis-aligned rectangle (Pillow box: **exclusive** `right` / `bottom`).
- **Color** — mean hex for a rectangle; heuristic dominant colors (quantize).
- **Preset checks** — compare raster dimensions to a resolved artboard preset (`canvas-size` / `preset-id` rules match **`store-json`** / **`list-presets`**).

## Conventions

- **`region-hex`** rectangle args are integer **`left`**, **`top`**, **`right`**, **`bottom`** with **`right`** and **`bottom`** **exclusive** (same as Pillow’s box).
- After saving a preview PNG from the workflow, typical checks are: confirm dimensions vs target preset, inspect dominant/region colors if relevant, optionally resize or crop for downstream use.
