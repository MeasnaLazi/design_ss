# input/

The start of the pipeline:

```
input/<device>/  →  strip-design  →  strips/<device>/
```

Everything the agent needs to design a strip goes here. It reads this folder
first and **will not start without it**.

## What goes in

```
input/
  README.md           this file — the only thing here you did not write
  app.md              the app: name, summary, tone, theme, panel copy
  *icon*.png          your app icon — optional, but see below

  iphone/             one folder per device target — the captures for it
    welcome.PNG       meaningful filenames, not UUIDs
    recording.PNG
    timeline.PNG
    ...               five or more

  ipad/               a second target, when you have one
    welcome.PNG       the same screens, captured on iPad
    recording.PNG
```

**The device folders mirror the output.** `input/iphone/` designs into
`strips/iphone/`, `input/ipad/` into `strips/ipad/`. The four names are
`iphone`, `ipad`, `phone` and `tablet`, and the folder is the *only* thing that
says which target a run is for — there is no `preset` key to keep in sync with
it, and nothing to disagree.

**Captures are per device because they genuinely differ.** An iPad screenshot is
not an iPhone screenshot scaled up: the app lays itself out differently, often
in split view. Apple requires screenshots to represent the actual app, so an
iPhone capture in the iPad slot is a misrepresentation, not a shortcut.

Give the same screen the same filename in every folder — `welcome.PNG` in both
`iphone/` and `ipad/` — and one line of panel copy serves both targets, because
`screenshot: welcome.PNG` resolves inside whichever folder is being designed.

**`app.md` and the icon stay at the root.** They describe the app, which does
not change between devices. Copying them per target would only give them room
to drift.

**The icon earns its place.** It is the densest statement of your visual
identity you own, and the only brand asset the store shows *beside* the strip.
Three uses: colours read off it beat colours inferred from your `summary`, so it
is the better source when `theme` is left out; its shape language gives decor a
motif that is yours rather than arbitrary — an arc, a serif, a rounded square
echoed in the panels; and it can appear as a small mark where a panel needs a
brand anchor.

Once, though, or not at all. An icon in the corner of all five panels is a
common amateur tell, and Apple already shows it directly above the screenshots.

It is **not** part of the gate — a run starts without it.

**Filenames matter.** `transfer.jpg` tells the agent what that screen proves, so
it can put it on the panel whose headline is about transfers. `IMG_4821.PNG`
tells it nothing and it will have to guess.

## Writing `app.md`

Create `app.md` in this folder and follow this shape. Everything below the
horizontal rule is the format the agent reads.

---

````markdown
# Bio Journal

## About

- summary: A private journal that turns everyday moments into a story worth
  keeping. For people who want to write a little, not a lot.
- category: lifestyle / journal
- tone: warm and literary
- theme: #f5f1ee / #0c0c0a
- store: appstore
- panels: 5

## Panel 0

- title: Your Life, Beautifully Kept
- subtitle: Turn everyday moments into a story worth keeping.
- screenshot: welcome.jpg

## Panel 1

- title: Every Day, In Order
- subtitle: Browse your memories on an interactive timeline.
- screenshot: timeline.jpg

## Panel 2

- title: Speak It, Save It
- subtitle: Record a thought — the app transcribes it for you.
- caption: Works offline
- screenshot: voice.jpg

## Panel 3

- title: Perfect Every Page
- subtitle: Let AI clean up grammar and tighten your notes.
- screenshot: rewrite.jpg

## Panel 4

- title: Made For You Alone
- subtitle: Private by default. Your story, your device.
- screenshot: privacy.jpg
````

---

### The heading

The `# ` heading is the app's name. It is used in the design — as a brand chip,
a watermark, a wordmark — but it does **not** name any folder.

### The device targets

| folder | panel size | store |
| --- | --- | --- |
| `iphone` | 1290×2796 | App Store |
| `ipad` | 2048×2732 | App Store |
| `phone` | 1080×1920 | Play |
| `tablet` | 1600×2560 | Play |

