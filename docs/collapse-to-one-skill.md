# Task: collapse the agent surface to one design skill

Paste this whole file as the opening prompt of a new session, from the repo root
(`apps_publisher`). It is written to be self-contained — assume no memory of
prior sessions.

---

## What this repo is

A pipeline for making App Store / Play Store screenshot strips.

A **strip** is one HTML document holding every panel of a screenshot set. It is
the single source of truth: there is no canvas, no importer, no second
representation.

| Piece | What it does |
| --- | --- |
| `composer/strip-schema.md` | **The contract.** Read this first. Panel structure, the four layer kinds, device attributes, and the shape of `strip-data.json`. |
| `composer/render.mjs` | Exports panel PNGs via headless Chromium, and writes `strip-data.json` — measured geometry plus a `problems` list. |
| `composer/check-schema.mjs` | Structural conformance from source text, no browser. Fast. |
| `composer/device-frames/` | Phone frame packs. `README.md` there has each pose's viewBox and a starting width. |
| `strip_editor/` | Visual editor (Vite + React, port 4714). Opens a strip at `?strip=<repo-relative path>`, watches it on disk, reloads when anything else writes it. |
| `datasource/screenshots/<preset>/` | Real app screen captures, for device screens. |
| `datasource/images/` | Logos, textures, artwork for image layers. |
| `output/strips/*.html` | The strips themselves. **Gitignored — no version history. Do not rewrite one without being asked.** |

`web_ui/` is a dead Fabric.js editor awaiting deletion. Ignore it; do not build
anything against it.

## The goal

**One skill. An agent designs screenshot strips. That is the whole feature.**

Today there are two agents and three skills implementing a multi-phase pipeline:
gather app metadata → write a creative brief → pause for approval → design.
The planning half is being removed. The agent should spend its effort on
*design*, not on analysing the project or producing briefs.

## Delete

```
.claude/agents/screenshot-agent.md
.claude/agents/screenshot-design-agent.md
.claude/skills/screenshot-brief/          (whole directory, including script/)
.claude/skills/screenshot-design/SKILL.md
```

Keep `.claude/settings.json`. It has deny rules for `web_ui/src/**` which are
harmless until that folder goes.

Two things reference the deleted helper scripts and must be updated, not left
dangling:

- `composer/device-frames/README.md` — its "regenerate" command calls
  `load-frame.mjs`. Point it at `composer/device-frames/<pack>/frame.json`
  instead; it is plain JSON and needs no tool.
- Root `README.md` — the architecture table, the agent table, and the "Layout
  helpers" row all describe the old pipeline. Rewrite that section to describe
  the single skill.

## Build: one skill

Replace `.claude/skills/strip-edit/SKILL.md` with a single skill named
**`strip-design`** (rename the directory). It must be model-invocable — do
**not** set `disable-model-invocation`; the previous design skill had it and it
broke every attempt to use the thing.

It covers both cases, because they are the same job:

- a blank strip created in the editor ("New strip"), or
- an existing strip that needs a specific change.

Fold in the material worth keeping from the two skills you are deleting. Read
them before deleting so nothing good is lost. In particular keep:

- The **design craft** notes: one focal point per panel; vary layout, device
  side and pose across panels; type hierarchy; backgrounds from the theme;
  contrast checked against the actual render, not the intent.
- **Cropping devices at panel edges is encouraged** — panels are
  `overflow: hidden` and that cropping is the standard professional look. A
  block hanging off an edge is not a bug.
- The **review** step: put each panel PNG next to one or two strips in
  `composer/references/` and name concrete CSS fixes. Do **not** reintroduce the
  1–5 self-scoring rubric that used to be there; a score the model invents
  correlates with nothing and reads as progress without being any.
- **Never pause to request screenshot uploads.** If a panel has no real capture,
  omit `data-screenshot` — the frame renders a blank screen filled by
  `data-screen-fallback`, which is a legitimate design choice — and list the gap
  at the end.

### The loop the skill must specify

