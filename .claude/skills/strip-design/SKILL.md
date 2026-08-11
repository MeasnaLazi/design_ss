---
name: strip-design
description: >-
  Design App Store / Play Store screenshot strips by writing HTML/CSS. Reads the
  brief and screen captures from input/, writes one strip folder per app, checks
  it with composer/check-schema.mjs, renders it with composer/render.mjs, looks
  at the PNGs against composer/references/, and iterates. Also covers targeted
  edits to a strip that already exists: adding or moving blocks, swapping a
  screenshot, resizing a device, retuning type, colour or spacing.
---

# Designing a screenshot strip

A **strip** is a folder. `strip.html` holds every panel of a screenshot set and
is the single source of truth — no canvas, no importer, no second
representation. `composer/render.mjs` exports it and `strip_editor` edits it, in
the same browser engine, from the same file.

```
input/  →  design  →  strips/<app-name>/
```

A run reads `input/`, designs, and writes one strip folder named from the app:

```
input/                     strips/<app-name>/
  app.md                     strip.html         the document
  welcome.jpg                images/            artwork you create for it
  transfer.jpg               screenshots/       the captures, copied from input/
  ...                        rendered/          PNGs + strip-data.json (gitignored)
```

**Everything a strip references lives in its folder.** There is no shared asset
library. If you create an image for a panel — generated art, an exported SVG, a
texture — write it to `strips/<name>/images/` and reference it as
`/strips/<name>/images/<file>`, root-relative. Never point a strip at an asset
outside its own folder.

You design by **writing HTML/CSS and looking at the rendered PNGs**. The full
CSS vocabulary is yours: gradients, shadows, glows, overlap, cropping,
asymmetry, decorative shapes, real app screenshots inside device frames.

Design the strip as **one composition** with rhythm and continuity across
panels — not as five independent posters.

## Start here: read `input/`

**Before anything else, read `input/app.md` and list the images beside it.**

**Stop if there is no `app.md`, or no images.** Say what is missing and ask for
it. Do not invent an app name, a summary, or marketing copy, and do not design a
strip from nothing: a design that looks finished but describes an app that does
not exist is worse than no design.

`input/README.md` ships with the repo and documents the format — it is not a
brief. An `input/` holding only that file counts as empty.

`app.md` gives you:

- **the app name** — which names the output folder: "Bio Journal" →
  `strips/bio-journal/`
- **summary, category, tone, theme** — the design direction. Tone and theme
  steer type and palette; if either is absent, infer from the summary and *say
  what you inferred*.
- **per panel: `title`, `subtitle`, optional `caption`, optional `screenshot`**

Copy is taken **verbatim**. If a line does not fit the layout, say so and let
the user choose between changing the words and changing the design — never
reword it quietly. The words are theirs.

`screenshot` names a file in `input/`. **Copy the ones you use into
`strips/<app-name>/screenshots/`** and reference them as
`/strips/<app-name>/screenshots/<file>` — the finished strip must not depend on
`input/`, which is a working inbox and will be replaced by the next app.

A panel with no `screenshot` is not a blocker: omit `data-screenshot`, let the
frame render a blank screen filled by `data-screen-fallback`, and list the gap
at the end.

### Re-running an app

**Design from the input, not from the last result.**

If `strips/<app-name>/` already exists, replace it. Do not open the old
`strip.html`, do not read its layout, do not treat it as a starting point or as
something to preserve. It is the output of a previous run and has no authority
over this one — the input does. Reading it only anchors the new design to the
old one, which defeats the point of running again.

Do not ask whether to overwrite, and do not pause to warn. Replacement is what a
run *is*. The user re-ran it because they wanted a new design.

Clear the folder's `strip.html`, `images/` and `screenshots/` and write the new
design in their place, so nothing from the previous run survives by accident —
a stale screenshot no panel references, or an image the new design never uses.

### The one exception: a targeted edit

A request naming a specific change to an existing strip — *"make panel 2's
device bigger"*, *"swap the screenshot on the last panel"*, *"the subtitle is
too close to the title"* — is **not** a pipeline run. It is a different job:
read that strip, make the **smallest edit** that achieves it, leave `input/`
alone, and replace nothing.

Decide which of the two you are doing **before you touch anything**, and say
which. Everything else in this skill assumes you have already classified the
request:

| The request | What it means |
| --- | --- |
| *"design the strip"*, *"run it again"*, *"redo it with the new copy"*, or nothing named | **Pipeline run.** Read `input/`, design fresh, replace the folder. |
| A named change to a strip that exists | **Targeted edit.** Read that file, change that thing, leave the rest byte-identical. |

## Required reading

