---
name: strip-edit
description: >-
  Make a targeted change to an existing composer strip HTML file — add or remove
  a block, swap a screenshot, resize a device, retune type or spacing — then
  re-render and check it. Use when the user points at a strip that already
  exists and asks for a specific change. For designing a new strip from a brief,
  use screenshot-design instead.
---

# Editing an existing strip

A strip is a plain HTML document and it is the single source of truth for the
design. Editing one means changing that file surgically — not regenerating it.

## When this applies

A strip already exists and the request names a change: *"add a caption to panel
3"*, *"make panel 2's device bigger"*, *"swap the screenshot on the last
panel"*, *"the subtitle is too close to the title"*.

If the request is open-ended — *"redesign this"*, *"make it better"* — that is a
design run: use **`screenshot-design`** and its full workflow instead. Say which
one you are doing before you start.

## Rules

1. **Read the file first.** Never re-author a strip you were asked to edit.
2. **Make the smallest edit that achieves the request.** Everything else stays
   byte-identical. The document may have been hand-tuned, or edited in
   `strip_editor`; its indentation, attribute line breaks and declaration order
   belong to whoever wrote them.
3. **Follow `composer/strip-schema.md`** for any block you add — and its two
   easiest mistakes: a device gets a width and **never a height**, and a text
   block may contain text and `<br>` only.
4. **Sizing a device?** Read `composer/device-frames/README.md` first. Poses have
   very different viewBoxes, and guessing costs a render round.

## Loop

1. Read the strip and locate the block. Panels are `data-panel="N"`, 0-based.
2. Make the edit.
3. **Check the structure** — cheaper than a render:
   `node composer/check-schema.mjs <file>`
4. **Render:**
   `node composer/render.mjs --strip <file> --out output/strips/rendered --full`
5. **Look at the affected panel PNG**, and compare it with the previous render
   of that same panel. You are checking your change, not re-judging the design.
6. Report what you changed in a line or two, and name anything you noticed but
   deliberately left alone.

## If the editor is open on this file

`strip_editor` watches the file and reloads when it changes on disk; a human
with unsaved edits is prompted rather than overwritten.

The editor takes itself out of the way **automatically** — any write it did not
make puts it in agent mode and makes the canvas read-only, so you do not have to
announce yourself for the human to be protected.

Claiming is still worth doing when the editor is running, for two reasons: the
banner names *you* instead of saying "changed outside the editor", and it starts
before your first write rather than after it.

```bash
curl -s -X POST http://localhost:4714/__api/strip-editor/mode \
  -H 'content-type: application/json' -d '{"mode":"agent","holder":"strip-edit"}'
```

and release it when you are done:

```bash
curl -s -X POST http://localhost:4714/__api/strip-editor/mode \
  -H 'content-type: application/json' -d '{"mode":"human"}'
```

This is a dev-server endpoint. If the editor is not running the request fails,
which is expected and not worth reporting.

The lock is a **lease**: it lapses about 90 seconds after your last write, so a
run that dies partway through cannot leave the human locked out. Each write
renews it, so a working turn never lapses — but if you go quiet for a long
stretch mid-turn (a slow render, a long think), POST the claim again to hold it.

## Do not

- **Write your own validation code.** `check-schema.mjs` and `render.mjs` are
  the validation, and they are what the export and the editor actually use. A
  scratch script measures something subtly different from what ships. If you
  need a fact neither reports, say so instead of scripting around it.
- Reformat, reindent or reflow the document.
- Rewrite panels you were not asked to touch.
- Add external network assets — everything must resolve from the repo.
- Fix things you were not asked to fix. If you spot a problem, **say so** and let
  the user decide. An unrequested "improvement" buried in a diff is the fastest
  way to lose their trust in this loop.
