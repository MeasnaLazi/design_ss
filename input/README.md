# input/

The start of the pipeline:

```
input/  →  strip-design  →  strips/<device>/
```

Everything the agent needs to design a strip goes here. It reads this folder
first and **will not start without it**.

## What goes in

```
input/
  README.md           this file — the only thing here you did not write
  app.md              app name, summary, and the copy for each panel
  *icon*.png            your app icon — optional, but see below
  welcome.jpg         your app's screens — meaningful filenames, not UUIDs
  transfer.jpg
  history.jpg
  ...                 five or more
```

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
- preset: appstore_iphone_portrait

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
a watermark, a wordmark — but it does **not** name the output folder.

**The output folder is named for the device target**, taken from `preset`:

| `preset` | folder | panel size |
| --- | --- | --- |
| `appstore_iphone_portrait` | `strips/iphone/` | 1290×2796 |
| `appstore_ipad_portrait` | `strips/ipad/` | 2048×2732 |
| `play_phone_portrait` | `strips/phone/` | 1080×1920 |
| `play_tablet_portrait` | `strips/tablet/` | 1600×2560 |

The two Apple sizes are specifications — Apple publishes exact export sizes and
rejects anything else. The two Play sizes are **house choices**: Google
publishes a range (320–3840px per side, at most 2:1) and no canonical
resolution, so those two numbers sit inside the range rather than being required
by it.

**Only `iphone` is in use today.** One `input/` describes one app; the folders
under `strips/` are that app's per-device outputs. When you add an iPad or Play
target later, it gets its own folder beside this one and nothing has to move.

### `## About`

| Key | Meaning |
| --- | --- |
| `summary` | What the app does and who it is for. One or two sentences. |
| `category` | e.g. lifestyle / journal, productivity, finance |
| `tone` | e.g. warm and literary · clinical and precise · playful |
| `theme` | `background / ink`, plus an accent if you have one. Add a second pair after `·` for an inverted variant — see below. |
| `mood` | Optional. `midnight`, `ember`, `golden hour`, `dawn`, `overcast`, `parchment`, `neon`, `clinical`, `deep water`, `spotlight`. Atmosphere rather than colour; the agent picks one if you leave it out. |
| `store` | `appstore` or `play` |
| `preset` | Export size, e.g. `appstore_iphone_portrait` (1290×2796) |

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

### `## Panel N`

Keys are `title`, `subtitle`, `caption`, `screenshot`. A title is required; the
rest are optional. One title and one subtitle per panel — a caption only when it
earns its place.

`screenshot` names a file sitting beside `app.md` in this folder. Omit it and
that panel's device renders a blank screen, which is a legitimate design choice.

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
3. **Add panels.** Apple allows up to ten. Reasonable if you have that many
   distinct benefits, though only ~9% of viewers see them all, so panels six
   through ten do very little work.

**Copy is taken verbatim.** If a line does not fit the layout, the agent says so
rather than rewording it — the words are yours. Anything else in the file is a
note to the designer, not copy to render.

## The gate

The agent stops and asks if there is no `app.md`, or no images. It will not
invent your app's name or write your marketing copy.

It does **not** stop for a missing screenshot on some individual panel. That
panel renders with a blank device screen (`data-screen-fallback`), which is a
legitimate design, and the gap is listed at the end. Pausing a run to ask for an
upload is worse than designing around the hole.

## What comes out

`strips/<device>/` — named for the device target in `preset` (`strips/iphone/`
today), with the screenshots copied into it so the finished strip is
self-contained.

**The strip folder is output.** It is derived from what is in here: change the
input, run again, and that app's folder is replaced by the new result. Editing
`input/` and re-running is the normal way to change a design.

Neither this folder nor `strips/` is tracked in git — only this README. And a
run is not deterministic: the design decisions live in the agent, not in
`app.md`, so re-running the same input gives a *different* strip rather than the
same one back. Nothing brings the old one back, so copy a strip folder elsewhere
if a particular result is worth keeping.