1. **`composer/references/archetypes.md`** — the design vocabulary: panel
   archetypes, set rhythms, and the axes (device treatment, type placement,
   background, palette, decor, screenshot treatment) that a design is assembled
   from. Read it on a pipeline run **before you write any markup**, and choose
   from it — see *Choose the concept* below.

   Consulting it after the panels exist is too late: by then the concept is
   committed and the only thing left to change is spacing.
2. **`composer/strip-schema.md`** — the contract. Panel structure, the five
   `data-layer` kinds, device attributes, z-order, and the shape of
   `strip-data.json`. Read it before writing any markup.
3. **The device pack**, before sizing any device — width is what scales a
   device, and the right width depends on the pose's viewBox, so guessing wastes
   a render round.

   ```bash
   cat composer/device-frames/<pack>/frame.json              # which poses exist
   grep -o 'viewBox="[^"]*"' composer/device-frames/<pack>/frame/<pose>.svg | head -1
   ```

   Take the dimensions from the **SVG's `viewBox`**, not from `frame.json`'s
   `viewWidth` — the runtime scales to the viewBox and those JSON fields are a
   fallback that has been stale before.

   **Do not assume a pose exists.** The catalogue changes; poses get deleted
   when they do not look good. Use what `frame.json` lists, and if a pack offers
   only one pose, that is a normal state, not a problem to report.
   `composer/device-frames/README.md` has the sizing rule and the craft notes.

## Preflight

From the repo root, before the first render:

- If `composer/node_modules` is missing: `cd composer && npm install`
- Ensure the browser: `npx playwright install chromium` (idempotent)
- Node 22.x

Nothing needs to be running. Rendering and review are entirely offline.

## The loop

1. **Read** `input/app.md`, `composer/references/archetypes.md` and
   `composer/strip-schema.md`. On a pipeline run that is *all* you read — never
   the previous strip. On a targeted edit, read the strip you were asked to
   change and skip to step 3.
2. **Choose the concept, and say it** — see below.
3. **Edit** the HTML.
4. **Check the structure** — no browser, so it costs nothing and catches the
   mistakes that would otherwise waste a render:

   ```bash
   node composer/check-schema.mjs strips/<app-name>/strip.html
   ```

5. **Render:**

   ```bash
   node composer/render.mjs --strip strips/<app-name>/strip.html --full
   ```

   Output lands in `strips/<app-name>/rendered/` unless you pass `--out`.

6. **Read the `problems` array from that output *before* looking at the PNGs**,
   then look at the PNGs.
7. **Iterate.** Renders are cheap. Stop when a round stops improving, or after
   about four rounds.
8. **Append the concept line** to `composer/references/history.md`.

### Choose the concept

Before any markup, pick from `archetypes.md` and **state the picks in one line**
so they can be rejected before five panels exist:

```
bio · continuous-canvas · full-bleed-screen · bare/no-frame · type-behind · dark + one accent
     ^rhythm             ^archetype          ^device         ^type        ^palette
```

Four rules:

- **Pick the set rhythm first.** It constrains everything else, and it is the
  axis that silently defaults to `uniform` — five identical panels, a template
  rather than a design.
- **Pick the other axes independently.** Do not adopt a bundle because some
  reference happened to use it. Combinations absent from `archetypes.md` are the
  point of having axes.
- **Do not repeat the previous run.** Read the last line of
  `composer/references/history.md`; change the archetype and at least two
  **structural** axes — set rhythm, device treatment, type placement, screenshot
  treatment, decor. A palette pinned by `app.md` does not count as variation;
  **mood** does, and is usually the only colour decision left. If the history
  file is missing or empty, this is the first run — choose freely.
- **Invent when nothing fits.** If no archetype suits the app, make one, use it,
  and add it to `archetypes.md` with a name.

## Reading a render

Three things answer three different questions, and between them they cover
everything you need:

| Question | What answers it |
| --- | --- |
| Is this file well-formed? | `check-schema.mjs` — source text, no browser |
| Where did everything land, and what broke? | the render's `problems`, and `strip-data.json` |
| Is it any good? | the panel PNGs, against `composer/references/` |

**Facts first.** The render prints a `problems` array — clipped text, an image
that did not load, a block that fell off its panel, a placeholder still in
place. Every entry is measured, not guessed. Fix those before forming any
opinion about the design; there is no point judging the composition of a panel
whose headline is cut in half.

`strip-data.json` in the output directory holds the same problems plus the
measured geometry of every block. **Its shape is documented in
`composer/strip-schema.md` § strip-data.json** — read that rather than writing a
script to discover the field names.

A device hanging off a panel edge is **not** a problem — that is the standard
crop, and the inspector deliberately stays quiet about it.

