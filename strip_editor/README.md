# strip_editor

Visual editor for **composer strip HTML**. The strip file is the single source of
truth: the editor renders it in Chromium — the same engine `composer/render.mjs`
exports with — so *what you edit is what ships*. No importer, no second
rendering engine, nothing to keep in sync.

```bash
cd strip_editor
nvm use          # 22.15.0
npm install
npm run dev      # http://localhost:4714
```

`web_ui` keeps port 4713, so both editors can run side by side.

## What it does

**Open** any strip under `output/strips/` or `composer/test/`, or create a blank
one (name, export preset, panel count). The document loads in a same-origin
iframe served at its repo path, so `/datasource/…` and `/composer/…` resolve
exactly as they do under `render.mjs` — including the device frames, which live
in `composer/device-frames/`.

**Select** by clicking the canvas or the layer tree; empty panel space selects
the panel. The inspector shows measured geometry beside the *authored* inline
style, which is how you tell "the file says this" from "the browser did that".

**Edit:**

| | |
| --- | --- |
| Geometry | Drag to move, handles to resize, arrows to nudge, or type exact numbers. Snaps to panel edges and centres; ⌥ suppresses it |
| Text | Double-click to edit in place, or use the inspector's copy box. Family, size, weight, line-height, letter-spacing, colour, align |
| Device | Pose picker, screenshot picker with upload, fit, screen fill colour, shadow presets |
| Image | Artwork picker with upload, `object-fit` |
| Decor | Background, border, radius, opacity, filter, transform |
| Panel | Background presets and raw CSS |
| Structure | Add title/subtitle/caption/device/image/decor, ⌘D duplicate, ⌫ delete, z-order, drag between panels |

**Undo/redo** (⌘Z / ⇧⌘Z) covers every edit type, one *gesture* at a time — a
diagonal drag writes `left` and `top` separately and a cross-panel drag adds a
structural command, but all of it reverts in a single press.

**Save** (⌘S) writes atomically with an mtime precondition. **Export** renders
panel PNGs through `render.mjs` into `output/strips/rendered/<strip>/`.

**The open strip lives in the URL** (`?strip=output/strips/x.html`), so a reload
returns you to the document rather than the picker, and Back / Forward move
between them. Unsaved edits are confirmed before either can discard them.

**While you work**, the file is watched on disk: if something else changes it the
editor reloads, or asks first when you have unsaved work. A green **live** chip
confirms the watcher is connected. An agent can claim the document via the mode
endpoint, which makes the canvas read-only until you take over.

Press **?** for the keyboard map.

## Things worth knowing

- **Blocks may overhang their panel** — `overflow: hidden` crops them, and that
  is how the cropped-device look is built. The editor never clamps a position,
  and snapping cannot reach a block that far out.
- **Drag a block into another panel to move it there.** It changes panel when
  its *centre* crosses, never on mere overlap — overlap is how a cropped device
  is built, so an overlap rule would reparent every deliberate overhang. The
  block keeps its on-screen position: its `left`/`top` are rewritten against the
  panel it landed in, and it is appended last, so it arrives on top.
- **Devices and text are width-only.** Device height follows the pose aspect
  ratio; text height follows its content. Neither is ever written to the file.
- **A new image block arrives with a placeholder**
  (`composer/placeholder.svg`). An `<img>` with no `src` has an intrinsic height
  of zero, so an empty one would insert at 600×0 — in the layer tree, invisible
  on the canvas. The placeholder is deliberately loud, and the inspector warns
  while it is still in place. It lives with the render engine rather than here
  because its path is written into the strip, and a strip should never depend on
  the editor that authored it.
- **Two image libraries, on purpose.** Device screens come from
  `datasource/screenshots/<preset>/` — bucketed because a phone screen has to
  match its export preset's aspect ratio. Image layers come from
  `datasource/images/`, which is flat and committed, because a logo or texture
  has no such contract and a strip that references one should render from a
  fresh clone.
- **Blank style fields mean inherit.** Clearing one hands the property back to
  the strip's stylesheet rather than freezing today's computed value.
