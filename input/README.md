# input/

The start of the pipeline:

```
input/  →  strip-design  →  strips/<app-name>/
```

Everything the agent needs to design a strip goes here. It reads this folder
first and **will not start without it**.

## What goes in

```
input/
  README.md           this file — the only thing here you did not write
  app.md              app name, summary, and the copy for each panel
  welcome.jpg         your app's screens — meaningful filenames, not UUIDs
  transfer.jpg
  history.jpg
  ...                 five or more
```

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

The `# ` heading names the output folder: `# Bio Journal` → `strips/bio-journal/`.

### `## About`

| Key | Meaning |
| --- | --- |
| `summary` | What the app does and who it is for. One or two sentences. |
| `category` | e.g. lifestyle / journal, productivity, finance |
| `tone` | e.g. warm and literary · clinical and precise · playful |
| `theme` | `background / ink`, plus an accent if you have one |
| `store` | `appstore` or `play` |
| `preset` | Export size, e.g. `appstore_iphone_portrait` (1290×2796) |

`tone` and `theme` steer type and palette. Leave either out and the agent infers
it from the summary and tells you what it inferred.

### `## Panel N`

Keys are `title`, `subtitle`, `caption`, `screenshot`. A title is required; the
rest are optional. One title and one subtitle per panel — a caption only when it
earns its place.

`screenshot` names a file sitting beside `app.md` in this folder. Omit it and
that panel's device renders a blank screen, which is a legitimate design choice.

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

`strips/<app-name>/` — the folder is named from the app name in `app.md`, and
the screenshots are copied into it so the finished strip is self-contained.

**The strip folder is output.** It is derived from what is in here: change the
input, run again, and that app's folder is replaced by the new result. Editing
`input/` and re-running is the normal way to change a design.

`strips/` is gitignored — this folder is what the repo keeps. Note that a run is
not deterministic, though: the design decisions live in the agent, not in
`app.md`, so re-running the same input gives a *different* strip rather than the
same one back. Copy a strip folder elsewhere if a particular result is worth
keeping.
