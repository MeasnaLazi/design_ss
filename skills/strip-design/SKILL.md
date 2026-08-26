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
is the single source of truth.
representation. `composer/render.mjs` exports it and `strip_editor` edits it, in
the same browser engine, from the same file.

```
input/<device>/  →  design  →  strips/<device>/
```

A run reads `input/`, designs **one** target, and writes the strip folder of the
same name:

```
input/                       strips/<device>/
  app.md          shared       strip.html       the document
  appicon.png     shared       images/          artwork you create for it
  <device>/                    screenshots/     the captures, copied in
    welcome.PNG                rendered/        PNGs + strip-data.json (gitignored)
    transfer.PNG
    ...
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

**Before anything else, read `input/app.md` and list the device folders beside
it.**

`input/` mirrors `strips/`: one folder per device target, same name on both
ends.

```
input/                       strips/
  app.md          shared       iphone/   ← designed from input/iphone/
  appicon.png     shared       ipad/     ← designed from input/ipad/
  iphone/  welcome.PNG …
  ipad/    welcome.PNG …
```

**Three things are required. Stop and ask if any is missing:**

| Required | Why |
| --- | --- |
| the app's name — the `# ` heading | never invent what the app is called |
| panel copy, **or** a `summary` to draft it from | with neither there is nothing to say on five panels |
| a device folder holding at least one image | a strip of empty phones is not a design |

**Images loose at `input/` root belong to no target.** They are not read. If
that is all there is, say so and name the folder they should move into.

Note the difference between this and *Which target* below. **Refuse when an
input is missing; never ask when a choice can be defaulted.** With no app name
and no captures there is nothing to design, and stopping is the only honest
outcome — in a CLI that is a failure with a clear reason, not a hang. Choosing
between five present device folders is not that: a default exists, so take it.

Panel copy is **not** required — see *Draft the panels that are missing* below.
A description plus the captures is enough to start.

What stays forbidden is inventing the *app*: a design that looks finished but
describes software that does not exist is worse than no design.

`input/README.md` ships with the repo and documents the format — it is not a
brief. An `input/` holding only that file counts as empty.

### Which target

**The device folders name the targets.** There is no `preset` key — the folders
*are* the declaration.

| Situation | What to design |
| --- | --- |
| the user named a target | that one, alone |
| exactly one device folder exists | that one |
| several exist, none named | **all of them** — the root fresh, the rest following it |

**Several folders means a whole set, not a choice between them.** An app ships
to a store as a set; designing one of five and stopping is never the finished
job, and leaving the other four for later runs guarantees they diverge — a
later run with no `follows:` is *required* by the no-repeat rule to change the
archetype and two structural axes. One run, one concept, every target.

**Never stop to ask which target, or whether to do the rest.** A question is a
run that has halted, and nothing guarantees anyone is there to answer it — this
skill has to survive being driven from a CLI or a batch job, where a prompt is
not a pause but a hang.

Announcing is not asking. Say what is about to happen, then do it without
waiting:

```
5 device folders, none named — designing the set.
  iphone (root, fresh) → ipad, phone, tablet_7, tablet_10 (following it)
Each replaces strips/<target>/ outright.
```

**The root** is the target `follows:` names, if `request:` names one — that is
what `follows:` is for, and a target never follows itself. Otherwise it is the
first populated folder in **precedence order:** `iphone`, `phone`, `ipad`,
`tablet_7`, `tablet_10`. Phone targets first because they are the tightest
canvas, and copy that fits there fits everywhere while the reverse does not
hold; App Store before Play within each tier.

Fixed order, not "whichever has no strip yet" — a rule that depends on what
already exists would pick a different root on the second run, and the whole set
would shift under you.

**This trades a hang for a risk, and the risk is real.** A run replaces every
folder it designs, so someone who wanted only `ipad` touched, said nothing, and
got the whole set redesigned has lost four other strips. Two things make that
survivable and neither is optional: **announce the set before the first write**,
so it is visible in the log of even an unattended run, and remember that
`strips/` is disposable by design — see the note in `.gitignore` about copying a
folder out to keep it.

Naming a target is how you scope a run down. *"Design ipad"* designs `ipad` and
nothing else.

