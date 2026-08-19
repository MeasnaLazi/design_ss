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