- **Saves are surgical.** Moving one headline changes one line; the rest of the
  file, including `<head>` and your attribute line breaks, is untouched. The one
  exception is a panel whose *structure* you changed, which is re-emitted whole.

## Architecture notes

**One transform, one mapping.** The iframe lays out at natural size and is
scaled once; document coordinates map to screen coordinates by a plain
`× zoom`. P1's selection handles depend on that invariant — do not introduce
nested transforms or a second scaling stage on the stage surface.

**No editor artifacts in the strip DOM.** Blocks are identified through a
module-level registry (`src/editor/blockRegistry.ts`) mapping id → live element
reference, rebuilt on each document load. Selection writes nothing into the
strip, so there is nothing to strip out at save time and no way for an editor id
to leak into a committed file. Selection chrome is drawn in the *parent*
document above the scaled iframe, which also keeps handles and labels a constant
screen size at 15% zoom.

**Coordinates match the exporter — with one documented exception.** For text,
image and decor blocks the inspector's panel-relative `left`/`top` is computed
exactly as `render.mjs` computes it (`rect.left - panelRect.left`). Device
blocks differ: `strip-data.json` stores device `x`/`y` as the block *centre*
(a convention for the canvas importer), while the inspector shows the top-left,
because that is what the CSS `left`/`top` P2 writes actually means. Do not read
a bug into that difference.

**Saves splice text; they never re-serialize a document.** Two things are wrong
with serializing a DOM back to the file. The live DOM has been mutated by
`device-frames.mjs` (an injected `.composer-device-stage` subtree per device,
plus `aspect-ratio`/`overflow` written onto the block), so saving it would bake
derived markup into the file. And even re-serializing a *clean re-parse* is
destructive: the strips spread attributes over several lines for legibility, and
`outerHTML` collapses every one of them — moving a single headline would touch
most of the file. So `serializeStrip.ts` parses the pristine text only to locate
blocks, then splices the changed `style` attribute values into the original
string. `styleText.ts` edits at declaration level, preserving the author's
spacing and untouched declarations byte-for-byte. If a target cannot be located
unambiguously, the save is refused rather than guessed at.

**Anchors are preserved, not normalised.** A block authored as `right: -130px`
stays right-anchored, and drag deltas are inverted for it. Writing `left`
unconditionally would leave both declarations in the file and make the design
jump the next time the panel size changed. The authored anchor comes from the
*inline* style — computed style is useless here, because the browser resolves
`left` to a used pixel value even when the author only wrote `right`.

**Text markup is rebuilt, not repaired.** A text block may contain text nodes
and `<br>`, nothing else — but `contentEditable` inserts `<div>` wrappers on
Enter and pastes whatever markup was on the clipboard, fonts and colours
included. So every commit runs `sanitizeContent`, which reconstructs the markup
from scratch rather than trying to strip the bad parts out. This is also why
there is no "remove editor artifacts before save" pass anywhere: saves splice
*sanitized* content into the file, so a stray `contenteditable` attribute or a
browser-inserted wrapper in the live DOM is structurally incapable of reaching
disk.

**Attributes are edited at source level, not by re-emitting the tag.** Pose and
screenshot are attributes, and P4 has to change one, *add* one that does not
exist, and remove another. `htmlTags.ts` scans the opening tag in the source text
and returns real offsets, so setting an attribute rewrites only its value and
adding one appends before `>` — the author's line breaks between attributes
survive. Locating the tag needs an anchor: an attribute whose value appears
exactly once in the file, `style` first because on a strip it is effectively a
fingerprint. Short shared values like `class="rule"` are skipped automatically
because they match in several places, and if nothing is unique the save refuses.

**A device's artwork scale is derived, and goes stale.** `buildDevice` computes
`scale = containerWidth / viewBoxWidth` once and bakes it into the stage's
transform. `render.mjs` renders a document once so it never notices, but an
editor changes widths constantly — and the container would grow (`aspect-ratio`
keeps the height proportional) while the phone inside stayed its original size.
`rescaleDevice(el)` re-fits it from the stage's own viewBox width. It is
deliberately cheap — no refetch, no re-warp, because the homography maps into
viewBox space and uniform rescaling is exactly right — so it can run on every
pointer move. Every style write on a device block goes through it, including
undo and redo.

