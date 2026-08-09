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
  app.md              app name, summary, and the copy for each panel
  welcome.jpg         your app's screens — meaningful filenames, not UUIDs
  transfer.jpg
  history.jpg
  ...                 five or more
```

**Filenames matter.** `transfer.jpg` tells the agent what that screen proves, so
it can put it on the panel whose headline is about transfers. `IMG_4821.PNG`
tells it nothing and it will have to guess.

`app.md` names the file it wants for each panel, so the two stay tied together.
Copy `app.template.md` to `app.md` and fill it in.

## The gate

The agent stops and asks if `input/` is empty — no `app.md`, or no images. It
will not invent your app's name or write your marketing copy.

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
