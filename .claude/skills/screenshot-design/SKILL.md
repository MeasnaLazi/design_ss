---
name: screenshot-design
description: >-
  HTML-first store screenshot design for apps_publisher: read
  output/screenshot_report.md, author the whole strip as one HTML/CSS document
  per composer/strip-schema.md, render with composer/render.mjs, review the PNGs
  against composer/references/, iterate, then hand the file to the user in
  strip_editor. Use when acting as screenshot-design-agent or when the user names
  this skill.
---

# Screenshot design (HTML-first)

You design store screenshot strips by **writing one HTML/CSS document** and
looking at the rendered PNGs. The full CSS vocabulary is yours: gradients,
shadows, glows, overlap, cropping, asymmetry, decorative shapes, real app
screenshots inside device frames.

One document is the whole strip. Design it as a single composition with
continuity and rhythm across panels — not as five independent posters.

**Already have a strip and need one specific change?** That is
**`strip-edit`**, not this skill. This workflow authors a strip from a brief;
running it against an existing file rewrites work someone may have tuned by
hand or in the editor.

## Preflight

From the repo root, before the first render:

- If `composer/node_modules` is missing: `cd composer && npm install`
- Ensure the browser: `npx playwright install chromium` (idempotent)
- Node 22.x

Nothing else needs to be running. Rendering and review are entirely offline.

## Required reading

1. This skill.
2. **`composer/strip-schema.md`** — the layer contract your HTML must follow:
   panel structure, `data-layer` kinds, device block attributes, z-order.
3. **`composer/device-frames/README.md`** — pose viewBoxes and the widths that
   suit them. Read it before sizing any device; the poses differ enough that
   guessing wastes a render round.

## Inputs

| Source | Use |
| --- | --- |
| `output/screenshot_report.md` | Per panel: Title, Subtitle, Description, **Summary for designer**; plus Overview and **Theme**. Exactly one title and one subtitle per panel; a description becomes a caption only when it earns its place. |
| `output/appstore.json` / `output/playstore.json` | Theme hex and verbatim copy. Never mix stores. |
| `datasource/screenshots/<preset>/` | **Real app screenshots.** Look at them before designing and pick the screen that proves each panel's claim. |
| `datasource/images/` | Logos, textures and other artwork for image layers. |
| `composer/references/` | Reference strips, for the review step. |

## Workflow

1. **Absorb the brief.** Read the report, the theme, and the actual app
   screenshots. Write a 3–5 line strip concept: mood, background system, pose
   rhythm across panels, which panel (if any) is the dark or accent inversion.
2. **Author** `output/strips/<store>_strip.html` per `composer/strip-schema.md`.
3. **Check the structure** — no browser, so it costs nothing and catches the
   mistakes that would otherwise waste a render:
   `node composer/check-schema.mjs output/strips/<store>_strip.html`
4. **Render:**
   `node composer/render.mjs --strip output/strips/<store>_strip.html --out output/strips/rendered --full`
5. **Review** — read the render's `problems` first, then look at the PNGs
   (§ Review). Edit the HTML and re-render. Renders are cheap — iterate freely,
   and stop when a round produces no visible improvement, or after about four
   rounds.
6. **Present** the panels to the user, and tell them they can open the strip in
   the editor at
   `http://localhost:4714/?strip=output/strips/<store>_strip.html`
   (`cd strip_editor && npm run dev`). The editor opens the same file you wrote —
   there is no import step and nothing is converted.

## Review (per render)

Three things answer three different questions, and between them they cover
everything you need:

| Question | What answers it |
| --- | --- |
| Is this file well-formed? | `check-schema.mjs` — source text, no browser |
| Where did everything land, and what broke in layout? | the render's `problems`, and `strip-data.json` |
| Is it any good? | the panel PNGs, against `composer/references/` |

**Facts first.** The render prints a `problems` array — clipped text, an image
that did not load, a block that fell off its panel, a placeholder still in
place. Every entry is measured, not guessed. Fix those before forming any
opinion about the design; there is no point judging the composition of a panel
whose headline is cut in half.

`strip-data.json` in the output directory holds the same problems plus the
measured geometry of every block, if you need to know exactly where something
landed. **Its shape is documented in `composer/strip-schema.md` § strip-data.json**
— read that rather than writing a script to discover the field names. Note that a device hanging off a panel edge is *not* a problem — that
is the standard crop, and the inspector deliberately stays quiet about it.

Anything that stops the render outright — a missing pack, an unknown pose, a
dead device screenshot — never reaches this step: `render.mjs` exits non-zero
and tells you. Read that message rather than re-rendering.

**Then judgement.** Put each panel PNG next to one or two strips from
`composer/references/` — closest category available; if the gallery is empty,
judge against the best App Store pages you know.

Then name what is **concretely** wrong and fix it in CSS. Useful things to look
at: does one element clearly lead the panel, or do the type block and device
compete? Is text legible against what is *actually* behind it in the render,
not what you intended? Do the panels share a spacing rhythm and alignment, or
does each drift? Does the device sit in the composition or float in it?

Write fixes as edits, not scores: *"title tracking too loose → letter-spacing
-1px"*, *"device too small to lead → width 1500px, bottom -360px"*. Apply all of
them in one edit, then re-render.

Do not grade your own work on a numeric scale. A score you invented tells you
nothing you did not already know, and it reads as progress without being any.

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
- **Contrast is non-negotiable.** Check every text block against the render.

## Missing screenshots

Prefer a real capture for every device. When a panel has none, **omit
`data-screenshot`**: the frame renders a blank screen filled with
`data-screen-fallback` (choose a theme-fitting hex). That is a deliberate empty
device and is fine to ship.

List the gaps in your final message. Never pause the run to ask for uploads.

## Do not

- Ship a panel showing an **accidental** placeholder — the green "place your
  screenshot" capture, or the editor's `composer/placeholder.svg`. An
  intentional blank screen via `data-screen-fallback` is a different thing and
  is allowed.
- Use external network assets (fonts, images) in strip HTML. Everything must
  resolve from the repo, or the export renders differently from the editor.
- **Write your own validation code.** No scratch scripts, no throwaway parsers,
  no ad-hoc Playwright. `check-schema.mjs` and `render.mjs` *are* the
  validation, and they are the same tools the export and the editor use — a
  checker you write measures something slightly different from what actually
  ships, which is precisely the disagreement this pipeline exists to remove. If
  you find yourself wanting a fact neither tool reports, say so in your final
  message; that is a gap to fix in the tools, not to paper over with a script.
- Edit `composer/*.mjs`, `strip_editor/src/**`, or the frame packs during a
  design run.
- Overwrite `output/screenshot_report.md`.