| folder | panel size |
| --- | --- |
| `iphone` | 1290×2796 |
| `ipad` | 2048×2732 |
| `phone` | 1080×1920 |
| `tablet_7` | 1200×1920 |
| `tablet_10` | 1600×2560 |

**Designing a set: root first, then the rest, in one run.** The root is an
ordinary pipeline run — choose a concept, append the `history.md` line. Every
target after it is a **follow-run** against the root: same concept,
re-composed. Only the root appends to `history.md`; see *Following another
target*.

Work through them **one at a time, finishing each before starting the next**,
and report each as it lands:

```
[1/5] strips/iphone/  root · continuous-canvas · type-over-device · … · rendered clean
[2/5] strips/ipad/    following iphone · rendered clean
```

Finishing one at a time is what keeps the editor usable — it watches a single
file, so a half-written second target while the first is still being judged is
the thing to avoid. Interleaving them would also mean a concept problem is
found five times instead of once.

**Stop the set if the root does not render clean.** Following a broken concept
four more times wastes the work and buries the actual failure under four
repetitions of it. Say which target failed and what remains undesigned.

**Targets are peers, not copies** — unless `follows:` says otherwise. Do not
open another target's strip for reference. An iPad panel is the same height as
an iPhone panel and 59% wider, so its layout is a different problem, not a
scaled one — and reading the other design anchors this one to it. Same input,
designed again.

That anchoring is exactly what a **follow-run** is for, which is why it has to
be asked for rather than assumed. See *Following another target*.

`app.md` gives you:

- **the app name** — used *in* the design (brand chip, watermark, wordmark). It
  does **not** name any folder.
- **summary, category, tone, theme** — the design direction. Tone and theme
  steer type and palette; if either is absent, infer from the summary and *say
  what you inferred*.
- **`panels`** — optional, 5-10. How many panels to design. Only consulted for
  panels `app.md` does not already contain.
- **`follows: <target>`** — optional, inside `request:`. Names another target
  whose design concept this one repeats. Turns the run into a **follow-run** —
  see *Following another target*.
- **per panel, where they exist: `title`, `subtitle`, optional `caption`,
  optional `screenshot`**

Copy that is already in `app.md` is taken **verbatim** — whether the user wrote
it or a previous run drafted it. If a line does not fit the layout, say so and
let the user choose between changing the words and changing the design — never
reword it quietly. The words are theirs.

`screenshot` names a file in **the device folder being designed** —
`input/iphone/welcome.PNG` on an iphone run. The same filename in each device
folder is how one line of copy serves every target, so resolve it against the
current target and never against another one.

**Copy the ones you use into `strips/<device>/screenshots/`** and reference them
as `/strips/<device>/screenshots/<file>` — the finished strip must not depend on
`input/`, which is a working inbox and will be replaced by the next app.

A panel with no `screenshot` is not a blocker: omit `data-screenshot`, let the
frame render a blank screen filled by `data-screen-fallback`, and list the gap
at the end.

### Following another target

`follows: iphone` inside `request:` — or the user asking for it in words — makes
this a **follow-run**: the same design concept, re-composed for this target's
canvas. It exists because one app usually wants one look across both stores, and
designing each target from nothing produces five cousins rather than one family.

**A target never follows itself.** If the target being designed is the one
`follows:` names, it is the **root** of the set: run it as an ordinary pipeline
run, choose a concept, append the history line, and say that is what you did.
`follows:` describes how the *other* targets relate to this one, so on the
target it points at it is inert — not an instruction to copy yourself.

**Inherited, verbatim:**

- the seven concept slots — set rhythm, panel archetype, device treatment, type
  placement, background/palette, typeface, decor family
- panel order
- the copy and the screenshot-to-panel mapping, which `app.md` already shares
  across every target

**Decided again, always:**

- every pixel — positions, sizes, device block widths, crop and bleed
- type scale and leading. A 2048-wide canvas is not a 1290-wide canvas with
  bigger numbers
- where copy breaks across lines: the same words wrap differently
- `data-pack`, which is *forced* to change — `check-schema.mjs` requires a
  pack's type to equal the `strips/` folder, so the source's pack is never valid
  here

