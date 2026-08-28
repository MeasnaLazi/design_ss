# Run history

One line per concept, appended at the end of the run that chose it. The point is
the **last** line: a run reads it and must not repeat that concept.

Per *concept*, not per run: a follow-run (`follows:` in `app.md`) repeats a
concept rather than choosing one, and appends nothing. Otherwise porting one
design to four other targets would write four more lines saying the same thing,
and bury the concept the next run is supposed to vary from.

This lives here rather than in the strip folder because a run *replaces*
`strips/<device>/` wholesale — anything recorded inside it is gone the moment
you re-run, which is exactly when the previous concept needs to be known.

Format — the same slots, in the same order, as the concept line the run states
before writing any markup. One source of truth; do not reorder one and not the
other.

```
<date> · <target> · <set rhythm> · <panel archetype> · <device treatment> · <type placement> · <background/palette> · <typeface> · <decor family, and what> · <register>
```

Example:

```
2026-08-09 · iphone · hero-plus-support · type-over-device · framed/bottom-crop · above · radial dark + gold · EB Garamond 400 + Inter · abstract (thin brass rule) · register: dark heritage
```

`<typeface>` is the title face and the body face, from `composer/fonts/` — see
`archetypes.md` § Axis 11. Recording it is what makes the no-repeat rule able to
see it; a run that omits the slot has almost certainly inherited the blank
template's Georgia without deciding anything.

`<register>` is the gestalt in one or two words — *literary editorial*,
*dark tech* — and it counts as a structural axis for the no-repeat rule; see
`archetypes.md` § How to use this. Older lines predate the slot and do not
carry it — when varying from one of those, read the register out of the rest
of the line and say that you inferred it.

Reading it back later also tells you what you have already tried for an app, and
what you have never once reached for.

**An empty log means the next run is a first run** — no previous concept to
avoid, choose freely. It does not mean the repo has no habits: check
`strips/<device>/strip.html` for what the last surviving strip actually did.

---

2026-08-26 · iphone · escalating (the ink sheet grows panel to panel: 940 → 1180 → 1500 → 1980 → full 2796, the set descending from page into night) · split-panel · framed flat-front, no tilt; bottom-crop 21/12/15/23% on P0–2 and P4, P3 uncropped and smaller so the AI actions at the foot of the screen survive · type inside a shape — kicker, title and subtitle reversed out of the ink sheet, single left rail at 110px · paper #f1e7d6→#e4d5ba ground + warm ink #1c1712 + rust #c9633f accent (rust traced to the app's own red waveform and the Golden Gate captures), golden hour mood — a long shadow pool where the device rests on paper, a warm bloom where it rests on ink · Poppins 700 + Inter 400 (IBM Plex Mono folio "BIO — 0N") · representational (a turned page corner: the ink sheet dog-eared at top-right, the fold deepening 160 → 280px with the sheet) · social proof: declined, no real ratings yet

2026-08-27 · iphone · hero-plus-support, alternating · full-bleed-screen hero + device-bleed-side supports · bare/no-frame on P0, framed flat-front side-crop 40% on P1–4 · type overlaid on dim on P0, beside device on P1-P4 · midnight mood (near-black #0c0c0a ground, light text, crimson #d43542 accent) · Space Grotesk 700 + Inter 400 · abstract (large blurred crimson radial behind the type block)

2026-08-27 · iphone · bookended · type-over-device (P1–3) + type-dominant bookends (P0,4) · framed flat-front, P1/3 tilted ±4.5° cropped ~13% bottom, P0/2/4 flat and cropped ~13% bottom · above the device, left rail at 110px · parchment mood (#f5f2eb ground, #1c1917 sepia ink, #c2410c warm coral accent) · Lora 700 + Inter (IBM Plex Mono kicker) · representational (custom editorial SVG marks above titles: quill, soundwave, calendar grid, pen-nib with sparkle, shield with check)
2026-08-27 · iphone · narrative · device-over-type · framed flat-front, centered with generous side margins and uncropped top · below the device in a dedicated lower band · warm paper sequence (#f5f0e8 → #eee4d7 → #f7f2e9 → #e9e1d6 → #f3ede3) + sepia ink #1c1917 + rust #b9472d, intimate editorial mood · EB Garamond 400 + Inter 400 (IBM Plex Mono folio) · abstract (rust top rule, hairline divider, recurring accent bar)

2026-08-28 · iphone · mirrored (P0↔P4, P1↔P3, P2 the pivot; the lifted card is what mirrors — the outer pair has one, the inner pair does not, the pivot has the mark instead) · floating-card on P0/P4 + type-over-device on P1/P3 · framed flat-front, no tilt; P0/P4 1120px bottom-cropped 16.7% and offset to opposite sides, P1/P3 1020px cropped 9.6%, P2 1180px centred cropped 15.2% · rail flips side across the set — left on P0/P1, centred on P2, right on P3/P4; type always above the device · bleached stone #e4e1db (faint radial, near-flat) + pure ink #121212 + muted #5c584f, the only saturated colour anywhere is the app's own lifted UI, bleached mood · Inter 700 116px + Inter 400 52px · representational (the app icon's leaf mark, mirrored in scale and flipped in direction across the set: 760px on P0/P4, 980px on P1/P3, and 168px solid crimson #c43029 at the pivot) · social proof: declined, no real ratings yet · register: bleached gallery

2026-08-28 · iphone · broken-uniform (P0/P1/P3/P4 hold one strict symmetric layout; P2 is the breach — the deck opens into a single full-bleed page and the ground disappears entirely) · screen-deck (one framed leading device with two bare pages fanned ±5° behind it, cropped by the panel sides) + full-bleed-screen on the breach · framed flat-front iphone_15_pro, uncropped, 848px (0.66 of panel) standing on the horizon rather than cropping at the bottom edge; deck pages darkened to 0.33 and blurred 4.5px so they read as depth, not content · type above the device on a centred rail (poster/declarative — deliberately not the 100–110px left magazine rail of eight prior runs); titles bottom-aligned to a common line so the two-line P0 and the one-line rest share a baseline · horizon ground: deep blue-green sky #1a4744 → #0a2325 with a soft light source above, a hard seam at the device foot (85.4%), near-black floor #04090a; deep water mood — light from above, heavy falloff, a teal light pool with a warm core where the device meets the floor; amber #e3a24a the only warm note · Space Grotesk 700 96px + Lora 400 48px (IBM Plex Mono kicker) — the reverse pairing · abstract (an amber hairline under each kicker, the horizon light-line, the foot pool — three quiet things, no marks) · social proof: declined, no real ratings yet · register: night library