**Asynchronous edits need a second signal when they settle.** Views re-measure
when `revision` changes, and `revision` bumps when the command is *recorded* —
which for a device rebuild is before the work starts. `rebuildDevice` tears the
stage down first and then fetches, so that measurement lands on a half-dismantled
block and reports a perfectly good device as "did not build" — and nothing ever
re-measured, so the warning stuck forever. `touch()` announces the settled state
without recording a command, so the last reading is the true one. Anything that
mutates the DOM asynchronously has to end this way.

**Device edits are asynchronous by nature.** `device-frames.mjs` reads pose and
screenshot once at load and derives a homography from them; the DOM will not
update when those attributes change. `composer/device-frames.mjs` gained a
`rebuildDevice(el)` export (additive — `render.mjs` still only uses
`initDevices`) and exposes the runtime on `window.__composerDevices`, because
module exports are not reachable across realms and re-importing the module in the
parent would bind it to the wrong `document`.

**Cross-realm `instanceof` is always false.** The editor runs in the parent
window; the strip runs in the iframe. Its elements are instances of the
*iframe's* `HTMLElement`, so `child instanceof HTMLElement` in editor code
rejects every one of them. Use `nodeType === 1`, or a constructor reached through
`iframe.contentWindow`. This bit `emitPanelContent`, where it silently filtered
out every child and would have saved a restructured panel **empty**; the jsdom
test missed it because it assigned the strip realm's constructors to
`globalThis`, which the browser never does. Realm-crossing tests now build two
separate jsdom windows and assert up front that they really are distinct.

**Watching and locking answer different questions.** The watcher asks "has the
file changed underneath me?" — a fact about the filesystem, true regardless of
who wrote it, so an agent, a `git checkout` and a hand edit are all handled
identically. The mode lock asks "whose turn is it?" — a convention that only
works if the other party opts in, and exists so an agent turn and a human turn
are not interleaved on one document. Neither substitutes for the other.

**The watcher follows the directory, not the file.** Atomic saves replace the
inode, so a watch bound to the file goes deaf the moment anyone saves properly —
including this editor. Watching the parent and filtering by name survives that.
Events carry the mtime, which is also how the editor recognises its own save
(an mtime it already holds) without any echo-suppression bookkeeping on the
server.

**Undo and redo are the same function.** Every command carries both sides of
its change — `before`/`after` for properties, `beforeIndex`/`afterIndex` for
structure — so undoing and redoing differ only in which side they aim at. There
is no separate inverse-command type to keep in step. A cursor over the log marks
how much is applied; `log[0…cursor)` is the document, the rest is redoable until
a new edit truncates it. Undo/redo write the DOM **directly**, never through
`mutate`: recording them would append commands and the log would grow instead of
rewinding.

**Structural undo carries the element, not its markup.** Undoing a delete by
re-parsing a saved snapshot would produce a *different* element object, losing
the node's identity along with any pending edits keyed to it. A removed element
is detached, not destroyed, so the command holds the reference and puts the very
same element back. Positions are child indices, with `null` meaning "not in the
panel" — which makes insert (`null → n`), delete (`n → null`) and reorder
(`n → m`) one operation.

**The save point can become unreachable.** Undo below a save and then make a new
edit, and the command that held the save point is discarded with the redo
branch. Clamping `savedAt` would make the document read as *clean* while
differing from disk, so it is marked unreachable instead and the document stays
dirty.

**One gesture is one entry in the log.** A drag emits a command per pointer
move — hundreds for a single move. `record` folds commands that share a
`gesture` label and a target into one, keeping the *earliest* `before` and the
latest `after`. Without it the unsaved counter reads as hundreds of changes for
one drag, and undo would step back a pixel at a time. The scan stops at the
first command from a different gesture (so an edit between two nudges keeps them
separate) and never reaches behind `savedAt` (so a gesture spanning a save
cannot rewrite an already-saved command). Folding at save time was already
correct — this is about the log being an honest record of what the human did.

