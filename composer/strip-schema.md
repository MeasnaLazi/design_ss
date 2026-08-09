# Strip HTML layer contract

## Where a strip lives

A strip is a **folder**, and everything the design references lives inside it:

```
strips/<app-name>/
  strip.html         the document — every panel of the set
  images/            artwork for image layers: logos, textures, generated art
  screenshots/       device screen captures, copied from input/
  rendered/          panel PNGs + strip-data.json — gitignored, regenerable
```

The folder is the output of a pipeline: `input/` (the brief and the app's
captures) → design → one strip folder, named from the app. See
[`input/README.md`](../input/README.md). Copy and app facts stay in `input/`;
the strip folder holds the design and everything it renders from, and is
gitignored like any other build output.

Nothing is shared between strips. Duplicating a capture across two designs is
the intended cost: it buys a folder you can move, copy or hand to someone with
no hidden dependency on a library elsewhere in the repo. `rendered/` is the one
exception, and only because it can always be rebuilt.

`screenshots/` is flat — no export-preset buckets. A strip's panels are all one
export size, so the preset is a property of the strip; there is nothing for a
bucket to disambiguate.

---

A strip document is one plain HTML/CSS file holding every panel of a store
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
   `/strips/<name>/images/…`, `/strips/<name>/screenshots/…`,
   `/composer/device-frames/…`.

   Root-relative, not relative, even though the assets sit beside the document.
   The editor serves the strip through `/__api/strip-editor/raw?path=`, so a
   relative `images/logo.png` would resolve against the API path — broken in the
   editor, fine in the export. That is exactly the disagreement this contract
   exists to prevent.
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
| image | `<img data-layer="image" src="/strips/<name>/images/…">` |
| decor | `<div data-layer="decor">…</div>` — shapes, blobs, cards, badges, glows; free HTML/CSS |
| group | `<div data-layer="group">…</div>` — a container whose children are themselves layers |

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
sizes, so read the pose SVG's **`viewBox`** before sizing a device rather than
guessing and re-rendering — a useful starting point is width ≈ 1.0–1.3 × the
viewBox width. Read it from the artwork, not from `frame.json`'s `viewWidth`:
the runtime scales to the `viewBox`, and those JSON fields are a fallback that
has been stale before.

`frame.json` *is* the list of poses that exist. Packs and poses change — poses
get deleted when they do not look good — so do not assume a pose name from
another strip is still there.

Omitting `data-screenshot` is a legitimate design choice, not a failure: the
frame renders with a blank screen filled by `data-screen-fallback`. Prefer a
real capture when one exists.

### Image blocks

Plain `<img>`, sourced from this strip's own `images/` folder — logos, textures,
illustrations, and anything generated for the design. An `<img>` with no `src`
has zero intrinsic height and lays out invisibly, so always give it one.

**An `<img>` belongs in an `image` block, not a `decor` one.** A decor block is
free HTML, so `<img data-layer="decor">` is legal and exports correctly — but
the editor routes its inspector off `data-layer` and will offer background and
border, with no `src` field, no library picker and no `object-fit`. The one
thing you want to change about a picture becomes the one thing you cannot.
`check-schema` warns about it.

### Group blocks

A group holds other blocks. Its children carry `data-layer` like any other
layer, appear indented under it in the editor's layer tree, and are selected
from there or by alt-clicking on the canvas. Clicking the group on the canvas
selects the *group*, so dragging a badge moves the badge rather than sliding its
icon out of it.

**Group versus decor is a question about the parts, not the look.** Both can
draw a pill with an icon and a label in it. Decor is opaque by contract — free
HTML/CSS, and the editor will not look inside — so use it when the contents are
one indivisible piece of decoration. Use a group when the parts are content
someone will want to change: swap that icon, retype that label.

```html
<div data-layer="group" class="chip" style="position:absolute; left:95px; top:790px;">
  <img data-layer="image" src="/strips/<name>/images/icon.png" style="width:44px; height:30px;">
  <div data-layer="text" data-role="caption">AI-assisted rewrite</div>
</div>
```

Two rules follow from children being layers:

- **Every direct child of a group needs `data-layer`** — the same rule as a
  panel's children, for the same reason. An unlabelled one renders and is
  unselectable. `check-schema` errors on it.
- **A group's children need not be absolutely positioned.** This is the one
  exception to *position blocks absolutely*: when the group lays its children
  out (flex or block), `left`/`top` are not what moves them, and static is
  correct. A statically positioned child gets no drag handles in the editor —
  change the group's `gap`, `padding` or direction instead, or give the child
  `position: absolute` to place it yourself against the group's box.

**Sizing a group: hug or fixed, per axis.** A group with no authored `width`
takes its width from its children, their `gap` and its `padding` — so that is
what you change to resize it; there is no edge to drag while the browser is
computing one. Writing an explicit `width` takes the decision away from the
children and makes the box yours. Mixed is common and correct: a badge with a
fixed width that still grows in height to fit a second line of label. In the
editor, dragging a handle switches *that axis* to fixed and leaves the other
hugging.

A child is **resizable even when it is not movable**. A child in flow is
`position: static`, so `left`/`top` do nothing — but `width` and `height` apply
normally, which is how the icon above gets its 44×30. The editor reflects that:
such a child keeps the handles that grow away from its origin (right, bottom,
bottom-right) and loses the ones that would have to move it. Dragging the west
edge means "hold the right edge, move the left one", which needs a `left` the
browser ignores.

Geometry inside a group is **group-relative**: a child's `left`/`top` resolve
against the group, and the editor's inspector says so. That only holds while the
group is positioned; a `position: static` group establishes no containing block,
and the browser resolves its absolute children against the panel instead.

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
    <div data-layer="device" data-device data-pack="iphone_12_pro" data-pose="front"
         data-screenshot="/strips/<name>/screenshots/<file>.png"
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
node composer/render.mjs --strip strips/<name>/strip.html --full
```

Exit 0 and a JSON summary. Output defaults to `rendered/` beside the strip, and
receives `panel<N>.png` per panel, `strip.png` when `--full` is passed, and
**`strip-data.json`** — every block's measured geometry plus a `problems` list,
extracted from the rendered DOM. The problems also appear in the summary on
stdout. Pass `--out <dir>` to put them somewhere else.

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
        // group:   children — and each child is listed as a layer in its own right
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
node composer/check-schema.mjs strips/<name>/strip.html
```

It reads the source text only — no browser — and catches the mistakes this
document describes.

To edit the result visually, open the same file in the editor:

```
cd strip_editor && npm run dev
http://localhost:4714/?strip=strips/<name>/strip.html
```

There is no import step and no conversion. The editor opens the file the
renderer just read, and saves it back in place.