Anything that stops the render outright — a missing pack, an unknown pose, a
dead device screenshot — never reaches this step: `render.mjs` exits non-zero
and says which. Read that message rather than re-rendering.

**Then judgement.** Put each panel PNG next to one or two strips from
`composer/references/` — closest category available; if the gallery is empty,
judge against the best App Store pages you know.

Then name what is **concretely** wrong and fix it in CSS. Useful things to look
at: does one element clearly lead the panel, or do the type block and device
compete? Is text legible against what is *actually* behind it in the render,
not what you intended? Do the panels share a spacing rhythm and alignment, or
does each drift? Does the device sit in the composition or float in it?

Write fixes as edits, not scores: *"title tracking too loose → letter-spacing
-1px"*, *"device too small to lead → width 1500px, bottom -360px"*. Apply them
in one edit, then re-render.

Do not grade your own work on a numeric scale. A score you invent correlates
with nothing and reads as progress without being any.

When you are editing an existing strip against a specific request, this step
narrows: look at the affected panel and compare it with the previous render of
that same panel. You are checking your change, not re-judging the design.

## Design craft (principles, not rules)

- **One focal point per panel.** Decide whether type or device leads, and size
  accordingly.
- **Vary the layout across panels.** Alternate which side the device sits on,
  how large it is, and how far it crops off which edge; mix a centred panel with
  asymmetric ones; consider one inverted panel for rhythm when the theme has a
  dark counterpart. Alternate the **pose** too when the pack offers more than
  one — and when it offers only one, the other levers are what carry the rhythm.
- **Type hierarchy.** Title in the theme's display voice (serif or sans — infer
  from the app's character); subtitle quieter, smaller, muted. As a starting
  point at export size, titles read well from about 96px and subtitles from
  about 48px, but trust the render over the number.
- **Backgrounds** come from the theme's primary/secondary (plus accent):
  gradients, tints, subtle radials. Decor — blobs, rings, badges, bars — used
  sparingly and always in theme colours.
- **Cropping devices at panel edges is encouraged** — top, bottom or side. It is
  the most common pattern in professional store screenshots. Panels are
  `overflow: hidden`, so position with negative offsets. A block hanging off an
  edge is not a bug.
- **Contrast is non-negotiable.** Check every text block against the actual
  render, not against what you intended.

## Where copy comes from

**`input/app.md`, verbatim.** It is the only source of panel copy — titles,
subtitles, captions — and of the app's name, summary, tone and theme.

- **Never invent marketing text.** If `app.md` is missing, stop and ask (see
  *Start here*). If it is present but a panel has no title, ask about that
  panel rather than filling it in.
- **Never reword to fit.** A headline that overflows its block is a design
  problem first: try a size, a width, a line break. If it still does not work,
  say which line and why, and let the user decide between the copy and the
  layout.
- **Do not write back to `input/`.** It is the user's inbox, not your workspace.

On a **targeted edit**, the strip's own text is what you work with — do not
re-read `app.md` and quietly restore copy the user changed by hand in the
editor. On a **pipeline run**, `app.md` is the copy, full stop; whatever the
previous run put in the strip is irrelevant.

## Missing screenshots

Captures come from `input/`, named for what they show — `transfer.jpg`,
`welcome.jpg`. **Look at them before designing.** `app.md` names one per panel;
when it does not, pick the screen that proves that panel's claim, which is what
the filenames are for.

Copy every capture you use into `strips/<app-name>/screenshots/` and reference
it there, so the finished strip does not depend on `input/`.

When a panel has none, **omit `data-screenshot`**: the frame renders a blank
screen filled with `data-screen-fallback` (choose a theme-fitting hex). That is
a deliberate empty device and is a legitimate design choice.

**Never pause the run to request screenshot uploads.** Design around the gap and
list it at the end of your final message.

Do not ship either of the *accidental* placeholders: the green "place your
screenshot" capture, or the editor's `composer/placeholder.svg`. An intentional
blank screen via `data-screen-fallback` is a different thing and is allowed.

## Inputs

| Source | Use |
| --- | --- |
| `input/app.md` | **Required.** App name, summary, tone, theme, and the copy for every panel. Read first; stop if absent. |
| `input/*.jpg` `*.png` | **Required.** The app's screen captures, named for what they show. |
| `strips/<app-name>/strip.html` | The document you write. A pipeline run replaces it outright; a targeted edit changes only what was asked. **Gitignored — no version history**, so on a targeted edit a careless rewrite cannot be undone. |
| `strips/<app-name>/screenshots/` | The captures you used, copied from `input/`. |
| `strips/<app-name>/images/` | Logos, textures, generated artwork for image layers. Write new images here. |
| `composer/device-frames/` | Frame packs; `README.md` there has each pose's viewBox and a starting width. |
| `composer/references/` | Reference strips, for the review step. |