1. Read the strip and `composer/strip-schema.md`.
2. Edit the HTML.
3. `node composer/check-schema.mjs <file>` — costs nothing, no browser.
4. `node composer/render.mjs --strip <file> --out output/strips/rendered --full`
5. Read the `problems` array from that output *before* looking at the PNGs, then
   look at the PNGs.
6. Iterate. Stop when a round stops improving, or after ~4 rounds.

### Rules that must survive verbatim in spirit

These were each learned from a real failure. Do not soften them.

- **Never write your own validation code.** No scratch scripts, no throwaway
  parsers, no ad-hoc Playwright. `check-schema.mjs` and `render.mjs` *are* the
  validation, and they are what the export and the editor actually use — a
  checker you write measures something subtly different from what ships. If you
  want a fact neither tool reports, **say so** rather than scripting around it;
  that is a gap to fix in the tools.
- **Every direct child of a panel needs `data-layer`.** A bare `<div>` or
  `<svg>` renders perfectly in the export and is completely invisible to the
  editor — unselectable, undraggable, absent from the layer tree. Decorative
  shapes are `data-layer="decor"`. `check-schema` now errors on this.
- **A text block contains text and `<br>` only.** No `<span>`, no nested
  `<div>`. The editor rebuilds text content on first edit and silently discards
  anything else.
- **A device block gets a CSS `width` and never a height.** Height follows the
  pose's SVG viewBox aspect. Read `composer/device-frames/README.md` before
  sizing one — the poses differ enough that guessing wastes a render.
- **No external network assets.** Everything resolves from the repo, or the
  editor and the export disagree.
- **Smallest edit that achieves the request.** Do not reformat, reindent, or
  rewrite panels you were not asked to touch. Strips in `output/` have no git
  history.
- **Do not fix things you were not asked to fix.** Say what you noticed and let
  the user decide.

### Where copy comes from

The brief that used to supply headlines is being deleted. The skill should take
copy from the request, or from the strip if it already has some. If copy is
missing and cannot be inferred, **ask once** — do not invent marketing text.

*(If you would rather the agent write the copy too, say so and change this
section; it is the one open decision in this task.)*

### Working live with the editor

Worth a short section, because it is the feature the user cares about:

```
cd strip_editor && npm run dev
http://localhost:4714/?strip=output/strips/<file>.html
```

The editor watches the file. Every agent write reloads the canvas, so the user
watches the design appear. This needs no cooperation from the agent — the server
notices any write it did not make, puts itself in agent mode, and makes the
canvas read-only, with a lease that lapses ~90s after the last write.

An agent *may* announce itself, which just names it in the banner:

```bash
curl -s -X POST http://localhost:4714/__api/strip-editor/mode \
  -H 'content-type: application/json' -d '{"mode":"agent","holder":"strip-design"}'
```

and release with `{"mode":"human"}`. If the editor is not running the request
fails, which is expected and not worth reporting.

## Acceptance

- `.claude/` contains exactly one skill directory and no agents.
- Nothing anywhere references `screenshot-brief`, `screenshot-design`,
  `screenshot-agent`, `screenshot-design-agent`, `import-to-canvas`, or the
  deleted `script/` helpers. Check with `grep -rn` across `*.md` and `*.mjs`,
  excluding `docs/` (historical plans) and `web_ui/`.
- Every command the new skill tells an agent to run actually exists.
- `cd composer && npm test` and `cd strip_editor && npm test` still pass.
- `node composer/check-schema.mjs --all` behaves as before.
- The skill loads when named — verify it is not blocked by
  `disable-model-invocation`.

## Known state, so you do not chase these

- `output/strips/appstore-iphone-portrait.html` currently **fails**
  `check-schema` with six unlabelled decor elements. That is a real defect in
  that file, not in the checker. Fixing it means adding `data-layer="decor"` to
  each; do it only if asked.
- `composer/test/bio-strip.html` fails on five screenshots that no longer exist.
  Pre-existing and known.
- Deleting `web_ui/` is a separate planned task (`docs/agent-pipeline-plan.md`
  step S6). Not part of this one.
- Commit before starting. Several sessions of work are unreviewed, and this task
  deletes files.
