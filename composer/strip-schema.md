# Strip HTML layer contract

A strip is one plain HTML/CSS document holding every panel of a store
screenshot set. Free CSS is allowed *inside* blocks; the **structure** below is
mandatory, because two programs parse it:

- **`composer/render.mjs`** — exports the panel PNGs you ship.
- **`strip_editor`** — edits the file visually, in the same browser engine.

Both read this structure to find blocks. Break it and a block becomes
unselectable in the editor or invisible to the exporter.

---

## Document rules

1. One `<div class="strip">` root, laid out as a horizontal row of panels. The
   class matters: the exporter reads its `column-gap`.
2. Each panel is `<section data-panel="N">` (N is 0-based), sized to the
   **exact export dimensions** of the target preset — e.g. 1290×2796 for
   `appstore_iphone_portrait` — with `position: relative; overflow: hidden`.
3. Panels are screenshotted **individually**. Anything that appears to span
   panels must still export correctly panel by panel.
4. Reference assets **root-relatively**; the server root is the repo root:
   `/composer/device-frames/…`, `/datasource/screenshots/…`,
   `/datasource/images/…`.
5. **No external network resources** — no web fonts, no remote images. Anything
   not in the repo renders differently in the editor and the export, or fails
   outright in one of them.

## Required boilerplate

```html
<script type="module" src="/composer/device-frames.mjs"></script>
```

That single line is all a strip needs. The runtime sets
`window.__composerReady = true` once every device block has been built, and
`render.mjs` waits for it before capturing. A strip with no device blocks may
omit the script entirely.

Do **not** set `window.COMPOSER_CONFIG.framesRoot`. It defaults to `/composer`,
which is where the frame packs live. Older strips set it to `/web_ui/public`;
that path is aliased for compatibility, but new documents must not repeat it.

---

## Layer blocks

Every visual element directly inside a panel carries `data-layer`:

| Kind | Markup |
| --- | --- |
| text | `<div data-layer="text" data-role="title\|subtitle\|caption">…</div>` |
| device | `<div data-layer="device" data-device data-pack="…" data-pose="…" style="width:…">` |
| image | `<img data-layer="image" src="/datasource/…">` |
| decor | `<div data-layer="decor">…</div>` — shapes, blobs, cards, badges, glows; free HTML/CSS |

**Position blocks absolutely.** A statically positioned block cannot be moved by
writing `left`/`top`, so it arrives in the editor unusable. Overhanging a panel
edge is expected and encouraged — `overflow: hidden` crops it, and that cropping
is how the standard cropped-device look is built.

### Text blocks

`data-role` is one of `title`, `subtitle`, `caption`. One title and one subtitle
per panel; a caption only when it earns its place.

**A text block may contain text nodes and `<br>` — nothing else.** No `<span>`,
no nested `<div>`, no inline markup. Style the block itself instead. The editor
enforces this: the first time a human edits the text, the content is rebuilt as
text and `<br>`, and any inner markup is discarded silently.

### Device blocks

| Attribute | Required | Meaning |
| --- | --- | --- |
| `data-device` | yes | Marks the block for the runtime. Present with no value. |
| `data-pack` | yes | Frame pack id, e.g. `iphone_12_pro`. |
| `data-pose` | yes | Pose name from the pack's `frame.json`. |
| `data-screenshot` | no | Repo-root path to the screen image. Omit for a blank screen. |
| `data-fit` | no | `cover` (default) crops the image to the screen quad; any other value stretches it. |
| `data-screen-fallback` | no | Fill colour when there is no screenshot. Defaults to `#0c0c0a`. |

**The CSS `width` sets the scale. Never set a height.** Height follows the
pose's SVG viewBox aspect; writing one distorts the frame. This is the single
most common way to break a device block.

Pose viewBoxes differ enough that the same width gives very different phone
sizes — see **`composer/device-frames/README.md`** for each pose's box and a
starting width. Read it before sizing a device rather than guessing and
re-rendering.

Omitting `data-screenshot` is a legitimate design choice, not a failure: the
frame renders with a blank screen filled by `data-screen-fallback`. Prefer a
real capture when one exists.

