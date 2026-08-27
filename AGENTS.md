# apps_publisher — agent entry point

This repo designs App Store / Play Store screenshot strips. A strip is one HTML
document: `strips/<target>/strip.html` is the single source of truth. The
renderer exports it and the visual editor edits it, in the same browser engine,
from the same file. There is no second representation.

## Start here

Designing, editing or re-running a strip? **Read
[`skills/strip-design/SKILL.md`](skills/strip-design/SKILL.md) first.** It covers
the three run modes, the design loop, and the rules learned from real failures.

This file is a pointer, not the brief. Do not work from it alone.

| Path | What it is |
|------|------------|
| `skills/strip-design/SKILL.md` | The one agent entry point. Read before any strip work. |
| `skills/strip-design/archetypes.md` | The design vocabulary — axes, panel archetypes, set rhythms. The authority on anything visual. |
| `composer/references/history.md` | One line per concept, newest last. The no-repeat rule reads the last line. |
| `composer/strip-schema.md` | The markup contract: panel structure, the five `data-layer` kinds, device attributes, z-order. |
| `input/README.md` | The brief format for `input/app.md`. |
| `NOTES.md` | Non-obvious logic across the repo and why. Read it before "fixing" anything that looks wrong. |

Five targets — `iphone`, `ipad`, `phone`, `tablet_7`, `tablet_10`. The `strips/`
and `input/` folder name is the only thing that says which target a run is for.

## Standing constraints

- **Never write your own validation.** `composer/check-schema.mjs` and
  `composer/render.mjs` *are* the validation. If you want a fact neither reports,
  say so rather than scripting around it.
- **No external network assets in a strip.** No web fonts, no remote images —
  the editor and the export would disagree. All faces are self-hosted in
  `composer/fonts/`. (`mask_analysis` is the sole exception, for OpenCV.js.)
- **Smallest edit that achieves the request.**
- **Do not fix things you were not asked to fix.** Say what you noticed and let
  the user decide.
- **Do not edit** `composer/*.mjs`, `strip_editor/src/**` or the frame packs
  during a design run.
- **`archetypes.md` is the authority on anything visual.** `SKILL.md` points at
  it and must not restate it — the two disagreed for months once, and the wrong
  copy was the one being trusted.

## Agent configuration & permissions

Instructions, not an enforced sandbox. Real enforcement lives in each agent's own
settings — `.claude/settings.json` in this repo for Claude Code, `/permissions`
for Gemini CLI and Antigravity. This section states the intent those files encode;
where they disagree, they win.

### Allowed behaviours

- **ALLOW** — read anywhere in the repo.
- **ALLOW** — write inside `strips/` and `input/`, and append one concept line to `composer/references/history.md`.
- **ALLOW** — run `node composer/check-schema.mjs`, `node composer/render.mjs`, `node composer/pick-frame.mjs`.
- **ALLOW** — run `npm test`, `npm run check`, `npm run typecheck`, `npm run dev`, `npm install`.
- **ALLOW** — read-only git: `git status`, `git diff`, `git log`.

### Exclusions & blocks

Denied outright, so the agent neither does these nor stops to ask:

- **DENY** — editing `composer/*.mjs`, `strip_editor/src/**`, or anything under `composer/device-frames/`. The engine, the editor and the measured frame packs are off limits to a design run (see Standing constraints above).
- **DENY** — `rm -rf`, `git push --force`, or anything that rewrites published history.
- **DENY** — never install a global package, and never write outside this repository.

Anything not listed under ALLOW and not denied here falls through to a prompt.
That is the intended fallback, so the allow list is what to extend when a run
stops for something it should have been able to do.

## Commands

```
cd composer && npm test                          # 4 suites
cd composer && npm run check                     # strips + frame-pack geometry
cd strip_editor && npm test && npm run typecheck
```

`render.mjs` writes `strip-data.json` **only on success** — delete the output
before re-running or you will read stale numbers as fresh.