**Same decisions, re-composed.** A larger canvas earns larger type and more
generous margins. It does **not** earn a new decor motif or a new panel
archetype: invent one and the two stores stop reading as one family, which was
the whole reason to follow. The opposite failure is just as real — port too
literally and the iPad strip reads as a stretched phone strip, which is a
well-known amateur tell.

**The source's spacing is part of the concept, not a free variable.** Geometry
is re-decided per canvas, but *proportion* is inherited. Measure the source
before sizing anything, and carry two ratios across:

- **Side margin as a fraction of panel width**, on the panels that are framed.
  Whatever the source leaves, the target leaves at least as much: a source at
  90px on a 1080 panel is 8.3%, so a 1200 panel keeps ≥100px and a 2048 panel
  keeps ≥170px. A source panel that deliberately bleeds has no margin to
  inherit — inherit its *crop* instead, as a fraction of the device, and compare
  framed panels only against framed ones.
- **The coverage band.** Read the source's `strip-data.json` and stay inside the
  band its body panels occupy. Never exceed the top of it — see *Reading a
  render*.

Compare **bands, not panel indexes**: the two sets often have different panel
counts, so panel 2 of one is not panel 2 of the other.

This is the rule that a follow-run breaks most easily, because the destination
pack is usually a different shape from the source's. Going from a 0.49 pose to a
0.60 or 0.77 one, holding the device's *height* constant costs far more width —
so the side margins vanish first, and they vanish silently while every other
inherited slot still looks correct.

**Where the concept comes from.** Two sources, each asked only for what it
actually knows:

| | Read from | Why that one |
| --- | --- | --- |
| palette, typeface | `strips/<source>/strip.html` — its `:root` vars and hex values | exact, and still true if the strip was hand-tuned in the editor after the run |
| the other five slots | the `<source>` line in `composer/references/history.md` | categorical judgements a run *declared*; inferring them back out of markup is guesswork |

`strips/` is gitignored and a run replaces it wholesale, so the source strip may
be gone. Then fall back to `history.md` alone — every slot survives there,
including the exact typeface — re-derive the palette from the recorded
description and the app icon, and **say that you did**.

If neither exists, this is not a follow-run. Say so and stop, rather than
inventing a concept and presenting it as inherited.

**Reconcile the panels before designing anything.** The panel count in `app.md`
is shared across targets; the captures are not. Report what you found and wait:

```
app.md declares 6 panels · input/ipad/ has 5 captures
building panels 1-5 · skipping 6 (settings.PNG not found in input/ipad/)
```

A forgotten capture and a deliberate omission look identical from here, and
silently dropping a panel is the one behaviour that would make this
untrustworthy.

**A follow-run appends nothing to `history.md`.** It records no new concept — it
repeats one — and the no-repeat rule reads that file for the last concept a run
*chose*. Five follow lines would bury it. The useful consequence: the next fresh
run still sees the source's concept as the one to vary from.

**Following regenerates; it does not patch.** *"Update ipad to follow iphone"*
replaces `strips/ipad/` outright and any hand-tuning there is gone — the run is
not deterministic, so it will not come back. Say that before replacing a strip
the user has been editing.

### Draft the panels that are missing

**How many panels:**

> `panels` if set and within 5-10, otherwise the number of `## Panel N` sections
> in `app.md`, otherwise 5.

Then **draft every panel section that does not exist, and never touch one that
does.** `panels: 6` with two panels written means writing four. `panels` outside
5-10 is ignored, the count falls back to 5, and the run says so in one line.

`panels` **extends, never truncates.** Eight panel sections with `panels: 5` is
eight panels. Never drop a panel to satisfy a number — that deletes the user's
copy to honour a field they probably forgot to update.

**Write the drafts back into `input/app.md`**, appended after `## About` in
panel order, each marked:

```markdown
<!-- drafted by strip-design 2026-08-14 -->
## Panel 3

- title: Speak It, Save It
- subtitle: Record a thought — the app transcribes it for you.
- screenshot: voice.jpg
```

This write-back is the point. Copy that lives only in `strip.html` dies with the
next run, which replaces the folder — so without it every run starts from zero
and nothing the user corrected survives. Written into `app.md`, the second run
starts from copy they have had a chance to fix, and the file converges.

