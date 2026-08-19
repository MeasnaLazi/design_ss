# Strip design vocabulary

The menu a design run picks from. **Axes are independent** — a run chooses one
value per axis and combines them. Most useful combinations are not listed
anywhere below, because they are combinations, not entries.

## How to use this

1. Choose a **panel archetype** (structure) and a **set rhythm** (how the five
   panels relate). Those two decide the design.
2. Choose the remaining axes — device treatment, type placement, typeface,
   background, palette, decor — **independently**. Do not adopt the bundle some
   other strip happened to use.
3. Combinations absent from this file are allowed and encouraged. If none of the
   archetypes suits the app, **invent one and add it here** with a name.
4. A run must differ from the previous run in **the archetype and at least two
   of the structural axes** — set rhythm, device treatment, type placement,
   typeface, screenshot treatment, decor. Variety is a decision, not a hope.

   **Palette does not count.** When `app.md` pins `theme`, the palette is
   brand, not a choice — a run that "varied" by rewording the same two hexes has
   varied nothing. Mood (Axis 7) does count, and is usually the only colour
   decision available.

## How much to trust each line

Every claim below is one of four things. **Check the tag before obeying.**

| Tag | Means |
| --- | --- |
| **RULE** | Enforced by Apple. Breaking it risks rejection. Cited. |
| **CONVENTION** | What most professional strips do. Safe, unoriginal, usually right. |
| **OPINION** | Mine. Written from general familiarity, not from a survey or any data. Argue with it. |
| **MEASURED** | Your own A/B result. There are none yet. This is the tier that should grow. |

Untagged prose is description, not a claim.

**The honest caveat:** almost everything here is OPINION, written from general
knowledge of how store screenshots look — not derived from a survey, and not
from conversion data. It leans like an art director, which is a real bias: ASO
practice and design taste disagree in known places, and where they do, this file
sides with taste. It is also reliable on conventional moves and thin on unusual
ones — the ones worth stealing. When you see something on a store page whose
move is not in here, add it. The gaps are where the interesting work lives.

## RULE · what Apple actually requires

The only lines in this file that are not negotiable. Everything else is craft.

- **A screenshot must show the app in use** — "not merely the title art, login
  page, or splash screen." Text and image overlays are explicitly permitted, so
  headlines, badges and decoration are fine; a panel with no app content in it
  is the risky case. ([App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/))
- **It must represent the actual app.** Decorating, cropping and recolouring a
  real capture is fine. Inventing UI that does not exist is not.