### Image blocks

Plain `<img>`. Sources come from `/datasource/images/` (logos, textures,
illustrations) or `/datasource/screenshots/` (app captures). An `<img>` with no
`src` has zero intrinsic height and lays out invisibly, so always give it one.

### z-order

Paint order is DOM order unless a block sets `z-index`. When text deliberately
overlaps a device, give the text an explicit higher `z-index` — relying on DOM
order alone makes the intent invisible to anyone editing the file later.

---

## Skeleton

```html
<!doctype html>
<html><head>
<meta charset="utf-8">
<style>
  html, body { margin: 0; }
  .strip { display: flex; gap: 0; width: max-content; }
  .panel { position: relative; overflow: hidden; width: 1290px; height: 2796px; }
</style>
<script type="module" src="/composer/device-frames.mjs"></script>
</head><body>
<div class="strip">
  <section class="panel" data-panel="0">
    <div data-layer="text" data-role="title"
         style="position:absolute; left:95px; top:230px; width:1100px;">Your Life as a Book</div>
    <div data-layer="text" data-role="subtitle"
         style="position:absolute; left:95px; top:530px; width:1000px;">Flip through your memories</div>
    <div data-layer="device" data-device data-pack="iphone_12_pro" data-pose="isometric-left"
         data-screenshot="/datasource/screenshots/appstore_iphone_portrait/<id>.png"
         data-screen-fallback="#0c0c0a"
         style="position:absolute; left:220px; bottom:-320px; width:1400px;"></div>
  </section>
  <!-- panels 1..4 -->
</div>
</body></html>
```

---

## Render

```bash
node composer/render.mjs --strip output/strips/appstore_strip.html \
  --out output/strips/rendered --full
```

Exit 0 and a JSON summary. The output directory receives `panel<N>.png` per
panel, `strip.png` when `--full` is passed, and **`strip-data.json`** — every
block's measured geometry plus a `problems` list, extracted from the rendered
DOM. The problems also appear in the summary on stdout.

### `strip-data.json`

Read it rather than exploring it — the shape is fixed:

```jsonc
{
  "version": 2,
  "strip":  { "width": 6450, "height": 2796, "gap": 0, "panels": 5 },
  "panels": [
    {
      "index": 0, "width": 1290, "height": 2796,
      "layers": [                      // NOT "blocks"
        {
          "id": "text_0_1", "kind": "text", "z": 1,
          // panel-relative, top-left, in layout px — flat, not nested in a "rect"
          "x": 110, "y": 220, "width": 1080, "height": 277,
          // px beyond each panel edge; 0 when inside. Overhang is legal.
          "outside": { "left": 0, "top": 0, "right": 0, "bottom": 0 },
          "text": "Private By\nDesign", "role": "title",
          "font_size": 132, "font_family": "…", "color": "#0c0c0a",
          "align": "left", "weight": "700"
        }
        // device: pack, pose, screenshot, fit, screen_fallback, blank_screen
        // image:  src, natural_width, natural_height
        // decor:  children
      ]
    }
  ],
  "problems": [
    { "severity": "warning", "panel": 0, "layer": "text_0_1",
      "message": "text is clipped by the panel edge (60px past the right)" }
  ]
}
```

`severity` is `error` or `warning`. Every layer kind carries the same `id`,
`kind`, `z`, `x`, `y`, `width`, `height` and `outside`; the extra fields listed
above are per kind.

A **non-zero exit** means a device failed to build: a missing pack, an unknown
pose, or a screenshot that did not load. Those never produce a partial render.

Before rendering, a structural check costs nothing:

```bash
node composer/check-schema.mjs output/strips/appstore_strip.html
```

It reads the source text only — no browser — and catches the mistakes this
document describes.

To edit the result visually, open the same file in the editor:

```
cd strip_editor && npm run dev
http://localhost:4714/?strip=output/strips/appstore_strip.html
```

There is no import step and no conversion. The editor opens the file the
renderer just read, and saves it back in place.
