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

> **A dominant device is 0.85–1.05 × the *panel* width.**
> The viewBox multiple is the cross-pose check, not the primary number.

**Size against the panel, not the artwork.** The viewBox multiple tells you how
big the phone is relative to its own drawing; it is blind to the box it is going
into, and that is how side margins appear. Worked through for
`appstore_iphone_portrait` (1290×2796) and the `front` pose:

| × panel width | px | × viewBox | side margin | device covers |
| --- | --- | --- | --- | --- |
| 0.60 | 774 | 1.00 | 40% | 34% |
| 0.74 | 955 | 1.24 | 26% | 51% |
| 0.85 | 1096 | 1.42 | 15% | 68% |
| 0.90 | 1161 | 1.50 | 10% | 76% |
| 1.00 | 1290 | 1.67 | 0% | 94% |
| 1.10 | 1419 | 1.84 | bleeds | crops 92px |

Read the third column: **the old "1.0–1.3 × viewBox" rule lands at 0.60–0.78 of
panel width for this preset**, which guarantees 22–40% of the panel is empty
column either side of the phone. That is not a taste decision, it is arithmetic,
and it is why a strip can pass every other check and still look half-finished.

Note that a device at *full panel width* is 2625px tall against a 2796px panel —
so it fits with room to spare, no crop required. Going past ~1.05 starts
cropping the sides, which is a legitimate and common look.

Below 0.8 the phone reads as small and the panel reads as empty; above 1.05 it
dominates and must crop. Starting points to tune by eye, not constraints.

**That range is for one device leading the panel.** Scale down when the device
is not the subject — roughly 0.7–1.0× when it shares the panel with type of
equal weight, 0.4–0.7× when it is one element among several. And for **two
devices in one panel, 0.6–0.9× each, overlapping by a third or more**: applying
the dominant range twice asks for about 2.6 phone-widths inside a panel a little
over 1.7 wide, and they collide.

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