## Working live with the editor

```bash
cd strip_editor && npm run dev
```

```
http://localhost:4714/?strip=strips/<app-name>/strip.html
```

The editor watches the file. **Every write you make reloads the canvas**, so the
user watches the design appear as you work. This needs no cooperation from you:
the server notices any write it did not make, puts itself in agent mode, makes
the canvas read-only, and holds a lease that lapses about 90 seconds after the
last write — so a run that dies partway through cannot lock the human out.

You *may* announce yourself, which just names you in the banner instead of
"changed outside the editor", and starts before your first write rather than
after it:

```bash
curl -s -X POST http://localhost:4714/__api/strip-editor/mode \
  -H 'content-type: application/json' -d '{"mode":"agent","holder":"strip-design"}'
```

Release it when you are done:

```bash
curl -s -X POST http://localhost:4714/__api/strip-editor/mode \
  -H 'content-type: application/json' -d '{"mode":"human"}'
```

This is a dev-server endpoint. If the editor is not running the request fails,
which is expected and not worth reporting.

## Rules

Each of these was learned from a real failure.

- **Never write your own validation code.** No scratch scripts, no throwaway
  parsers, no ad-hoc Playwright. `check-schema.mjs` and `render.mjs` *are* the
  validation, and they are what the export and the editor actually use — a
  checker you write measures something subtly different from what ships, which
  is precisely the disagreement this pipeline exists to remove. If you want a
  fact neither tool reports, **say so** rather than scripting around it; that is
  a gap to fix in the tools.
- **Every direct child of a panel needs `data-layer`.** A bare `<div>` or
  `<svg>` renders perfectly in the export and is completely invisible to the
  editor — unselectable, undraggable, absent from the layer tree. Decorative
  shapes are `data-layer="decor"`. `check-schema` errors on this, and on the
  same omission inside a group.
- **Composite things are groups, not decor — when their parts are content.** A
  pill with an icon and a label: if someone will want to swap that icon or
  retype that label, it is `data-layer="group"` with an `image` child and a
  `text` child, and the editor can reach both. Decor is opaque by contract, so
  the same markup as decor leaves the icon and the label uneditable. Use decor
  when the contents really are one indivisible piece of decoration.
- **A group's children are the one exception to positioning absolutely.** When
  the group lays them out with flex, static is correct — do not add `left`/`top`
  that the browser will ignore. Give the group `gap` and `padding` instead.
- **A text block contains text and `<br>` only.** No `<span>`, no nested
  `<div>`. The editor rebuilds text content on first edit and silently discards
  anything else.
- **A device block gets a CSS `width` and never a height.** Height follows the
  pose's SVG viewBox aspect. Read that viewBox before sizing one: width ≈
  1.0–1.3 × its width.
- **Position blocks absolutely.** A statically positioned block cannot be moved
  by writing `left`/`top`, so it arrives in the editor unusable.
- **No external network assets.** No web fonts, no remote images. Everything
  resolves from the repo, or the editor and the export disagree.
- **Assets go in the strip's folder, referenced root-relatively.** Write new
  images to `strips/<app-name>/images/`, copy captures into
  `strips/<app-name>/screenshots/`, and reference them there. A strip that
  points at `/input/…` breaks the moment the next app arrives, and `input/` is
  not tracked in git, so there is nothing to fall back to.
  Not a relative `images/…`: the editor serves the document through
  `/__api/strip-editor/raw?path=`, so a relative path resolves against the API
  route — broken in the editor, fine in the export.
- **An `<img>` is an `image` block, never a `decor` one.** Decor is free HTML so
  the export looks right, but the editor then offers background and border and
  no `src` — the picture becomes the one thing you cannot change.
- **On a targeted edit, make the smallest edit that achieves the request.** Do
  not reformat, reindent, or rewrite panels you were not asked to touch. The
  document may have been hand-tuned in `strip_editor` — its indentation,
  attribute line breaks and declaration order belong to whoever wrote them.
  (This does not apply to a pipeline run, which authors the document outright.)
- **Do not fix things you were not asked to fix.** Say what you noticed and let
  the user decide. An unrequested "improvement" buried in a diff is the fastest
  way to lose their trust in this loop.
- **Do not edit** `composer/*.mjs`, `strip_editor/src/`, or the frame packs
  during a design run.

## Done when

The strip renders to clean panel PNGs, you have read the `problems` and looked
at the panels against `composer/references/`, and a round stopped improving. Say
what you changed in a line or two, name anything you noticed and deliberately
left alone, list any panels left with blank device screens, and give the user
the editor URL for the file.