- **One to ten screenshots**, `.png` / `.jpg`, at the platform's exact
  dimensions. ([Screenshot specifications](https://developer.apple.com/help/app-store-connect/reference/screenshot-specifications/))
- **The first one to three appear in search results** when there is no app
  preview — "make sure these highlight the essence of your app."
  ([Creating Your Product Page](https://developer.apple.com/app-store/product-page/))
- **One benefit per panel** — Apple's own wording: "Focus each subsequent
  screenshot on a main benefit or feature so that you fully convey your app's
  value." The closest thing Apple publishes to design guidance.

Apple documents constraints, not craft. There is no official guidance on
composition, typography or layout for store screenshots — the HIG covers
designing apps, not marketing assets. Everything past this section is
convention and opinion, which is why it is tagged.

---

## CONVENTION (cited) · what testing reports

Not Apple, not mine — published ASO testing. Directional rather than
authoritative: these are vendor blogs and single case studies, not controlled
research. But they are the only numbers in this file, so they outrank the
opinions below.

- **~70% of users never scroll past the first screenshot.** Nearly 100% see the
  first one to three; only ~9% see all of them.
  ([AppTweak](https://www.apptweak.com/en/aso-blog/ultimate-guide-to-screenshots-a-slash-b-testing),
  [ASO guide](https://explore.picc.co/app-store-screenshots-costing-downloads/))
- **Panel 0's job is to explain what the app does, at a glance.** In a Sensor
  Tower case study, reordering so the clearest screenshot came first gave a
  **+6.4% install lift** — the winning variant's defining property was exactly
  that.
  ([Sensor Tower](https://sensortower.com/blog/case-study-how-a-slash-b-testing-can-improve-your-apps-conversion-rates))
- **Top-stacked short headlines tend to outperform bottom captions.** This is a
  finding on Axis 4, which otherwise treats placement as a free choice. (Uncited
  — repeated across ASO writing rather than tied to one study; hold it a shade
  looser than the numbered claims above. Bottom captions also risk being cropped
  in some store placements, which may explain the pattern better than reading
  order does.)
- **Outcome-driven headlines beat feature-driven ones** — "Save an hour every
  day" over "Smart scheduling engine".
- Screenshot optimisation overall is reported at **20–35% conversion lift**.

The consequence for this file: panel 0 is not the place to be clever. Whatever
rhythm is chosen, panel 0 must show the app doing its job, legibly, with a
headline that says what it is.

## Axis 1 · Panel archetype

Structure only — where the mass sits. Not a look.

| Name | Structure |
| --- | --- |
| `type-over-device` | Headline top third, device below, cropped at the bottom edge. The default; safe, legible, everywhere. |
| `device-over-type` | Device top, headline beneath. Rarer, reads calmer, good when the screen itself is the argument. |
| `type-dominant` | Type owns 60%+ of the panel. Device small, cropped hard, or absent. For claims rather than features. |
| `full-bleed-screen` | The screenshot *is* the panel — edge to edge, no frame, no margin. Type overlaid on a dimmed or blurred region. Very strong; needs a screenshot that can carry it. |
| `device-bleed-side` | Device cropped off the left or right edge, often 30–50% gone. Type in the remaining column. Creates motion across the set when the side alternates. |
| `floating-card` | A UI element lifted *out* of the device screen and enlarged beside it — a notification, a row, a chart. The most-used "modern" move. Shows the feature without needing the whole screen readable. |
| `two-device-overlap` | Two frames, one behind the other, offset and usually at different scales. **Reach for it when two screens tell one story** — a before/after, a flow (compose → published), a state change — not because there were spare captures. Surplus captures are a reason to *choose better*, not to pack more in. `app.md` signals it with two filenames on one panel's `screenshot:` line. **Size them for two**: the standard width guide is written for a single dominant device, and applying it twice puts 2.6 phone-widths in a 1.7-phone-wide panel. See Axis 3 · Scale. |
| `split-panel` | Hard horizontal or vertical division — colour block one side, device the other. Graphic, poster-like. |
| `tilted-device` | Device rotated 3–15°, usually with a directional shadow. Buys energy from a single flat pose. |
| `annotated` | Callout lines or arrows from labels to UI elements. Instructional register; good for complex tools, deadly for consumer apps. |
| `statement` | No device at all. A sentence, a number, a logo. A breath in the middle of a set. **Review risk as panel 0** — Apple requires screenshots to show the app in use, and this one shows none. Safe as panel 2 or 3 among panels that do. |
| `collage` | Several small UI fragments arranged as a composition rather than one screen. Busy, energetic, hard to do well. |

## Axis 2 · Set rhythm

How the five panels relate. **This is the axis most often left uncontrolled, and
the one that most separates professional sets from generated ones.**

| Name | Behaviour |
| --- | --- |
| `uniform` | Same layout, only content changes. Safest and dullest. Reads as a template — which is exactly what it is. |
| `hero-plus-support` | Panel 0 is structurally different and louder; 1–4 share a quieter layout. The most common professional pattern. |
| `alternating` | Device side, or type position, flips panel to panel. Creates rhythm when scrolled. |
| `escalating` | Density or saturation increases across the set — calm opening, busy finish. Or the reverse. |
| `narrative` | Panels form a sequence: problem → action → result. Copy carries it; layout supports it. |
| `continuous-canvas` | Background, or a single graphic element, runs across panel boundaries so the set reads as one image when swiped. Highest-effort, highest-impact. Requires designing the strip as one 6450px canvas, which this pipeline already does natively — but see *What survives the gap* below before choosing what to run across. |
| `bookended` | Panels 0 and 4 carry claims; 1–3 carry features. Opens and closes on the argument rather than the feature list. **The bookends still show the app** — make them claim-led *layouts* (bigger type, more air), not the device-less `statement` archetype. Panel 0 especially: see CONVENTION (cited) above. |
| `zoom-sequence` | Progressively tighter crops of the same screen, each with a different label. Good for one dense feature. |

### What survives the gap

**The store never shows your panels edge to edge.** They appear as separate
images in a scrolling row, with visible spacing and rounded corners between
them. So cross-panel continuity is always an *approximation* — the eye is being
asked to join two pictures across a gutter. Some things it will happily join;
others read as a broken export.

| Survives the gap | Does not |
| --- | --- |
| A background, gradient or colour ramp walking across the set | A device cut in half |
| A horizontal rule, timeline or route line | A word split across two panels |
| A large soft shape or glow continuing | An icon or logo sliced |
| Texture, grain, a repeating pattern | A face, or any recognisable object |

The rule underneath: **continuity works for fields, not for objects.** A
gradient has no "correct" shape, so the eye interpolates across the gutter
without complaint. A phone does have one, and half a phone beside a gap is not
read as a continued phone — it is read as a mistake.

Two constraints that make this stricter than it sounds:

- **Every panel is also seen alone.** ~70% of viewers never scroll past panel 0,
  and search results show one to three. A panel that only makes sense next to
  its neighbour fails for most of the people who see it.
- **Blocks never actually cross a panel.** Panels are `overflow: hidden` and each
  is exported as its own PNG, so a block belongs to exactly one panel. The
  continuity is *composed*, not overflowed: each panel is self-contained, and the
  artwork is positioned so the pieces line up when the panels sit side by side.

If you want a device to appear to continue across two panels, that is **two
device blocks, one in each panel**, positioned so their edges align. Each panel
then still reads as a deliberate crop on its own — which is the standard look —
and together they gesture at continuity. Do not reach for a single block and
hope it bleeds; it cannot.

## Axis 3 · Device treatment

- **Framing** — framed in a device shell · bare screenshot with rounded corners ·
  bare and full-bleed · no device at all
- **Crop** — none (whole device visible) · bottom (20–50% off) · side · top
  (rare; only when bottom UI matters) · corner

  **Crop toward content, not toward chrome.** Depth is only half the decision;
  what stays visible is the other half. A status bar, a navigation row, a home
  indicator and a bezel are furniture — a panel showing mostly those has spent
  its space on the parts of a phone nobody is buying. The visible slice must
  carry app content that proves the headline.

  Past roughly 60% cropped you are showing a sliver, and the panel needs
  something else to lead it. Check the render, not the intention.
- **Scale** — as a multiple of the pose's viewBox width, which is the only
  number that travels between poses:

  | | **× panel width** | × viewBox width | when |
  | --- | --- | --- | --- |
  | dominant | **0.85–1.05** | 1.4–1.75 | the device is the subject of the panel |
  | balanced | **0.65–0.85** | 1.1–1.4 | device and type share the panel |
  | incidental | **0.35–0.6** | 0.6–1.0 | one element among several — `floating-card`, `collage` |
  | **two in one panel** | **0.5–0.7 each** | 0.85–1.2 | and overlap them by a third or more |

  **Panel width is the primary number.** The viewBox multiple is blind to the
  box the device is going into: for `appstore_iphone_portrait` + `front`, the
  once-stated "1.0–1.3 × viewBox" lands at **0.60–0.78 of panel width**, which
  leaves 22–40% of the panel as empty column either side of the phone. That is
  arithmetic, not taste — and it is how a strip passes every other check and
  still looks half-finished. Keep the viewBox multiple only as a sanity check
  when comparing across poses. See `composer/device-frames/README.md` for the
  full table.

  The last row is the one that gets missed. The dominant range assumes *one*
  device; used twice it asks for about 2.6 phone-widths inside a panel a little
  over 1.7 phone-widths wide, and the two collide. Two devices that merely sit
  side by side without overlapping read as a row of small phones rather than as
  a composition — the overlap is what makes it one object instead of two.
- **Angle** — flat front · rotated 3–8° (subtle) · rotated 10–20° (energetic) ·
  perspective/isometric if the pack has such a pose
- **Depth** — flat on background · drop shadow · coloured glow · resting on a
  drawn surface or plane · behind a foreground element
- **Escape** — a UI element breaking out of the screen bounds (card, badge,
  cursor, notification). Strong and cheap; the frame stops being a box.

With only one pose available, `angle` and `crop` are what buy variety. A front
frame rotated −6° and cropped at the bottom-left reads very differently from the
same frame square and centred.

## Axis 4 · Type placement

- Above the device · below it · beside it (device cropped to a column)
- **Overlapping** the device's top or bottom edge — needs explicit `z-index`
- **Behind** the device — oversized word, device covering part of it
- Inside a shape — pill, card, ribbon, tag
- Full-panel, device absent
- Split — title top, subtitle bottom, device between them
- Vertical or rotated (rare; use once at most across a set)

## Axis 5 · Headline mechanics

**OPINION throughout**, except where it restates Apple's one-benefit rule.

- **Length** — 2–5 words is the working range. Past 7 it stops being read at
  thumbnail size, which is the size that matters in search results.
- **Lines** — 1 to 3. Where you break the line is a design decision, not
  overflow: break on meaning.
- **Case** — sentence case (warm, current) · Title Case (neutral, corporate) ·
  ALL CAPS (loud, needs generous letter-spacing) · lowercase (casual, risky)
- **Voice** — imperative verb ("Track every rep") · benefit claim ("Sleep
  better by Friday") · number-led ("3 taps to log a meal") · plain noun label
  ("Offline maps")
- **Accent** — one word coloured, italic, or in the display face while the rest
  stays neutral. Cheap emphasis, works at any size.
- **Continuation** — a single sentence running across all five panels. Binds the
  set; fails badly if anyone reads them out of order, which they do.
- **Subtitle** — earns its place or is cut. A subtitle restating the title is
  the most common weakness in amateur strips.

## Axis 6 · Background system

- `flat` — one colour. Underrated; makes type and device do the work.
- `linear` — two or three stops, vertical or diagonal.
- `radial` — a glow, usually behind or above the device, or in one corner.
- `mesh` — several soft blurred blobs overlapping. Contemporary, easily muddy.
- `photographic` — a photo, usually heavily dimmed or blurred.
- `textured` — noise, grain, paper, subtle pattern over a flat or gradient base.
- `pattern` — grid, dots, rules, repeating marks.
- `continuous` — one background spanning the whole strip (see set rhythm).
- `per-panel-shift` — hue walks across the set; each panel a step along a ramp.
- **Inversion** — all light, all dark, or one inverted panel as a break. Dark
  strips have become standard for anything with a dark mode, and showing dark
  mode is close to expected now.

**CONVENTION · the store page behind the panels.** The panels sit on a page that
is white or near-black depending on the viewer's theme, and you do not get to
pick which. A pure-white `flat` panel dissolves into the light store page — no
edge, no object, just floating type — and a near-black one does the same in dark
mode. Either commit to a ground that separates from both, or keep the
composition contained enough that the panel still reads when its own edges
vanish. Check the render against both a white and a near-black surround, not
against the editor's neutral grey.

## Axis 7 · Palette strategy

- Brand colour + neutral ground + dark ink — the default
- Dark ground + light ink + one accent — currently the most fashionable
- Monochrome + a single accent used three times or fewer
- Duotone — screenshots recoloured into two-tone to unify a messy UI
- Complementary high contrast — energetic, hard to keep tasteful
- Palette pulled from the app icon — free coherence, and nobody does it enough

Rule that survives every palette: check contrast against **the render**, not the
intent. A gradient that is fine at the top of the panel can swallow a subtitle
200px lower.

### Mood — atmosphere, not colour

**A mood is not a palette.** It is how a palette is deployed: where the light
comes from, how hard the falloff is, how much air, how cold. Two runs with the
*same two hexes* produce visibly different strips under different moods — which
matters here, because `app.md` usually pins the colours. This is the one part of
Axis 7 that stays free when the brief fixes the palette.

| Mood | Light, falloff, feel |
| --- | --- |
| `midnight` | Near-black ground, cold, one small light source. High contrast, hard edges, lots of empty. Still. |
| `ember` | Dark ground, warm glow low and behind the device, soft long falloff. Intimate. |
| `golden hour` | Warm ground, light raking from one side, long soft shadows, amber-to-violet drift. |
| `dawn` | Pale, cool drifting to warm, low contrast, generous air. Quiet and optimistic. |
| `overcast` | Flat neutral, no glow at all, even light, ink-black type. Sober; lets the UI speak. |
| `parchment` | Warm off-white ground, sepia ink, faint grain. Archival, literary. |
| `neon` | Dark ground, saturated cyan/magenta bloom, high chroma, glow on everything. |
| `clinical` | Pure white, hard edges, one saturated accent, no gradient anywhere. Precise. |
| `deep water` | Saturated dark blue-green, light from above, heavy falloff. Calm and serious. |
| `spotlight` | Any ground, one tight radial behind the device and near-black elsewhere. Theatrical. |

Pick a mood even when the palette is fixed. It is usually the only colour
decision left, and leaving it unmade is how three runs end up looking identical.

## Axis 8 · Decor vocabulary

**OPINION.** The orderings below are aesthetic judgements, not findings.

**Two families. Say which one you chose, in the concept line.** Ten consecutive
runs of this repo picked abstract every single time — rules, pills, rings,
numerals, grain, glow, bars, dots — and never once considered a representational
mark. That is a default, not a decision. Abstract may well be right; it has to
be chosen.

### Family A · Abstract & typographic

Ordered roughly by how much they cost in taste:

- Nothing at all
- Device shadow or glow treated as the only decorative element
- Geometric shapes — circles, arcs, rings, bars, often cropped by the panel edge
- Blurred colour blobs
- Rules and dividers
- Numerals, folio marks, chapter tags — type used as ornament
- Badges and pills — "New", "Offline", "No account needed"
- Grain or noise overlay across the whole panel
- Hand-drawn marks — underline, circle, scribble arrow
- Particles, confetti, sparkles (use once, or not at all)

### Family B · Representational — a mark that means something

A symbol carries meaning the abstract family cannot: a lock *says* private in a
way a ring never will. Grouped by what they claim, because that is how you pick
one:

| Claim | Marks |
| --- | --- |
| private, secure | lock, shield, key, closed eye, fingerprint |
| offline, sync | cloud, struck-through cloud, aeroplane, circular arrows, struck-through wifi |
| fast, effortless | bolt, stopwatch, feather, arrow through |
| time, history | clock, hourglass, calendar, timeline dot, rings of a tree |
| writing, journal | pen, quill, page, folded corner, open book, bookmark, ink drop |
| voice, audio | microphone, waveform, concentric sound arcs |
| photos, media | camera, stacked frames, film strip, aperture |
| AI, magic | four-point sparkle, wand, small burst, orbiting dots |
| growth, progress | line chart, rising arrow, progress ring, stair steps |
| quality, delight | heart, star, crown, laurel, medal |
| calm, nature | leaf, moon, sun, droplet, mountain line, wave |
| place, reach | pin, globe, compass, route line |
| structure | tag, folder, stacked layers, grid, brackets |

All of them are one or two SVG paths — see *Drawing it* below.

**Placements that are not the cliché.** The move to avoid is a **row of three to
five equal icons under a headline**: that reads as a feature list, which is what
Apple's one-benefit-per-panel and the outcome-over-feature finding both argue
against. It is the row that fails, not the symbol. These work:

- **Watermark** — one mark at 600–900px, 5–10% opacity, cropped by a panel edge,
  sitting behind everything. Enormous and quiet.
- **Inside a badge** — one small mark beside a short label. That is a `group`,
  so both parts stay editable.
- **Instead of a bullet** — when a panel genuinely lists two or three points.
- **Echoing the app icon** — lift the icon's own motif and repeat it as decor.
  This repo has done it once (run 34, "echoes the app icon's swirl") and it is
  the strongest option available, because nobody else on the store page can use
  it.
- **The whole decor of a `statement` panel** — one symbol, one line of type.
- **A terminal mark** — a single symbol on the last panel, closing the set.

**Scale and weight.** At 1290px wide, a mark below roughly 80px stops reading;
120–200px is a comfortable label size and 600px+ is a watermark. Match stroke
weight to the type — a hairline icon beside a heavy serif looks borrowed, which
it should not, because you drew it.

### Choosing between the families

Abstract suits editorial, literary and premium registers, and anything where the
screenshots are already busy. Representational suits claims that are hard to
show — privacy, offline, speed — where a symbol does work no amount of geometry
can. Mixing is fine; leading with both is not, since the panel then has two
things asking to be looked at.

### Drawing it — you do not need an image file

Decor is free HTML/CSS, and **an inline `<svg>` is a first-class decor block**:
put `data-layer="decor"` and `position:absolute` on the `<svg>` itself and it
renders, exports, and is selectable, movable and resizable in the editor like
any other block. Shapes *inside* it are that block's business — `check-schema`
stays quiet about them. There is a regression test for exactly this
(`strip_editor/test/svg-decor.test.mjs`).

So the shape vocabulary is not limited to what someone drew earlier:

| Want | How |
| --- | --- |
| star, badge, chevron, any polygon | CSS `clip-path: polygon(...)` on a decor div |
| circle, ring, arc, pill | `border-radius`, or `<circle>` / `<path>` with `fill:none; stroke:` |
| cloud, blob, leaf, quote mark | a few overlapping `<circle>`/`<ellipse>`, or one `<path>` |
| sparkle, four-point star, burst | one `<path>` with cubic curves |
| waveform, timeline, route line | `<path>` or a row of `<rect>`s; `stroke-linecap:round` |
| dot grid, hatch, rules | `<pattern>`, or a repeating CSS gradient |
| grain, paper texture | `<feTurbulence>` at low opacity over the panel |
| soft glow, aura | `<feGaussianBlur>`, or a CSS radial gradient |
| progress ring, pie | `conic-gradient`, or `stroke-dasharray` on a `<circle>` |
| hand-drawn underline, circle-around | a single `<path>` with a slightly irregular curve |

Two placements, and the choice matters:

- **Inline in the strip** — colours can use `currentColor` or the theme's CSS
  variables, so the shape follows the palette and the editor can restyle it.
  Use for anything themed. This is the default.
- **A standalone `.svg` in `strips/<device>/images/`, as an `image` block** —
  gets the image inspector and a swappable `src`, but its colours are baked in.
  Use for something repeated across panels.

An icon *with* a label is a **group** (`data-layer="group"` holding an
`image`/`svg` child and a `text` child), so both stay selectable — see
`composer/strip-schema.md` § Group blocks.

Restraint still applies: everything above is cheap to make, which is exactly why
a panel ends up with five of them. The decor list is ordered by cost in taste
for a reason.

## Axis 9 · Screenshot treatment

Frequently forgotten, and it changes a strip more than decor does.

- As captured
- Cropped to a region — one card, one row, one chart, enlarged
- Dimmed or blurred behind overlaid type
- Recoloured or duotoned to match the palette
- Simplified — a mock screen with less content than the real one, so it reads at
  thumbnail size. (Check store rules: it must still represent the actual app.)
- Content chosen for the panel's claim rather than whatever was on screen — a
  capture showing a *full* week of data argues better than an empty state
- Populated with plausible content — human names, believable entries, sensible
  numbers. "Test test" and lorem in a shipped panel say nobody looked.
- Status-bar hygiene — full signal, full battery, a clean time (Apple's own
  marketing uses 9:41). A 3% battery at 2:47am is a story the panel did not
  mean to tell.

## Axis 10 · Social proof

The axis this file forgot. A strip argues; proof closes. A rating, a quote or an
award is the one block on the panel the viewer knows the developer did not write
about themselves — which is why it converts, and why inventing one is punished.

- **RULE-adjacent** — proof must be real: a rating the app actually holds, a
  review that actually exists, an award actually received. Fabricated praise is
  a review risk on top of a trust risk. And the
  [App Store Marketing Guidelines](https://developer.apple.com/app-store/marketing/guidelines/)
  govern Apple imagery — no App Store badges, Apple logos or Apple UI drawn into
  a panel.
- **Forms, cheapest first** — star row with the number ("4.8 ★") · user count
  ("Join 200k journalers") · one short review quote, attributed the way stores
  attribute them ("— App Store review") · laurel or award mark · "Featured by"
  only when true.
- **OPINION · dose and placement** — one proof element per set is the
  professional dose. It belongs on panel 3 or 4, after the argument has been
  made; panel 0's job is fixed by the CONVENTION section above, and a rating
  cannot do that job. The exception that works: a small rating badge tucked
  under panel 0's headline, because it does not compete for the same read.
- A quote is a headline-mechanics problem (Axis 5): keep it under ~12 words, cut
  the ramble with an ellipsis, and set it smaller than a claim would be — proof
  supports, it does not shout.
- **"No" is a legitimate answer** — a new app with no ratings should not fake
  the register of one that has them. Say the axis was considered and declined.

## Axis 11 · Typeface

The title is the largest object on the panel — 104–128px against a 1290px width
— so the face carries more of the design than the palette does.

This is the one axis with a **default**: a strip that names no face gets
`blankStripTemplate`'s Georgia title over an `-apple-system` body. That is
inheritance, not a decision, and it looks identical to a decision in the render.
Name the pairing.

### The library

Self-hosted woff2 in `composer/fonts/`, referenced root-relatively. **Never a
web font** (`strip-schema.md` § 5, and `check-schema.mjs` fails the build on
one), and never a bare host font name for a face the design *chose* — Georgia
and `-apple-system` resolve off whatever machine renders, so they are fallbacks,
not decisions.

**Every strip declares the whole library and uses two of it.** The canonical
block — thirteen `@font-face` rules and six `:root` vars — is in
`composer/fonts/README.md`; copy it verbatim and point each text role at a var.
Declaring a face nothing uses costs nothing (the browser fetches on first use,
measured: 13 declared, 2 fetched), and declaring all of them is what puts all
six families in the editor's family dropdown, where a human can change the
typeface without touching CSS. Choosing here means choosing *which var each role
points at*, not which files to declare.

Below is what each face is *for*; the README has the mechanics and the weights
each one actually ships.

| Face | Weights here | What it is for |
| --- | --- | --- |
| **EB Garamond** | 400, 400 italic | Old-style serif. Literary, unhurried, slightly austere. Reading apps, journals, anything arguing for depth. No bold — see the README. |
| **Lora** | 400, 700 | Contemporary serif with more contrast and a sturdier bold. The serif to pick when the title needs weight. |
| **Inter** | 400, 600, 700 | Neutral grotesque, designed for screens. The default body and caption face; a competent title face when set at 700 and tracked tight. |
| **Poppins** | 400, 700 | Geometric sans, circular and friendly. Consumer, wellness, anything cheerful. Wide — long headlines run out of panel. |
| **Space Grotesk** | 400, 700 | Grotesque with deliberate quirks in the g, a and k. Tech, tools, indie. Reads as designed rather than defaulted. |
| **IBM Plex Mono** | 400, 600 | Mono. Not a title face — a kicker, label or caption face, and an instant genre signal for a developer tool. |

### Pairings, which is the real unit

Three text roles (`title`, `subtitle`, `caption`) means the choice is a pairing,
not a font. **OPINION**, all of it:

- **EB Garamond 400 + Inter** — editorial. The title is quiet and large; the
  interface voice underneath it is neutral. Best when the app is about words.
- **Lora 700 + Inter** — the same register with a title that can shout. Safest
  serif/sans pairing here.
- **Poppins 700 + Inter** — warm and consumer. Watch the width: Poppins at 104px
  fits roughly three words to a line, not five.
- **Space Grotesk 700 + Inter** — contemporary and a little sharp. The pairing
  that reads least like a template.
- **Inter 700 + Inter 400** — one family, contrast carried entirely by weight
  and size. Underrated: a great many professional strips are exactly this, and
  it never looks borrowed.
- **· + IBM Plex Mono for captions** — a modifier on any of the above, not a
  pairing of its own. One mono kicker per panel; a mono *subtitle* is a wall.

### Guardrails

- **CONVENTION · thumbnail first.** The strip is judged at ~150px wide (see
  Store constraints below). Anything hairline, extra-light, or high-contrast at
  display size dissolves there. Nothing in this library is a hairline face, and
  that is deliberate — do not add one without checking it scaled down.
- **One display face per set.** Two decorative faces plus a body face is three,
  and three is where strips start looking like a font specimen.
- **The body role stays neutral.** Character belongs in the title. A subtitle in
  Space Grotesk and a title in Poppins fight each other at every size.
- **No faux anything.** Declare a real `@font-face` for every weight used. Ask
  for 700 with only a 400 file loaded and the browser synthesises a bold, which
  at 118px looks exactly like the mistake it is. Same for italic.
- **OPINION · tracking follows size.** Type cut for text loses its fit at display
  size: at 100px+, `letter-spacing: -1px` to `-3px` on a title is usually right,
  and ALL CAPS kickers want positive tracking (Axis 5 already says this — it
  applies harder once the face is a choice).
- The face is not the palette's problem. A pinned `theme` in `app.md` does not
  pin the type, so this axis stays free even on the most constrained brief —
  same property that makes mood useful in Axis 7.

## Store constraints worth designing around

The hard ones are in **RULE** above. These are the practical consequences.

- **CONVENTION** — Everything must survive **thumbnail size**. This is the real
  reason headlines are short and type is enormous; it follows directly from
  Apple's point about the first three appearing in search results. Make it a
  check, not a hope: view the render scaled to **~150px wide**. If the headline
  is not readable there, it is not readable where most installs are decided.
- **CONVENTION** — **Safe margins.** Store placements crop and round-corner-mask
  panels in ways that vary by surface. Keep text and anything load-bearing about
  **100px off every edge** at 1290 wide. Backgrounds and decor may bleed; words
  may not.
- **OPINION** — **Localisation**: if the strip will be translated, leave text
  blocks around 30% growing room. German and Finnish will find your tightest
  line. The 30% is a rule of thumb, not a measurement.
- **CONVENTION** — App Store and Play differ in aspect and in how many panels
  show. Never reuse a set across both without re-checking panel 0.
- **Worth checking yourself:** Apple's
  [App Store Marketing Guidelines](https://developer.apple.com/app-store/marketing/guidelines/)
  govern how Apple hardware may be depicted in marketing material. The device
  frames in `composer/device-frames/` are drawn iPhone artwork, so read what
  they permit rather than assuming.

## Anti-patterns

**OPINION.** This is the list I would expect to be most wrong. Several are
near-universal (a subtitle restating the title); others are contestable — the
`annotated` style in particular is often reported to convert well precisely
because it explains value, whatever it does to elegance.

These recur, and every one of them is a decision someone made:

- **Dead space, measured as area — not just as a band.** Three checks, and the
  second is the one that gets missed:
  1. **Empty band** — a fully empty horizontal strip more than ~15% of panel
     height. Usually a device pushed too far off an edge, or type that stopped
     short.
  2. **Empty columns** — a fully empty vertical strip more than ~10% of panel
     width running most of the panel's height. This is what an undersized device
     produces: two tall gutters either side of the phone. A band check cannot
     see it, because every row contains *something*.
  3. **Total coverage** — union of all layer boxes below roughly **70% of panel
     area**, on a panel meant to be dense. `strip-data.json` has every box, so
     this is arithmetic, not an impression. A deliberately airy `type-dominant`
     or `statement` panel is exempt; say so rather than letting it slide.
- A subtitle that restates the title
- More than seven words in a headline
- A device so small the screen is unreadable at any size
- Five structurally identical panels — a template, not a design
- Gradients chosen for prettiness that leave type at 2:1 contrast
- Drop shadows heavy enough to muddy the background around the device
- Feature names where benefits belong ("Cloud sync" vs "Your notes on every
  device")
- Screenshots of empty states
- Decor competing with the device for the same focal point
- A panel with two things claiming to be the subject
- Social proof the app does not have — an invented quote, a rounded-up rating,
  a laurel from nowhere. A review risk, not a taste risk (Axis 10).
- A flat background that matches the store page behind it, so the panel's edges
  vanish and the type floats on the store's own white (Axis 6, the store page)

## Failures seen here

Observed in this repo's own output. The most trustworthy section in the file,
because it is the only one describing something that actually happened.

**`bio`, 2026-08-10 — panels 0 and 4, `bookended`.** The device was set to
1550px wide (2.0× the pose's viewBox width, against a 1.0–1.3 guide) and pushed
so far off the edge that **78% of it was cropped on panel 0 and 64% on panel 4**.
What remained visible was a status bar and a navigation row on one, a home
indicator and the bottom bezel on the other. Panel 0 — the panel ~70% of
visitors never scroll past — was roughly 45% empty black, and did not show what
the app does.

Three causes, worth separating:

1. `bookended` said its bookends were *statements*, and `statement` means no
   device. Fixed above.
2. The stated ranges for crop depth and device width were both simply exceeded.
   Ranges in a file do not enforce themselves; check the render against them.
3. Nothing said *what the visible part of a cropped device must contain*. Now it
   does, under Axis 3.

Fixed by sizing the device to 950px (1.23×) and cropping 7% and 2%.

## Growing MEASURED

The MEASURED tier is empty because nothing has been tested, not because nothing
is testable. When a strip ships, the first test is already known:

1. **Test panel 0 first** — concept before caption, caption before anything
   else. It is ~70% of the audience; no other panel can repay a test faster.
2. **One variable per test.** A variant that changes the archetype *and* the
   headline produces a winner and no knowledge.
3. The native tools are App Store **Product Page Optimization** and Play Store
   **listing experiments**; the deciding metric is conversion,
   impressions → installs. Let a test run to significance, not to impatience.
4. When a result lands, write it into this file tagged **MEASURED**, with the
   date and the lift. One measured line outranks every OPINION above it — that
   is the whole point of the tag system.

## Choosing, per run

1. Read the app: summary, tone, category, the screenshots themselves.
2. Pick **set rhythm** first — it constrains everything else and is the axis most
   likely to be left on `uniform` by accident.
3. Pick the **archetype** for the supporting panels, and decide how panel 0
   differs.
4. Pick the remaining axes independently. Say what you picked, in one line, so
   the choice is visible and can be rejected before anything is built. **Name
   the decor family** (abstract or representational) — it is the axis this repo
   has never once chosen deliberately. **Name the type pairing** (Axis 11) —
   naming it is what makes it a choice; say nothing and the strip silently
   inherits the blank template's Georgia. **Say whether the set carries social
   proof** (Axis 10) — "no" is a fine answer, but it has to be an answer.
5. Do not repeat the previous run's archetype, and change at least two
   **structural** axes — rhythm, device treatment, type placement, typeface,
   screenshot treatment, decor. A pinned palette cannot be one of them; mood
   and typeface can.