The marker changes no behaviour: on the next run a drafted panel is just a
panel, verbatim like any other. It exists so the user can see which lines to
review, and so the final message can say which were theirs and which were yours.

**Write as a marketing copywriter, inside three constraints:**

- **Every claim traceable.** It must be supported by the `summary` or visibly
  true in a capture. Apple requires screenshots to represent the actual app, so
  a headline promising a feature that does not exist is a rejection risk. No
  superlatives, no "#1", no invented capabilities.
- **Outcome, not feature.** *"Save an hour every day"*, not *"Smart scheduling
  engine"* — the one cited finding on headline wording. 2-5 words, one benefit
  per panel, per Apple's own guidance.
- **Panel 0 says what the app is.** ~70% never scroll past it. It is not the
  place to be clever.

Then **look at the captures and match each drafted claim to the screen that
proves it** — that is what the filenames are for. If there are more panels than
captures, reuse a screen across panels cropped to a different region each time,
and say which panels share one.

Never append a panel section that already exists, and never edit one. If the
draft and an existing panel would collide, the existing one wins.

### Re-running a target

**Design from the input, not from the last result.**

If `strips/<device>/` already exists, replace it. Do not open the old
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

Decide which of the three you are doing **before you touch anything**, and say
which. Everything else in this skill assumes you have already classified the
request:

| The request | What it means |
| --- | --- |
| *"design the strip"*, *"run it again"*, *"redo it with the new copy"*, or nothing named | **Pipeline run.** Read `input/`, design fresh, replace the folder. |
| A named change to a strip that exists | **Targeted edit.** Read that file, change that thing, leave the rest byte-identical. |
| `app.md`'s `request:` carries `follows: <target>`, or the user asks for one target to follow another | **Follow-run.** Repeat that target's concept on this canvas, replace this folder. See *Following another target*. |

A follow-run is a pipeline run in every respect but one: it inherits the concept
instead of choosing it. Everything about assets, checking, rendering and
iterating is unchanged.

**A run covers a whole set unless a target is named.** With several populated
device folders and none named, the run is one pipeline run for the root followed
by a follow-run for each remaining target — see *Which target*. That is a
sequence of the modes above, not a fourth one.

**A request outranks `app.md`.** `follows:` in the file is a standing default,
not a lock. *"Design ipad from scratch"* is a pipeline run even with
`follows: iphone` sitting in `request:`, and *"make ipad follow iphone"* is a
follow-run even when the file says nothing. The file records how these targets
usually relate; the person asking knows what they want this time.

Say which mode you concluded, and say it before writing anything — a run that
silently disagreed with the file is the one that will be hard to explain later.

## Required reading

1. **`composer/references/archetypes.md`** — the design vocabulary: panel
   archetypes, set rhythms, and the axes (device treatment, type placement,
   background, palette, decor, screenshot treatment) that a design is assembled
   from. Read it **before you write any markup** — on every run, follow-runs
   included — and choose from it on a pipeline run; see *Choose the concept*
   below.

   Consulting it after the panels exist is too late: by then the concept is
   committed and the only thing left to change is spacing.

   **A follow-run needs it just as much**, even though it chooses nothing. It
   inherits slots written in this vocabulary — *"framed flat-front side-crop
   17–24%"* means nothing without it — and Axis 3 holds the limits that stop a
   re-composed device from bursting its panel: § Scale for width as a fraction
   of panel width, § Crop for how deep and toward which edge, and *The frame has
   to remain a frame* for where a crop stops being framed at all. Those limits
   are where a follow-run fails, because the destination pack is usually a
   different shape from the source's.
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
2. **Settle the copy.** Resolve the panel count, draft any missing panel
   sections, and write them back into `input/app.md` — see *Draft the panels
   that are missing*. Do this **before** choosing the concept: the number of
   panels and what each one claims are inputs to the set rhythm, not decorations
   applied afterwards.
3. **Choose the concept, and say it** — see below.
4. **Put the assets in place, then edit** the HTML. Copy the captures you will
   use into `strips/<device>/screenshots/` and write any artwork into
   `strips/<device>/images/` *before* writing markup that names them — each
   write reloads the editor, and a reference to a file that is not there yet
   renders as a broken device while the user watches.
