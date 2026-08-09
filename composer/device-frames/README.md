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

## Read the files, not this file

**The catalogue is whatever is on disk.** Packs get added, poses get deleted
when they do not look good, artwork gets retuned. So this README deliberately
does not list the packs, the poses, or their dimensions — a table here would
describe the repo on the day someone wrote it, and once did.

```bash
cat composer/device-frames/index.json                     # which packs exist
cat composer/device-frames/<pack>/frame.json              # which poses exist
grep -o 'viewBox="[^"]*"' composer/device-frames/<pack>/frame/<pose>.svg | head -1
```

Plain JSON and plain SVG; no tool required. The editor's pose dropdown is built
from `frame.json`, so what it offers is always current.

A pack may ship a single pose. That is a normal state, not an incomplete one.

### Which file owns which fact

| Fact | Source of truth |
| --- | --- |
| Which packs exist | `index.json` |
| Which poses a pack has | `frame.json` |
| **A pose's dimensions** | **the pose SVG's `viewBox`** |

That last row is not a detail. `frame.json` carries `viewWidth`/`viewHeight`
too, but they are a **fallback** — `device-frames.mjs` reads the SVG's `viewBox`
and only falls back to the JSON when it cannot. Those fields have been wrong
before: four poses once carried figures that disagreed with their artwork, one
of them by a third, and anything sized from the JSON came out visibly wrong
while looking correct on paper. Size from the `viewBox`.

## Sizing a device block

A device block's CSS **`width` sets the scale, and its height follows the pose's
SVG viewBox aspect.** Never write a height — see `composer/strip-schema.md`.

The consequence is that the *same* width gives very different phone sizes across
poses, because a rotated or tilted phone needs a wider viewBox to contain it. So
a width that suited one pose will usually be wrong for another. The rule that
travels between them:

> **CSS width ≈ 1.0–1.3 × the pose's viewBox width,** read from the SVG.

Below that the phone reads as small; above it, it dominates. A starting point to
tune by eye, not a constraint.

**If a pose looks wrong at a width that "should" work, re-read its `viewBox`
before adjusting by eye.** An earlier version of this file carried a
hand-written table of these numbers, and one row was wrong by a third — every
strip that trusted it rendered that phone far too small, and the error survived
because nothing re-checked the table against the artwork. Hence the rule above:
the number comes from the artwork at the moment you need it.

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
- With only one pose available, vary the composition instead: which side the
  device sits on, how large it is, how far it crops off which edge. Panels want
  rhythm; the pose is one way to make it, not the only one.

## Adding a pack

Drop a directory alongside the existing ones with the same shape and add it to
`index.json`. Paths inside `index.json` and `frame.json` are relative to the
frames root, so they begin `/device-frames/…` and carry no `/composer` prefix —
the root is supplied by `COMPOSER_CONFIG.framesRoot`, which defaults to
`/composer`.

Removing a pose is just deleting its SVG and its entry in `frame.json`. Nothing
else references poses by name, so nothing else needs updating — which is the
point of not listing them anywhere.
