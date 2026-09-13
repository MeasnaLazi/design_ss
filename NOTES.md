# Non-obvious logic

Things in this repo that look like mistakes until you know why. Each entry says
what you will see, why it is that way, and what breaks if you "fix" it.

If you are about to change something here, read its entry first. Most of these
were written after the thing was changed once and had to be changed back.

---

## The screen clip comes from the SVG. `corners` only warps.

`composer/device-frames.mjs` reads the `#screen` outline out of the pose SVG and
clips the screenshot with it. It does **not** build a clip from `frame.json`
`corners`, and there is deliberately no fallback if `#screen` cannot be read —
it throws, which red-outlines the block and stops the export.

The contract between the two:

> `frame.json` `corners` is a **warp target** in viewBox space that must fully
> **contain** the `#screen` aperture. The clip always comes from the SVG.

Two sources, two jobs. `corners` decides how the screenshot is stretched; the
aperture decides what is visible.

There used to be a fallback — a rounded quad synthesised from `corners` with a
hardcoded radius of 30. Because the old extractor only read a `<path>`'s `d`
attribute, it fired for every `<rect>`-based `#screen`, which is half the
catalogue, and the runtime clipped a shape nobody had measured. `mask_analysis`
converted the rect and showed the real aperture, so the measuring tool and the
shipping renderer disagreed for three of six packs. That is the bug this rule
exists to prevent; do not reintroduce a "sensible default" shape.

`node composer/check-schema.mjs --packs` enforces the containment half and
prints the margin per pose. Run it after editing any `frame.json`.

## `mask_analysis/composer` is a symlink, on purpose

It points at `../composer`. It is not a stray copy and not a mistake.

`mask_analysis/pipeline/svg-parser.js` imports `../../composer/screen-geometry.mjs`
— the module it shares with the renderer, which is the whole reason the two
tools agree. A static server rooted at `mask_analysis/` cannot see above itself,
so that import 404s. The symlink makes the path resolve under either server
root, so `cd mask_analysis && python3 -m http.server 8080` keeps working.

Delete it and the tool fails **silently**: the module script is discarded whole,
so the page still renders and the Upload button still works, and selecting an
SVG does nothing at all. There is a pre-flight probe in `index.html` that
catches this and shows a banner — that probe is why the failure is legible, so
it is not dead code either.

## Frame artwork paints on top of the screenshot

Render order is: screenshot in a clipped div, then the frame SVG appended over
it. Two consequences worth memorising:

- `#screen` must be a genuine **hole** in the artwork. A filled rect there
  buries the screenshot.
- A clip that is too large or too square is **invisible** — the artwork covers
  it. One that is too small or too round leaks the panel background as a
  hairline. When in doubt, over-extend.

This is also why a corner defect can be invisible on one pack and obvious on
another: if the bezel artwork has rounded screen corners, it hides a clip that
is wrong in exactly that region.

## `path.getBBox()` excludes ancestor transforms

Measuring geometry in the browser: use `getBoundingClientRect()` scaled by the
viewBox/CSS ratio. `getBBox()` silently returns the untransformed box, which is
right often enough to be trusted and wrong exactly when a pose has a transform.

## Panel size is the only thing that names a target

A strip states its device target in exactly one place — the CSS `width` and
`height` on its `.panel` rule. There is no `preset` key anywhere and no
front-matter, deliberately: a second declaration is a second thing to keep in
sync, and it would eventually disagree.

The invariant that makes this work: **no two targets share a size.** Keep it
that way when adding one.

Likewise, `input/<device>/` folders declare which targets a run covers. Adding a
list of targets to `app.md` would recreate the same problem one level up.

## `data-fit` belongs to the strip, not to the frame pack

Cover versus stretch is a property of the *relationship* between a capture and a
frame, not of the frame. The same pack wants cover with a correctly sized
capture and stretch with an oversized one, so a pack-level default would be
wrong for whoever's captures are the right shape.

A useful side effect: **how much cover and stretch differ is a readout of how
well your capture matches the frame.** Identical means well matched. A visible
difference means a mismatch, and its size is the size of the problem.

## `history.md` is one line per *concept*, not per run

A follow-run repeats a concept rather than choosing one, and appends nothing.
Otherwise porting one design to four other targets would write four more lines
saying the same thing and bury the concept the next run is meant to vary from.

