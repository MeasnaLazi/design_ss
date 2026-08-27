# Type library

Self-hosted woff2 for the typeface axis (`skills/strip-design/archetypes.md`,
Axis 11). Served at `/composer/fonts/**` by both the export server
(`composer/render.mjs`) and the editor — the same route `device-frames/` uses,
and for the same reason: this is a repo-global library, not a per-strip asset.

```
OFL.txt                        SIL Open Font License 1.1 — covers every file here
<family>/<Family>-<Weight>.woff2
```

## Read the files, not this file

**The library is whatever is on disk.** Faces get added when a run needs one and
removed when nobody picks them, so a table here would describe the repo on the
day someone wrote it.

```bash
ls composer/fonts/*/                       # what exists
ls -l composer/fonts/inter/                # and what it costs
```

## Why the files are in the repo

A strip must render identically on any machine, offline, forever. Two rules
follow, and both are already enforced:

- **No web fonts.** `composer/strip-schema.md` § 5 says it, and
  `check-schema.mjs` now scans CSS `url()` as well as `src=`/`href=`, so
  `src: url(https://fonts.gstatic.com/…)` is a hard error rather than something
  that quietly works on the author's machine.
- **No host fonts either, for anything the design chose.** `render.mjs` resolves
  a bare `font-family: Georgia` from the host. That is fine as a *fallback* and
  useless as a *decision* — the same strip rendered on Linux is a different
  strip. A face named by Axis 11 must be `@font-face`d from this folder.

The failure mode both rules exist for is silent. `render.mjs` waits on
`document.fonts.ready`, which resolves whether the font arrived or failed, and
aborts only on `window.__composerErrors`, which a failed font never touches. A
missing face therefore exports at full size, exit 0, in the fallback typeface.
The `check-schema.mjs` disk check is the only thing standing between a typo and
a shipped strip in the wrong face — run it before rendering.

## Using a face in a strip

**Declare the whole library, use two.** Every strip carries the same block —
thirteen `@font-face` rules and six `:root` vars — and each text role points at
one var. This is the canonical text; `blankStripTemplate` emits it verbatim, and
a designed strip should copy it rather than hand-rolling a subset.

```css
  /* Type library — composer/fonts/. All declared, fetched only when used. */
  @font-face { font-family: 'EB Garamond'; src: url('/composer/fonts/eb-garamond/EBGaramond-Regular.woff2') format('woff2'); font-weight: 400; font-display: block; }
  @font-face { font-family: 'EB Garamond'; src: url('/composer/fonts/eb-garamond/EBGaramond-Italic.woff2') format('woff2'); font-weight: 400; font-style: italic; font-display: block; }
  @font-face { font-family: 'Lora'; src: url('/composer/fonts/lora/Lora-Regular.woff2') format('woff2'); font-weight: 400; font-display: block; }
  @font-face { font-family: 'Lora'; src: url('/composer/fonts/lora/Lora-Bold.woff2') format('woff2'); font-weight: 700; font-display: block; }
  @font-face { font-family: 'Inter'; src: url('/composer/fonts/inter/Inter-Regular.woff2') format('woff2'); font-weight: 400; font-display: block; }
  @font-face { font-family: 'Inter'; src: url('/composer/fonts/inter/Inter-SemiBold.woff2') format('woff2'); font-weight: 600; font-display: block; }
  @font-face { font-family: 'Inter'; src: url('/composer/fonts/inter/Inter-Bold.woff2') format('woff2'); font-weight: 700; font-display: block; }
  @font-face { font-family: 'Poppins'; src: url('/composer/fonts/poppins/Poppins-Regular.woff2') format('woff2'); font-weight: 400; font-display: block; }
  @font-face { font-family: 'Poppins'; src: url('/composer/fonts/poppins/Poppins-Bold.woff2') format('woff2'); font-weight: 700; font-display: block; }
  @font-face { font-family: 'Space Grotesk'; src: url('/composer/fonts/space-grotesk/SpaceGrotesk-Regular.woff2') format('woff2'); font-weight: 400; font-display: block; }
  @font-face { font-family: 'Space Grotesk'; src: url('/composer/fonts/space-grotesk/SpaceGrotesk-Bold.woff2') format('woff2'); font-weight: 700; font-display: block; }
  @font-face { font-family: 'IBM Plex Mono'; src: url('/composer/fonts/ibm-plex-mono/IBMPlexMono-Regular.woff2') format('woff2'); font-weight: 400; font-display: block; }
  @font-face { font-family: 'IBM Plex Mono'; src: url('/composer/fonts/ibm-plex-mono/IBMPlexMono-SemiBold.woff2') format('woff2'); font-weight: 600; font-display: block; }

  :root {
    --garamond: 'EB Garamond', Georgia, serif;
    --lora:     'Lora', Georgia, serif;
    --inter:    'Inter', -apple-system, system-ui, sans-serif;
    --poppins:  'Poppins', -apple-system, sans-serif;
    --grotesk:  'Space Grotesk', -apple-system, sans-serif;
    --plexmono: 'IBM Plex Mono', Menlo, monospace;
  }

  [data-role="title"]    { font-family: var(--lora); font-weight: 700; }
  [data-role="subtitle"] { font-family: var(--inter); font-weight: 400; }
```