5. **Check the structure** — no browser, so it costs nothing and catches the
   mistakes that would otherwise waste a render:

   ```bash
   node composer/check-schema.mjs strips/<device>/strip.html
   ```

6. **Render:**

   ```bash
   node composer/render.mjs --strip strips/<device>/strip.html --full
   ```

   Output lands in `strips/<device>/rendered/` unless you pass `--out`.

7. **Read the `problems` array from that output *before* looking at the PNGs**,
   then look at the PNGs.
8. **Iterate.** Renders are cheap. Stop when a round stops improving, or after
   about four rounds.
9. **Append the concept line** to `composer/references/history.md` — unless this
   was a follow-run, which repeats a concept rather than choosing one and
   records nothing. See *Following another target*.

### Choose the concept

**Skip this section on a follow-run.** The concept is inherited, and the
no-repeat rule below is inverted there — repeating is the point. State the
inherited line the same way, naming where it came from.

Before any markup, pick from `archetypes.md` and **state the picks in one line**
so they can be rejected before five panels exist:

```
bio · continuous-canvas · full-bleed-screen · bare/no-frame · type-behind · dark + one accent · decor: representational (lock watermark)
     ^rhythm             ^archetype          ^device         ^type        ^palette             ^which decor family, and what
```

**Name the decor family** — abstract/typographic, or representational. Ten
consecutive runs picked abstract without considering the alternative, so state
it and make it a decision. `archetypes.md` § Axis 8 has both lists.

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

**Measure emptiness; do not eyeball it.** `strip-data.json` gives every layer's
box, so per panel compute the union area as a fraction of panel area, and look
for fully empty bands and columns. Under ~70% coverage on a panel meant to be
dense, or an empty column more than ~10% of panel width running most of the
height, means the composition is leaving space it did not intend to. The usual
cause is a device sized against its own artwork rather than against the panel —
see `archetypes.md` § Axis 3 · Scale. An empty *column* is invisible to any
row-by-row check, which is why it has to be measured as area.

**Coverage has a ceiling as well as a floor. It is a measurement, not a score.**
Nothing improves by driving it upward. A framed panel at **0.97 or above** has
its device touching or crossing the panel edge, because that is the only way the
last of the margin disappears — so a rising coverage number across iterations is
a symptom to investigate, not progress. Read it beside the device's own box: if
`left` is negative, or `left + width` exceeds the panel width, the number went up
because the composition broke.

Margins are part of the design, not slack to be reclaimed. A panel that measures
0.88 with air down both sides is finished; the same panel at 1.00 is a device
with its screen clipped by the panel edge.

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

**`input/app.md`.** It is the only source of panel copy — titles, subtitles,
captions — and of the app's name, summary, tone and theme.

- **Whatever is in the file is verbatim.** Never reword, never "improve", never
  quietly tighten — including copy a previous run drafted. Once a line is in
  `app.md` it is the user's, whoever typed it first.
- **Draft what is absent, into the file.** A panel section that does not exist
  is yours to write, subject to the constraints in *Draft the panels that are
  missing*. Write it into `app.md`, not only into the strip.
- **Never reword to fit.** A headline that overflows its block is a design
  problem first: try a size, a width, a line break. If it still does not work,
  say which line and why, and let the user decide between the copy and the
  layout.
- **Never invent the app.** Drafting a headline is writing; claiming a feature
  the app does not have is fabrication, and a store rejection. Every claim must
  trace to the `summary` or to something visible in a capture.
- **`input/app.md` is the only file you write there.** Append panel sections;
  never rewrite the user's `## About`, never touch their captures.

On a **targeted edit**, the strip's own text is what you work with — do not
re-read `app.md` and quietly restore copy the user changed by hand in the
editor, and do not draft anything. On a **pipeline run**, `app.md` is the copy,
full stop; whatever the previous run put in the strip is irrelevant.

## Missing screenshots

Captures come from `input/<device>/` — the folder for the target being
designed — named for what they show: `transfer.jpg`, `welcome.jpg`. **Look at them before designing.** `app.md` names one per panel;
when it does not, pick the screen that proves that panel's claim, which is what
the filenames are for.