**Node ids are opaque — never branch on their prefix.** A layer's id is
`layer:0:3` when it came from the file and `new:1` when the editor created it.
Hit-testing used to accept a match only if the id started with `layer:`, which
silently excluded every editor-created block: clicking a freshly added block
resolved to its *panel*, so it could not be selected, dragged, duplicated or
deleted from the canvas. Ask the registry whether an element is known; do not
read meaning into the string. (`isPanelNodeId` is the one sanctioned prefix test,
and only because panels are never editor-created.)

**Identity is not position.** Node ids look positional (`layer:0:3`) and are
assigned that way at load, which is what lets a live block resolve to the same
block in a clean parse of the file. But once blocks can be inserted and deleted,
position stops being identity — deleting the second block would renumber every
one after it, and pending edits keyed by id would silently retarget a different
block. So an element keeps the id it was first given for as long as the document
stays loaded, held in a `WeakMap`, and editor-created blocks get ids from a
`new:` namespace that cannot collide with a file position.

**Structural changes re-emit one panel; everything else still splices.** There is
no honest way to express "insert this element between these two" as a
source-offset splice without reimplementing an HTML printer for someone else's
formatting. So a panel whose child list changed is rewritten wholesale from the
live DOM — and the per-property splices for blocks inside it are *skipped*, or
the same region would be written twice. Panels you did not restructure stay
byte-identical, as does the head. The cost is that comments inside a
restructured panel are lost and its indentation is normalised.

**Re-emission needs to know what the runtime added.** `device-frames.mjs` now
records which inline properties it derived (`__composerDerivedProps`, a JS
expando that cannot serialize into HTML), so `cleanClone` removes exactly those
and leaves authored styles alone. Guessing would either bake one pose's
`aspect-ratio` into the file or strip a `position` the author actually wrote.

**Snapping bends the "never auto-correct" rule, deliberately and visibly.** That
rule is about the editor quietly moving a legal position behind the author's
back — the canvas editor's safe-zone clamp. Snapping happens only inside a
gesture the human is making, draws a guide showing exactly what it did, and is
suppressed by holding ⌥. Its threshold is in **screen** pixels divided by zoom,
not document pixels: six document pixels is under one screen pixel at fit-width
(unhittable) and a twelve-pixel magnet at 200%. What should stay constant is the
felt distance.

**Never auto-correct layout.** Blocks may deliberately overhang a panel
(`overflow: hidden` crops them — that is the cropped-device look). The editor
must not clamp positions, and layout policy belongs to the validator, not to
event handlers. This is the lesson of the canvas editor's safe-zone clamp.

**Trust the SVG viewBox, not `frame.json`'s view size.** Some pack entries have
stale `viewWidth`/`viewHeight` (`iphone_12_pro/tilted-front` claims 1282×1485;
the SVG is 785×1401). `composer/device-frames.mjs` already handles this; the
editor just loads that runtime as-is rather than reimplementing it.

## Server API (`vite-plugin-editor-api.ts`)