`input/<device>/` in, `strips/<device>/` out, the same name on both ends.
**There is no `preset` key.** The folder is the declaration; a name written in
two places is a name that can disagree with itself.

The two Apple sizes are specifications — Apple publishes exact export sizes and
rejects anything else. The two Play sizes are **house choices**: Google
publishes a range (320–3840px per side, at most 2:1) and no canonical
resolution, so those numbers sit inside the range rather than being required by
it. They are declared in `strip_editor/src/editor/devices.ts`.

**One `input/` describes one app.** Each device folder is that app on one
device. Add a target by creating its folder and putting captures in it; nothing
else moves.

### Designing more than one target

**A run designs one target.** Say which — *"design the ipad strip"* — or leave
it out when only one device folder exists, which is the common case.

One at a time, for two reasons. The editor watches a single file, so a run
touching four targets would change three of them where you cannot see them; and
four targets is a long wait before there is anything to judge.

Targets are **peers, not copies**. `ipad` is not derived from `iphone`: an iPad
panel is the *same height* as an iPhone panel and 59% wider, so a layout that
works on one is not a layout on the other. What carries across is the concept —
same copy, same palette, same archetype — laid out again for the new
proportion.

### `## About`

| Key | Meaning |
| --- | --- |
| `summary` | What the app does and who it is for. One or two sentences. |
| `category` | e.g. lifestyle / journal, productivity, finance |
| `tone` | e.g. warm and literary · clinical and precise · playful |
| `theme` | `background / ink`, plus an accent if you have one. Add a second pair after `·` for an inverted variant — see below. |
| `mood` | Optional. `midnight`, `ember`, `golden hour`, `dawn`, `overcast`, `parchment`, `neon`, `clinical`, `deep water`, `spotlight`. Atmosphere rather than colour; the agent picks one if you leave it out. |
| `store` | `appstore` or `play` |
| `panels` | Optional. How many panels to design, **5–10**. Only consulted for panels you did *not* write — see below. |

`tone` and `theme` steer type and palette. Leave either out and the agent infers
it from the summary and tells you what it inferred.

**Two palettes, one brand.** A pinned `theme` keeps every strip on-brand across
iPhone, iPad and Play — which is what you want, and it also means the palette
stops being a source of variety. Declaring both a dark and a light version of
the *same* palette gives back one real axis of variation at no cost to
coherence:

```
- theme: #0b0a08 / #f4eee2 + #c9a24b · #f4eee2 / #0b0a08 + #c9a24b
         ^ dark ground, parchment ink   ^ the same palette inverted
```

The agent picks one per run and says which. Useful anyway if your app has a dark
mode — showing it has become close to expected.

### Panel copy is optional

Writing five outcome-driven headlines is the hardest part of this file. You do
not have to. **Give the agent a `summary` and the captures and it will draft the
panels**, working from what the app does and what each screen shows.

A minimal `app.md` is legal:

````markdown
# Bio Journal

## About

- summary: A private journal that turns everyday moments into a story worth
  keeping. For people who want to write a little, not a lot.
- tone: warm and literary
- panels: 6
````

**Drafted copy is written back into this file**, below your `## About`, marked
with a comment:

```markdown
<!-- drafted by strip-design 2026-08-16 -->
## Panel 0

- title: Your Life, Beautifully Kept
- subtitle: Turn everyday moments into a story worth keeping.
- screenshot: welcome.PNG
```

That write-back is the point, not a side effect. Without it the copy would live
only in `strips/<device>/strip.html`, which the next run replaces — so every run
would start from zero and any line you fixed would evaporate. Written here, run
two starts from copy you have had a chance to correct.

The marker is for **you**, so you can see at a glance which headlines to review.
It changes nothing on the next run: once a panel is in this file it is your
copy, taken verbatim, whoever typed it first.

**How many panels you get:**

> `panels` if set, otherwise the number of `## Panel N` sections, otherwise 5.

The agent drafts any panel section that does not exist and **never touches one
that does**. So `panels: 6` with two panels written gets you your two plus four
drafted. `panels` outside 5–10 is ignored and you get 5, and the run says so.

