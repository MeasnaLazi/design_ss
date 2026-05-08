# Vision / image toolkit reference

Conceptual guide for **image QA** on screenshot previews and assets using the publisher toolkit’s Pillow-based helpers (**`layout image`** — command tables are only in **`layout-reference.md`**).

**Layout CLI tables** (including **`layout image`**): **`layout-reference.md`**. **Live canvas** (`designer.py`, preview PNGs): **`web-ui-reference.md`**.

## Scope

- **Metadata** — dimensions, mode, format from files on disk.
- **Decode** — base64 PNG payloads (e.g. pasted or piped text) to bytes / optional save.
- **Geometry** — resize (max edge), crop to an axis-aligned rectangle (Pillow uses **exclusive** `right` / `bottom` on the crop box).
- **Color** — mean hex for a rectangle; heuristic dominant colors (quantize).
- **Preset checks** — compare raster dimensions to a resolved artboard preset (`canvas-size` / `preset-id` rules match **`store-json`** / **`list-presets`**).
- **Sanity** — assert file begins with PNG magic bytes.

## Conventions

- Cropping uses integer **`left`**, **`top`**, **`right`**, **`bottom`** with **`right`** and **`bottom`** **exclusive** (same as Pillow’s box).
- After saving a preview PNG from the workflow, typical checks are: confirm dimensions vs target preset, inspect dominant/region colors if relevant, optionally resize or crop for downstream use.