### Why declare all thirteen

**Declaring a face costs nothing until something uses it.** A browser fetches a
font file only when a rule matches text in that family. Measured in Chromium
against these exact files: 13 rules declared, 11 stayed `unloaded`, 2 files went
over the wire. So the whole library can sit in every strip and the strip still
pays for exactly the faces it sets.

What that buys is the **editor**. `TextControls.useStripFontVars` scans `:root`
for custom properties whose value looks like a font stack and offers each in the
family dropdown — so six vars means six families selectable in the inspector,
switchable with an inline `font-family` change alone. The alternative would be
the editor writing `@font-face` into `<head>` on the fly, which `serializeStrip`
deliberately cannot do: it preserves every byte outside the regions it edits,
`<head>` included.

The fallback in each var is not decoration. It is what that heuristic matches on
(`/serif|sans|mono|system-ui|Georgia|Helvetica/i`) — a var reading
`--display: 'Lora'` alone is silently dropped from the dropdown — and it is what
the panel sets type in if the woff2 ever fails to arrive.

Three things that are not optional:

- **Root-relative path.** `/composer/fonts/…`, never `fonts/…` — the editor
  serves the document through `/__api/strip-editor/raw?path=`, so a relative URL
  resolves against the API route and 404s. Same rule as every other asset
  (`strip-schema.md` § 4).
- **Declare one `@font-face` per file you actually use.** A weight with no file
  is synthesised by the browser — faux bold — and faux bold at 118px looks like
  a mistake, because it is one.
- **Keep a real fallback in the stack.** If the woff2 fails the panel should
  still set type rather than reflow to Times.

`font-display: block` rather than `swap`: this renders once, headless, and a
flash of fallback text is a wrong PNG, not a wrong moment.

## What the files are

Built from the distribution packages listed below, subset to **latin +
latin-ext** (Google's own two ranges), hinting stripped — these render at 40px
and up, where hinting does nothing — and layout features limited to
`kern,liga,clig,calt,ccmp,locl,mark,mkmk,rlig`.

```bash
pyftsubset <src>.ttf --output-file=<out>.woff2 --flavor=woff2 \
  --unicodes="<latin>,<latin-ext>" --no-hinting --desubroutinize \
  --layout-features='kern,liga,clig,calt,ccmp,locl,mark,mkmk,rlig' \
  --name-IDs='*' --name-legacy
```

| Family | Source | Version |
| --- | --- | --- |
| EB Garamond | Debian `fonts-ebgaramond` 0.016+git20210310 (optical size 12) | 0.016 |
| Lora | Google Fonts variable, instanced at 400 / 700 | 3.008 |
| Inter | Debian `fonts-inter` 4.0+ds-1 (text cut, not Display) | 4.000 |
| Poppins | Google Fonts static | 4.004 |
| Space Grotesk | Debian `fonts-space-grotesk` 2.0.0 | 2.000 |
| IBM Plex Mono | Debian `fonts-ibm-plex` 6.1.1 | 2.3 |

All six are SIL OFL 1.1 — see `OFL.txt`. The licence permits redistribution
inside this repo and use in rendered screenshots; it forbids selling the fonts
themselves, and the reserved-name clause means a *modified* face must not keep
its original name. Subsetting is a modification the OFL explicitly allows, and
the names above are unchanged, so nothing here trips that.

### EB Garamond has no bold

The upstream package's `EBGaramond12-Bold.otf` carries **127 glyphs** — ASCII
only, no em-dash, no curly quotes, no accents. It is shipped broken, so it is
not in this library. EB Garamond is a **400-and-italic face here**, which is how
old-style serifs were cut anyway: a Garamond title at 118px does not need 700 to
hold a panel. If a run wants a heavy serif, that is what Lora Bold is for.

Verify any face you are unsure of rather than trusting the filename:

```bash
python3 -c "from fontTools.ttLib import TTFont; c=TTFont('composer/fonts/lora/Lora-Bold.woff2').getBestCmap(); print(len(c), 0x2014 in c, 0x2019 in c)"
```

## Adding a face

1. Get the source from the family's own release or a distribution package, never
   a webfont CDN — you want the full-fat original to subset from.
2. Confirm the licence permits redistribution and note it here. OFL and Apache
   are fine; anything requiring per-seat licensing is not.
3. Subset with the command above into `composer/fonts/<family>/`.
4. Check the glyph coverage. The EB Garamond row above is what happens when
   nobody does.
5. Add it to the Axis 11 table in `skills/strip-design/archetypes.md` with a
   line on what it is *for* — a face nobody knows when to pick is a file, not a
   choice.