| Route | Status |
| --- | --- |
| `GET /__api/strip-editor/files` | ✅ list strips (name, dir, mtime, size) |
| `GET /__api/strip-editor/file?path=` | ✅ read strip HTML as JSON |
| `GET /__api/strip-editor/raw?path=` | ✅ serve the strip document to the iframe |
| `GET\|POST /__api/strip-editor/mode` | ✅ endpoint live (same shape as web_ui's designer mode); banner + take-over UI is P6 |
| `PUT /__api/strip-editor/file?path=&expectMtime=` | ✅ atomic write, 409 on stale mtime |
| `GET /__api/strip-editor/watch?path=` (SSE) | ✅ directory watch, debounced, mtime-carrying |
| `POST /__api/strip-editor/export?path=` | ✅ spawns `render.mjs`, returns a JSON summary |
| `POST /__api/strip-editor/validate?path=` | dropped — see P6 above |
| `GET\|POST /__api/strip-editor/screenshots` | P4 |
| `GET\|POST /__api/strip-editor/images` | ✅ |
| Static `/datasource/*`, `/composer/*`, `/output/*` | ✅ |
| Alias `/__api/datasource/*` → `/datasource/*` | ✅ |
| Alias `/web_ui/public/device-frames/*` → `/composer/device-frames/*` | ✅ |

Every path is jailed to the repo root; strip reads are further restricted to
`.html` files under `output/strips/` and `composer/test/`.

## Known gaps

- **Validate has no backend.** The plan's `toolkit/scripts/designer.py
  validate-rules --tier safety` was removed from the repo in commit `fa332ea`
  ("remove toolkit - restructure agent and skill"). The Validate button and its
  endpoint are deferred; we decide at P6 whether to restore the toolkit or drop
  the feature.
- **`composer/test/bio-strip.html` has dead screenshot references.** Its five
  `data-screenshot` UUIDs are no longer in `datasource/screenshots/` (that
  directory is gitignored and rotates). Those device blocks will render with a
  red outline and appear in the editor's device-error toast. Use
  `output/strips/appstore_strip.html` — which uses `data-screen-fallback`
  colours and resolves fully — as the reference strip until bio-strip is
  repointed.
- **Zoom floor is 4%, not the planned 25%.** A five-panel App Store strip is
  6450 px wide; fit-width lands near 15%, so the range had to start lower.
- **Hit-testing is covered by tests that add a block first.** The earlier suite
  only ever hit-tested blocks loaded from a file, which is why the `new:` id gap
  went unnoticed.
- **New blocks go into the selected block's panel** — the first panel when
  nothing is selected. The view scrolls to whatever was just created, so a block
  added to a panel you were not looking at does not read as a block that never
  appeared.
- **Comments inside a restructured panel are lost**, and that panel's
  indentation is normalised. Other panels are untouched.
- **No gradient stop editor.** Panel backgrounds offer presets and a raw CSS
  field. The strips' backgrounds are hand-tuned multi-stop radials tied to each
  palette, and a generic stop UI would flatten them on first touch.
- **Nested blocks are not separately selectable.** A `data-layer` element inside
  another one belongs to its parent block. Neither test strip nests, and
  `render.mjs` treats them flatly, so this only matters if a future strip nests
  deliberately.

## Verification history

Each phase was checked against the plan's acceptance criteria before moving on.
Kept because several entries record bugs that were silent, and the reasoning is
easier to re-derive from the check than from the fix.

## Verified for P0

- `tsc -b` and `vite build` clean.
- Dev server: app index, all API routes, and every repo-root static prefix
  return correct status and MIME.
- Path jail rejects `../` traversal, files outside the allowed strip dirs, and
  non-`.html` paths.
- Every asset referenced by `output/strips/appstore_strip.html` — including all
  eight `iphone_12_pro` pose SVGs and `frame.json` — resolves 200 through the
  editor's static aliasing.
- Geometry model agrees with the exporter: 5 panels × 1290 px, gap 0 →
  6450×2796, matching `workspace_width`/`workspace_height` in
  `output/strips/rendered/strip-data.json`.

## Verified for P1

`indexStrip` / `readBlock` were run against the real strip documents under jsdom
(the actual compiled modules, not a reimplementation):

- **bio-strip.html** — 5 panels, 23 blocks indexed; **appstore_strip.html** —
  5 panels, 26 blocks. Both counts equal `querySelectorAll('[data-panel]
  [data-layer]')`, so no block is unreachable and none is double-counted.
- Every DOM block resolves through the hit-test walk-up to exactly one indexed
  owner; ids are unique and DOM order is contiguous per panel.
- `readBlock` returns a kind-specific section for all 49 blocks; every device
  block has both `pack` and `pose`; every text block has a `data-role`.
- Panel readouts' `layerCount` matches the indexed layer count per panel.
- `pose-test.html` (non-conformant harness page: `data-panel="poses"`, bare
  `data-device` with no `data-layer`) indexes all 8 pose blocks and labels the
  panel by name rather than crashing — the block selector deliberately matches
  `render.mjs`'s `data-layer || data-device` tolerance.

## Verified for P2

Serializer, run against the real files:

- **Zero-edit save is byte-identical** for both strips (7860 / 8679 bytes).
- **A single move changes exactly one line** and nothing else — line counts
  match, and untouched declarations on the same element keep their original
  spacing:
  `left:110px; top:190px; width:1040px;` → `left:150px; top:165px; width:1040px;`
- `patchStyleText` unit cases: edit in place, append a missing property using the
  file's own colon spacing, remove a declaration, and *not* split on a semicolon
  inside `url("a;b.png")`.
- Device `se`-resize emits `width` only — never `height`.
- Right-anchored blocks invert correctly: `right: -330px` with `dx +50` becomes
  `right: -380px`, and the declaration written is `right`, not `left`.

Save endpoint, against a live dev server on a scratch copy:

- Correct precondition → 200, and the bytes on disk match the bytes sent.
- Stale precondition → 409 with both mtimes, file untouched.
- Empty body, `../` traversal, and a path outside the allowed dirs → 400.
- No `.tmp` files left behind.

Not verifiable headlessly in this environment (Chromium download is blocked):
the in-browser render, the drag interaction itself, and the measured pixel values
— jsdom has no layout, so `getBoundingClientRect` returns zeros and the geometry
tests above use authored values instead of measured ones.

## Verified for P3

- **`sanitizeContent`** against what `contentEditable` actually produces:
  `Line one<div>Line two</div>` → `Line one<br>Line two`;
  `<div>First</div><div>Second</div>` → `First<br>Second` (no stray leading
  break); `<span style="color:red;font-size:99px">` and `<font face="Comic
  Sans">` keep their words and lose the styling; `<` `&` `>` escape correctly;
  non-breaking spaces become real spaces; `<br/>` normalises to `<br>`.
- **`contentEquivalent`** ignores the indentation `contentEditable` reflows on
  focus — without it, merely clicking into a block would mark the file dirty —
  while still distinguishing `A<br>B` from `A B`.
- **Text ↔ plain-text conversion** round-trips, including `<` and `&`.
- **Content splice** on both real strips: zero-edit save byte-identical;
  retyping a title rewrites only that element (every other block byte-identical,
  node count unchanged); a style change and a content change on the *same*
  element both land.

**The commit baseline is not the live DOM.** `applyContent` decides whether
anything changed by comparing against a baseline, and a `contentEditable`
session cannot use the element's current `innerHTML` for that: the user typed
straight into the element, so at commit time it already holds the new text and
the comparison is the edit against itself. The session passes the content it
opened with instead. Getting this wrong is silent — the canvas shows the edit,
no error appears, and Save simply stays greyed out.

Three bugs this testing caught, worth knowing about because they were silent:
the source scanner treated a style attribute's closing quote as *opening* a new
quoted region, so no text block could ever be located; and the first
browser-inserted `<div>` after existing text produced no line break, so
`Line one⏎Line two` saved as `Line oneLine two`. And canvas text edits never
marked the document dirty, for the baseline reason above — covered now by a
regression test that types into the DOM the way a browser does, then asserts the
command is recorded, the document is dirty, and the new copy reaches the file.

## Verified for P4

Attribute splices, on both real strips:

- Zero-edit save still byte-identical.
- Replacing `data-pose` changes exactly one line.
- Adding `data-screenshot` where the block has none — the case
  `appstore_strip.html` actually presents, since its devices use fill colours —
  inserts cleanly in one line.
- Removing an attribute takes its leading whitespace with it, leaving no gap
  before `>`.
- A style change, two attribute changes and a content change applied in one pass
  all land, with the node count unchanged.
- The tag scanner reads a real multi-line device tag correctly, including the
  valueless `data-device`.

Pose geometry, all eight `iphone_12_pro` poses:

- The warped screenshot's four corners land on the pose's screen quad with
  **0.0000px** error, and every pose has an `#screen` path to clip against.
- Cover-crop matches the quad aspect exactly (no distortion) and never exceeds
  the source image.
- Incidentally: **four** poses have stale `viewWidth`/`viewHeight` in
  `frame.json`, not just the one previously documented — `tilted-right`,
  `angled-right`, `angled-left` and `tilted-front`. Trusting the SVG viewBox is
  load-bearing, not a nicety.

`composer/device-frames.mjs` still imports cleanly in Node and `render.mjs` still
runs, so the additive change did not disturb the export path.

## Verified for P5a

Run against `appstore_strip.html` with the real modules under jsdom:

- **Identity holds.** Deleting `layer:0:0` leaves `layer:0:2` resolving to the
  same element, while DOM order renumbers underneath.
- **`cleanClone`** removes an injected `.composer-device-stage` subtree and the
  three derived inline properties, and keeps the authoring attributes and the
  authored width.
- **Templates conform**: every kind is absolutely positioned, text carries
  `data-role`, device carries `data-device`/`data-pack`/`data-pose` and **no
  height**, image is an `<img>`.
- **Insert → save** adds exactly one node; panels 0, 1, 3 and 4 stay
  byte-identical while only panel 2 is re-emitted; no runtime markup reaches the
  file.
- **Duplicate, bring-to-front and delete** each land correctly in the saved file
  (5 → 6 → reordered → 5 device blocks).
- **No double-writes**: a structural change plus a style edit on a pre-existing
  block in the same panel writes that style exactly once.
- **Blank template** is schema-conformant (one panel at 1290×2796,
  `position:relative; overflow:hidden`, runtime script and `COMPOSER_CONFIG`),
  and a title + subtitle + device design built entirely through the editor saves
  correctly into it.

## Verified for P5b

The plan's acceptance case, run against `appstore_strip.html`:

- A **20-step mixed run** — moves, a retype, two device attributes, a resize,
  decor styling, two inserts, a duplicate, two reorders, a delete, a panel
  background, and nudges — records exactly 20 undoable steps.
- **Undo everything → byte-identical to the file on disk.** Redo everything →
  identical to the edited document. Undo everything again → byte-identical
  again.
- Dirty state is honest across the save point: clean at it, dirty below it,
  clean again on redoing back, and **still dirty** when a new edit discards the
  branch that held it.
- A new edit after undoing discards the redo branch and redo becomes
  unavailable.

## Verified for P7

Snap maths, in isolation:

- Snaps whichever of the block's own left/centre/right (top/middle/bottom) is
  nearest a panel line, deciding each axis independently.
- Right and bottom edges snap, not just left and top; centre lines work.
- Nothing within tolerance is left untouched, and no guides are drawn.
- **Deliberately cropped blocks are never grabbed** — the real bleed positions
  (`-40`, `-330`, right-anchored overhang) are far outside any tolerance.
- Threshold scales with zoom: at 15% a 30px gap snaps (40px tolerance), at 100%
  the same gap does not (6px). A fixed document-px threshold would be 0.9px at
  fit-width — the bug this design avoids.
- Tolerance 0 is a clean no-op, which is how ⌥ disables it.

## Verified for P6

Against a live dev server on a scratch copy:

- The watch stream opens with the file's current mtime, fires on an external
  `touch`, **and fires on an atomic tmp+rename save** — the case a file-bound
  watch would miss entirely.
- The mtime a save returns is exactly the one the stream then reports, which is
  what lets the editor ignore its own writes instead of reloading a moment after
  saving.
- Mode round-trips human → agent (with holder) → human; an invalid mode is
  rejected with 400.
- `../` traversal and paths outside the allowed strip dirs are rejected by both
  `watch` and `export`.
- `export` spawns `composer/render.mjs` with the right arguments and surfaces
  the renderer's own error verbatim when it fails.

Not verifiable here: a **successful** export — this Linux sandbox has no
Chromium, and the download is blocked. On your Mac it should render normally;
worth confirming once.

**Worth doing by hand once:** move a title, save, then
`node composer/render.mjs --strip <path> --out output/strips/rendered --full`
and confirm the PNG moved by the amount the inspector reported, and that
`git diff` touches only that block's style attribute. Then retype a headline and
check the same.

Note that the P0 note about `bio-strip.html`'s missing screenshots still applies:
its device blocks render red-outlined, which does not affect text editing but
does mean it is not the strip to judge visual fidelity on.