`panels` can only **extend, never truncate** — set it to 5 with eight panels
written and you get all eight. Your copy is not deleted to satisfy a number.

If `panels` asks for more panels than the target folder has captures, the agent
reuses a screen across panels — cropped to a different region each time, which
is a real technique, not a bodge — and tells you which panels share one.

### `## Panel N`

Optional; see above. Keys are `title`, `subtitle`, `caption`, `screenshot`. A
title is required; the rest are optional. One title and one subtitle per panel —
a caption only when it earns its place.

`screenshot` names a file inside the **device folder being designed** —
`input/iphone/welcome.PNG` for the iphone run, `input/ipad/welcome.PNG` for the
ipad one. That is why the same filename in each folder lets one line of copy
serve every target. Omit it and that panel's device renders a blank screen,
which is a legitimate design choice.

**Two filenames means two devices in that panel** — the `two-device-overlap`
layout, for a before/after, a flow, or a state change:

```
## Panel 2

- title: Speak It, Save It
- subtitle: Record a thought — the app transcribes it for you.
- screenshot: recording.png, transcript.png     ← before, after
```

Order matters: the first is the one behind, the second the one in front. Use it
when **two screens are needed to tell one story**, not because you had a spare
capture.

### More captures than panels

That is a good position to be in, and the answer is usually **not** to fit them
all in. The agent is asked to pick the screen that proves each panel's claim —
a surplus is what makes that a real choice instead of a formality. Apple's own
guidance is one benefit per panel, and ~70% of visitors never scroll past the
first, so a panel carrying two unrelated screens says more and communicates
less.

Three legitimate responses, in order of preference:

1. **Pick the best five and leave the rest unused.** The default.
2. **Pair two screens on one panel** with the plural `screenshot:` form above —
   but only when they genuinely tell one story.
3. **Add panels** — write more `## Panel N` sections, or raise `panels`. Apple
   allows up to ten. Reasonable if you have that many distinct benefits, though
   only ~9% of viewers see them all, so panels six through ten do very little
   work.

**Copy you wrote is taken verbatim.** If a line does not fit the layout, the
agent says so rather than rewording it — the words are yours. Anything else in
the file is a note to the designer, not copy to render.

Copy the agent drafted is verbatim too, from the moment it lands in this file.
It is not re-drafted on the next run, and it is not quietly improved. Edit it
here if you want it changed.

## The gate

The agent stops and asks if any of three things is missing:

| Required | Why |
| --- | --- |
| **The app's name** — the `# ` heading in `app.md` | It will not invent what your app is called. |
| **Panel copy, or a description** to draft it from | With neither, there is nothing to say on five panels. |
| **A device folder holding at least one image** | A strip of empty phones is not a design. Captures loose at `input/` root belong to no target and are not read. |

It will draft your marketing copy. It will not invent your app.

Every claim it drafts has to be supported by your description or visibly true in
a capture — Apple requires screenshots to represent the actual app, so a
headline promising a feature you do not have is a rejection risk as well as a
disappointed download. No superlatives, no invented capabilities.

The run tells you which headlines were yours and which it wrote.

It does **not** stop for a missing screenshot on some individual panel. That
panel renders with a blank device screen (`data-screen-fallback`), which is a
legitimate design, and the gap is listed at the end. Pausing a run to ask for an
upload is worse than designing around the hole.

## What comes out

`strips/<device>/` — the same name as the input folder it came from, with the
captures copied into it so the finished strip is self-contained.

**The strip folder is output.** It is derived from what is in here: change the
input, run again, and that target's folder is replaced by the new result.
Editing `input/` and re-running is the normal way to change a design. Other
targets are untouched — a run replaces the one folder it designed.

Neither this folder nor `strips/` is tracked in git — only this README. And a
run is not deterministic: the design decisions live in the agent, not in
`app.md`, so re-running the same input gives a *different* strip rather than the
same one back. Nothing brings the old one back, so copy a strip folder elsewhere
if a particular result is worth keeping.