## `follows:` inherits the concept, never the geometry

Set rhythm, panel archetype, device treatment, type placement, palette,
typeface, decor family, panel order, copy. Not pixels, not type scale, not line
breaks, and never `data-pack` — `check-schema.mjs` requires a pack's type to
equal its `strips/` folder, so the source's pack is never valid in the target.

Same decisions, re-composed. A bigger canvas earns larger type and more
generous margins; it does not earn a new decor motif.

## `strips/` is disposable, and runs are not deterministic

Nothing under `strips/` is tracked. A run replaces the folder wholesale, and
because the agent makes the design decisions afresh, re-running the same input
produces a *different* strip rather than the same one back. Copy a folder
outside the repo if you want to keep a particular result.

This matters more under `follows:`, where the source strip becomes an *input* to
four other runs while still being disposable. That is why a follow-run falls
back to `history.md` when the source strip is gone: the concept survives there
even when the markup does not.

## `render.mjs` writes `strip-data.json` only on success

If a render dies, a stale file from the previous run is still sitting there.
Delete the output before re-running, or you will read old numbers as fresh.

## The editor cannot write `@font-face`

`strip_editor/src/editor/serializeStrip.ts` is splice-based and preserves
`<head>` byte-for-byte — that is what keeps a one-word edit from producing a
diff touching the whole file. The consequence is that the type library has to
live in `schema.ts`'s `blankStripTemplate`: 13 `@font-face` rules and 6 `:root`
variables (`--garamond --lora --inter --poppins --grotesk --plexmono`).

Adding a typeface means editing that template, not the strip.

## `mask_analysis` is the only place external network assets are allowed

It loads OpenCV.js from `docs.opencv.org` on first open. Strips must never
reference anything remote — no web fonts, no remote images — or the editor and
the export disagree. All 13 fonts are self-hosted in `composer/fonts/`.

## Proving a screenshot actually fills an aperture

Render with a **solid magenta screenshot on a pure green panel background** and
scan the edges. Counting "background-coloured" pixels against a real screenshot
gives false negatives, because photo content lands in the same colour range.

## `.claude/` is invisible to the desktop bridge

Changes to `.claude/skills/strip-design/SKILL.md` cannot be written through it.
They have to arrive as an attachment and be copied in by hand.

## Chromium is pinned by *revision*, and that is why playwright is pinned exactly

Every playwright release pins one Chromium revision and looks for it in a
directory named after it — `chromium-1243`, never `chromium`. So a machine can
hold a complete, working Chromium and still fail every render, with playwright
wording it as `Executable doesn't exist at …/chromium_headless_shell-1228`: a
number nobody chose, next to a cache that plainly has a chromium folder in it.

`package.json` therefore pins `playwright` to an exact version. npm strips the
root `package-lock.json` out of a published tarball (verified against
`@measnalazi/design-ss@0.1.4`: only `strip_editor/package-lock.json` ships), so
for every installed user that dependency range is the *only* thing deciding
their revision. Under `^`, two people installing a week apart need two
different browsers, and `npm i -g @measnalazi/design-ss@latest` silently
invalidates a download they already paid for. `cli/test/browser.test.mjs`
asserts the pin, and asserts the lockfile agrees — `npm ci` refuses to run when
they disagree, which would leave a clone unable to install at all.

Three consequences, each paid for by a real failure:

- **`hasChromium()` checks both binaries.** Headless launches through
  `chrome-headless-shell`, in its own revision directory, while
  `chromium.executablePath()` names the headed one. Testing only the headed path
  let `design install` print "Chromium ready" at a path that really was there
  while every render failed. `design install` now also launches headless once
  and closes it — a file on disk is not proof that a launch works.
- **The revision is read out of `executablePath()`, not `browsers.json`.** That
  manifest is not in playwright-core's exports map (`ERR_PACKAGE_PATH_NOT_
  EXPORTED` on 1.61.1). The executable path encodes both facts anyway:
  `<registry>/chromium-<revision>/<platform>/<binary>`.
- **`browserState()` takes an explicit `toolkitRoot`.** The editor imports
  `cli/browser-state.mjs` to preflight its Export button, and Vite bundles that
  module graph into a temp file elsewhere on disk. Measured on a relocated copy:
  resolving from `import.meta.url` reports *no playwright* on a machine that has
  one; with the root passed in it finds it.
