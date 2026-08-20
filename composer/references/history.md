# Run history

One line per design run, appended at the end of the run. The point is the
**last** line: a run reads it and must not repeat that concept.

This lives here rather than in the strip folder because a run *replaces*
`strips/<device>/` wholesale — anything recorded inside it is gone the moment
you re-run, which is exactly when the previous concept needs to be known.

Format — the same slots, in the same order, as the concept line the run states
before writing any markup. One source of truth; do not reorder one and not the
other.

```
<date> · <target> · <set rhythm> · <panel archetype> · <device treatment> · <type placement> · <background/palette> · <typeface> · <decor family, and what>
```

Example:

```
2026-08-09 · iphone · hero-plus-support · type-over-device · framed/bottom-crop · above · radial dark + gold · EB Garamond 400 + Inter · abstract (thin brass rule)
```

`<typeface>` is the title face and the body face, from `composer/fonts/` — see
`archetypes.md` § Axis 11. Recording it is what makes the no-repeat rule able to
see it; a run that omits the slot has almost certainly inherited the blank
template's Georgia without deciding anything.

Reading it back later also tells you what you have already tried for an app, and
what you have never once reached for.

**An empty log means the next run is a first run** — no previous concept to
avoid, choose freely. It does not mean the repo has no habits: check
`strips/<device>/strip.html` for what the last surviving strip actually did.

---

2026-08-18 · iphone · continuous-canvas · type-over-device · framed/bottom-crop, alternating bleed + ±5° tilt · above · warm ink ramp L→R, ember mood · EB Garamond 400 + Inter (Plex Mono folio) · representational (leaf watermark echoing the app icon)

2026-08-19 · iphone · hero-plus-support, supports alternate sides · full-bleed-screen hero + floating-card supports · bare/no-frame on P0, framed flat-front side-crop 17–24% no tilt on P1–4 · split (title top, subtitle bottom); hero type on a bone band · bone #f4f1ea→#e6e1d6 + ink #14161a, hero inverted, overcast mood · Space Grotesk 700 + Inter 400 · abstract (hairline rule under each title, one oversized ink ring cropped by a panel edge)

2026-08-19 · iphone · alternating (crop direction and type side flip panel to panel) · type-over-device ⇄ device-over-type · framed flat-front, no tilt; P0/2/4 inset 1180px cropped ~24% at the bottom, P1/3 wide 1320px bleeding both side edges and cropped 32–38% at the top · type above the device on P0/2/4, below it on P1/3, single left rail at 100px · forest-ink #0e1a15 ground + bone #f2ece1 + one amber #d98b4a accent, spotlight mood (glow cored on the edge where the device meets empty ground) · Lora 700 120px + Inter 400 · representational (one 170px mark per panel matching that panel's claim: page, waveform, route line, sparkle, nib) · social proof: declined, no real ratings yet
