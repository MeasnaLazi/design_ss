---
name: strip-design
description: >-
  Design App Store / Play Store screenshot strips by writing HTML/CSS. Covers
  both a blank strip created in strip_editor ("New strip") and a targeted change
  to an existing one — author or edit the file, check it with
  composer/check-schema.mjs, render it with composer/render.mjs, look at the
  PNGs against composer/references/, iterate. Use whenever the request is about
  a strip in output/strips/: designing panels, adding or moving blocks, swapping
  a screenshot, resizing a device, retuning type, colour or spacing.
---

# Designing a screenshot strip

A **strip** is one plain HTML document holding every panel of a screenshot set.
It is the single source of truth: no canvas, no importer, no second
representation. `composer/render.mjs` exports it and `strip_editor` edits it, in
the same browser engine, from the same file.

You design by **writing HTML/CSS and looking at the rendered PNGs**. The full
CSS vocabulary is yours: gradients, shadows, glows, overlap, cropping,
asymmetry, decorative shapes, real app screenshots inside device frames.

Design the strip as **one composition** with rhythm and continuity across
panels — not as five independent posters.

## Two starting points, one job

| Situation | What changes |
| --- | --- |
| A blank strip from the editor's **New strip** — panels present, empty | You are composing from nothing. Establish the background system and pose rhythm first, then fill panels. |
| An existing strip and a **specific request** — *"make panel 2's device bigger"*, *"add a caption to panel 3"* | Read the file first and make the **smallest edit** that achieves it. Never re-author a strip you were asked to edit. |

An open-ended request on an existing strip (*"redesign this"*, *"make it
better"*) is the first case applied to a file that already has content — say
which reading you took before you start, so the user can stop you if the strip
was hand-tuned.

## Required reading

1. **`composer/strip-schema.md`** — the contract. Panel structure, the four
   `data-layer` kinds, device attributes, z-order, and the shape of
   `strip-data.json`. Read it before writing any markup.
2. **`composer/device-frames/README.md`** — each pose's viewBox and a starting
   width. Read it before sizing any device; the poses differ enough that
   guessing wastes a render round.

## Preflight

From the repo root, before the first render:

- If `composer/node_modules` is missing: `cd composer && npm install`
- Ensure the browser: `npx playwright install chromium` (idempotent)
- Node 22.x

Nothing needs to be running. Rendering and review are entirely offline.

## The loop

1. **Read** the strip and `composer/strip-schema.md`.
2. **Edit** the HTML.
3. **Check the structure** — no browser, so it costs nothing and catches the
   mistakes that would otherwise waste a render:

   ```bash
   node composer/check-schema.mjs output/strips/<file>.html
   ```

4. **Render:**

   ```bash
   node composer/render.mjs --strip output/strips/<file>.html \
     --out output/strips/rendered --full
   ```

5. **Read the `problems` array from that output *before* looking at the PNGs**,
   then look at the PNGs.
6. **Iterate.** Renders are cheap. Stop when a round stops improving, or after
   about four rounds.

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
- **Vary the layout across panels.** Alternate device side, height and pose; mix
  a centred panel with asymmetric ones; consider one inverted panel for rhythm
  when the theme has a dark counterpart.
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

Panel copy — titles, subtitles, captions — lives in **`datasource/input/`**, one
markdown file per strip: `datasource/input/<strip-name>.md`.

In order:

1. **If that file exists, it is the source of truth.** Read it and take the copy
   verbatim. Do not overwrite it, and do not silently reword it in the HTML — if
   a line does not fit the layout, say so and let the user decide between
   changing the copy and changing the design.
2. **Otherwise take the copy from the request**, or from the strip if it already
   has some.
3. **If there is none, draft the file** in the format below, design with it, and
   say in your final message that the copy is a draft and where it lives. Do not
   pause the run to ask for it — a draft the user can edit in one place beats a
   blocked turn, and it beats marketing text invented invisibly inside the HTML.

When the user edits `datasource/input/<strip-name>.md`, re-read it and update the
strip. The markdown is the input; the strip HTML is what ships.

```markdown
# <strip name>

Theme: #f5f1ee / #0c0c0a        <!-- optional: background / ink -->

## Panel 0
- title: Your Life as a Book
- subtitle: Flip through your memories
- screenshot: /datasource/screenshots/appstore_iphone_portrait/<file>.png

## Panel 1
- title: Private By Design
- subtitle: Everything stays on your phone
- caption: No account required
```

Keys are `title`, `subtitle`, `caption`, `screenshot` — all optional except a
title. One title and one subtitle per panel; a caption only when it earns its
place. Anything else in the file is a note to you, not copy to render.

## Missing screenshots

Prefer a real capture for every device — `datasource/screenshots/<preset>/`.
Look at them before designing and pick the screen that proves each panel's
claim.

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
| `output/strips/*.html` | The strips. **Gitignored — no version history. Do not rewrite one without being asked.** |
| `datasource/input/<strip-name>.md` | Panel copy. Source of truth when present — see § Where copy comes from. |
| `datasource/screenshots/<preset>/` | Real app screen captures, for device screens. |
| `datasource/images/` | Logos, textures, artwork for image layers. |
| `composer/device-frames/` | Frame packs; `README.md` there has each pose's viewBox and a starting width. |
| `composer/references/` | Reference strips, for the review step. |

## Working live with the editor

```bash
cd strip_editor && npm run dev
```

```
http://localhost:4714/?strip=output/strips/<file>.html
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
  shapes are `data-layer="decor"`. `check-schema` errors on this.
- **A text block contains text and `<br>` only.** No `<span>`, no nested
  `<div>`. The editor rebuilds text content on first edit and silently discards
  anything else.
- **A device block gets a CSS `width` and never a height.** Height follows the
  pose's SVG viewBox aspect. Read `composer/device-frames/README.md` before
  sizing one.
- **Position blocks absolutely.** A statically positioned block cannot be moved
  by writing `left`/`top`, so it arrives in the editor unusable.
- **No external network assets.** No web fonts, no remote images. Everything
  resolves from the repo, or the editor and the export disagree.
- **Smallest edit that achieves the request.** Do not reformat, reindent, or
  rewrite panels you were not asked to touch. Strips in `output/` have no git
  history, and the document may have been hand-tuned or edited in `strip_editor`
  — its indentation, attribute line breaks and declaration order belong to
  whoever wrote them.
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
