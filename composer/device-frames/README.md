# Device frame packs

Pose artwork and screen geometry for device blocks. `device-frames.mjs` reads
these at render time; `strip_editor` reads the same files for its pose picker.
Served at `/composer/device-frames/**` by both the export server
(`composer/render.mjs`) and the editor.

```
index.json                     the pack catalogue
<pack>/frame.json              pose list: name, description, framePath, viewWidth, viewHeight
<pack>/frame/<pose>.svg        the artwork, one file per pose
```

## Sizing a device block

A device block's CSS **`width` sets the scale, and its height follows the pose's
SVG viewBox aspect.** Never write a height — see `composer/strip-schema.md`.

The consequence is that the *same* width gives very different phone sizes across
poses, because a rotated phone needs a wider viewBox to contain it. A useful
rule of thumb:

> **CSS width ≈ 1.0–1.3 × the pose's `viewWidth`.**

Below that the phone reads as small; above it, it dominates. These are starting
points to tune by eye, not constraints.

## iphone\_12\_pro

Figures are read from `composer/device-frames/iphone_12_pro/frame.json` — that
file is the source of truth, so check it rather than hand-editing this table:

```bash
cat composer/device-frames/iphone_12_pro/frame.json
```

| Pose | viewBox | Reads as | Starting width |
| --- | --- | --- | --- |
| `front` | 772×1571 | centred hero, crop the bottom | 950–1100px |
| `angled-left` / `angled-right` | 669×1591 | tall edge device, crop top or side | 650–850px |
| `tilted-left` / `tilted-right` | 1041×1418 | mid-size accent | 1100–1400px |
| `isometric-left` / `isometric-right` | 1282×1485 | dynamic hero, crop a corner | 1300–1600px |
| `tilted-front` | 1282×1485 | subtle depth, near-front | 1300–1600px |

`tilted-front` shares isometric's viewBox despite looking far more frontal —
the box is sized for the widest pose in its group. An earlier version of this
table recorded it as `785×1401` and recommended 900–1050px, which renders the
phone roughly a third too small. If a pose ever looks wrong at a width that
"should" work, check `frame.json` before adjusting by eye.

## Craft notes

- **Cropping devices at panel edges is encouraged** — top, bottom or side. It is
  the most common pattern in professional store screenshots. Panels are
  `overflow: hidden`, so position with negative offsets.
- Give devices a `filter: drop-shadow(...)` tuned to the background: soft and
  large on light fields, darker or a brand-colour glow on dark fields.
- `data-fit="cover"` (the default) crops the screenshot to the screen aspect, so
  prefer captures whose key content is centred.
- Omitting `data-screenshot` renders a blank screen filled with
  `data-screen-fallback` — an intentional empty device, not a failure.

## Adding a pack

Drop a directory alongside `iphone_12_pro` with the same shape and add it to
`index.json`. Paths inside `index.json` and `frame.json` are relative to the
frames root, so they begin `/device-frames/…` and carry no `/composer` prefix —
the root is supplied by `COMPOSER_CONFIG.framesRoot`, which defaults to
`/composer`.
