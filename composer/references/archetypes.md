# Strip design vocabulary

The menu a design run picks from. **Axes are independent** — a run chooses one
value per axis and combines them. Most useful combinations are not listed
anywhere below, because they are combinations, not entries.

## How to use this

1. Choose a **panel archetype** (structure) and a **set rhythm** (how the five
   panels relate). Those two decide the design.
2. Choose the remaining axes — device treatment, type placement, background,
   palette, decor — **independently**. Do not adopt the bundle some other strip
   happened to use.
3. Combinations absent from this file are allowed and encouraged. If none of the
   archetypes suits the app, **invent one and add it here** with a name.
4. A run must differ from the previous run in **the archetype and at least two
   of the structural axes** — set rhythm, device treatment, type placement,
   screenshot treatment, decor. Variety is a decision, not a hope.

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
  finding on Axis 4, which otherwise treats placement as a free choice.
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

  | | × viewBox width | when |
  | --- | --- | --- |
  | dominant | 1.0–1.3 | the device is the subject of the panel |
  | balanced | 0.7–1.0 | device and type share the panel |
  | incidental | 0.4–0.7 | one element among several — `floating-card`, `collage` |
  | **two in one panel** | **0.6–0.9 each** | and overlap them by a third or more |

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

**OPINION.** The ordering below is an aesthetic judgement, not a finding.

Ordered roughly by how much they cost in taste:

- Nothing at all
- Device shadow or glow treated as the only decorative element
- Geometric shapes — circles, arcs, rings, bars, often cropped by the panel edge
- Blurred colour blobs
- Badges and pills — "New", "Offline", "No account needed"
- Feature icons in a row beneath the headline
- Rules and dividers
- Ratings, star rows, award laurels, press logos (social proof)
- Arrows or pointers connecting a label to a UI element
- Grain or noise overlay across the whole panel
- Hand-drawn marks — underline, circle, scribble arrow
- Particles, confetti, sparkles (use once, or not at all)

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
- **A standalone `.svg` in `strips/<app-name>/images/`, as an `image` block** —
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

## Store constraints worth designing around

The hard ones are in **RULE** above. These are the practical consequences.

- **CONVENTION** — Everything must survive **thumbnail size**. This is the real
  reason headlines are short and type is enormous; it follows directly from
  Apple's point about the first three appearing in search results.
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

- **Dead space.** A region larger than about a quarter of the panel with
  nothing in it. Almost always the symptom of a device pushed too far off the
  edge, or type that stopped short — see *Failures seen here*.
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

## Choosing, per run

1. Read the app: summary, tone, category, the screenshots themselves.
2. Pick **set rhythm** first — it constrains everything else and is the axis most
   likely to be left on `uniform` by accident.
3. Pick the **archetype** for the supporting panels, and decide how panel 0
   differs.
4. Pick the remaining axes independently. Say what you picked, in one line, so
   the choice is visible and can be rejected before anything is built.
5. Do not repeat the previous run's archetype, and change at least two
   **structural** axes — rhythm, device treatment, type placement, screenshot
   treatment, decor. A pinned palette cannot be one of them; mood can.