Copy every capture you use into `strips/<device>/screenshots/` and reference
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
| `input/app.md` | **Required.** App name, summary, tone, theme, optional `panels` count, and the copy for any panel the user wrote. Read first; stop if absent. The one file in `input/` you write to — appending drafted panel sections. |
| `input/<device>/*.jpg` `*.png` | **Required.** That target's screen captures, named for what they show. One folder per device target; the folder names the target. |
| `input/*icon*.png` | Optional, and shared by every target. The app icon — the best source for a palette when `theme` is absent, and a motif for decor. Use it as a mark on at most one panel. |
| `strips/<device>/strip.html` | The document you write. A pipeline run replaces it outright; a targeted edit changes only what was asked. **Gitignored — no version history**, so on a targeted edit a careless rewrite cannot be undone. |
| `strips/<device>/screenshots/` | The captures you used, copied from `input/`. |
| `strips/<device>/images/` | Logos, textures, generated artwork for image layers. Write new images here. |
| `composer/device-frames/` | Frame packs; `README.md` there has each pose's viewBox and a starting width. |
| `composer/references/` | Reference strips, for the review step. |

## Working live with the editor

```bash
cd strip_editor && npm run dev
```

```
http://localhost:4714/?strip=strips/<device>/strip.html
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
  pose's viewBox aspect, so width is the only number you set — and you set it as
  a **fraction of panel width**, from `archetypes.md` § Axis 3 · Scale:
  dominant, balanced or incidental.

  That table is the authority and this file deliberately does not restate it.
  The two disagreed for a long time: a "width ≈ 1.0–1.3 × its viewBox width"
  rule lived here, which Axis 3 had already worked out lands at 0.60–0.78 of
  panel width and leaves a quarter of the panel empty either side. A copy
  drifts; a pointer cannot.
- **A device crosses a panel edge only where the concept says it does.**
  Cropping and bleeding are real choices, and a device running half off one edge
  or cropped hard at the bottom is a composition, not a bug. What makes it a
  choice is that it was *declared*: name the edge and the depth in the concept
  line, the way `history.md` already records it — *"wide 1320px bleeding both
  side edges and cropped 32–38% at the top"*.

  Geometry that crosses an edge the concept line never mentions is
  **overgrowth**, not crop. It has a signature: it appears while closing empty
  space, it is small and symmetric — a few percent off both sides at once — and
  no part of the composition is better for it. A deliberate crop is deep,
  usually anchored, and the panel reads worse without it.

  How far a declared crop may go, and why the test is the **bezel** rather than
  the screen, is `archetypes.md` § Axis 3 — *The frame has to remain a frame*.
  Nothing checks it mechanically: `strip-data.json` gives the device box and the
  panel size, so the crossing is measurable, but whether it was intended is only
  answerable against the concept line you stated.
- **Position blocks absolutely.** A statically positioned block cannot be moved
  by writing `left`/`top`, so it arrives in the editor unusable.
- **No external network assets.** No web fonts, no remote images. Everything
  resolves from the repo, or the editor and the export disagree.
- **Assets go in the strip's folder, referenced root-relatively.** Write new
  images to `strips/<device>/images/`, copy captures into
  `strips/<device>/screenshots/`, and reference them there. A strip that
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

**Say which copy you wrote.** Name the panels whose headlines you drafted and
where they now live (`input/app.md`), so the user knows what to review rather
than discovering it later in the render. If you resolved the panel count from
`panels`, or ignored an out-of-range value, that is one more line.

**On a set, report it as a set.** One line per target, saying which was the root
and which followed, so the whole run can be judged from the summary:

```
strips/iphone/    root      6 panels   rendered clean
strips/ipad/      follows   5 panels   rendered clean, 1 panel will optional if total screenshot images are 5
strips/phone/     follows   6 panels   rendered clean, if total screenshot images are 6
```

**Name any target you did not design.** This applies when a target was named and
the run was scoped to it: the other populated folders are still sitting there
with nothing to point at them. Give both routes explicitly, because a later run
left to its own devices applies the no-repeat rule and makes the second target
*deliberately* unlike the first:

```
Designed strips/ipad/ only, as asked.
input/iphone/, input/phone/ also have captures.
  to match this design — run with no target named, and `follows: ipad` in request:
  for different ones   — run naming each, no follows
```