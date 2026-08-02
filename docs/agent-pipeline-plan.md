# Agent pipeline plan

Bringing the Claude Code agent surface up to the standard the editor now sets.

The prompts were rewritten already (`.claude/skills/screenshot-design`,
`.claude/agents/*`). This plan covers what sits underneath them: the contract
they point at, the facts they can act on, and the jobs they cannot currently do.

**Stop for review after every step.** Each one is independently useful and
independently revertible.

---

## S0 — Commit first

Everything since the P5a commit is unreviewed: P5b, P6, P7, the device-rescale
and pose-rebuild fixes, the image placeholder, Phases A and B (device frames
moved to `composer/`), the `datasource/images/` library, cross-panel drag,
gesture-level undo, URL routing, and the prompt rewrite.

That is a large surface to bisect if something turns out wrong, and several of
those changes touch files with no version history (`output/strips/*.html` is
gitignored). Commit before starting.

**Acceptance:** clean `git status`; the editor opens a strip, exports it, and the
PNGs match what you approved earlier.

---

## S1 — Rewrite `composer/strip-schema.md`

The contract every other piece depends on, and currently the stalest file in the
repo. An agent following it today writes strips that point at a deleted folder.

**Fix — wrong:**

- `framesRoot: '/web_ui/public'` in the required boilerplate *and* the skeleton.
  New strips should omit `framesRoot` entirely and inherit `/composer`.
- Asset examples using `/web_ui/public/device-frames/…`.
- The `layer_z_order_sane` safety check — the validator was removed.
- Decor "imports to canvas as rasterized image layers" — no canvas.
- `strip-data.json` described as import-to-canvas replay input — see S3.
- The opening rationale ("so tooling — render CLI, validators, future
  HTML→display-JSON importer — can parse the design"): two of the three named
  consumers no longer exist. The real consumers are `render.mjs` and
  `strip_editor`.

**Fix — missing:**

- **`data-screen-fallback`** is undocumented, though the design skill instructs
  agents to use it and the editor writes it.
- `data-fit` values are mentioned only in a table cell.
- `datasource/images/` for image layers.
- **"Never set a device height"** deserves top-level rule status, not a clause
  inside a table. It is one of the two mistakes that actually breaks a render.
- A pointer to `composer/device-frames/README.md` for pose sizing.

**Acceptance:** every path named in the document exists on disk; the skeleton,
copied verbatim into a new file, renders through `render.mjs` without warnings
and opens in `strip_editor` with the device built.

**Risk:** low. Documentation only.

---

## S2 — Bind the contract to the code

`strip-schema.md` and `schema.ts`'s `blockTemplate` are two encodings of one
contract with nothing holding them together. They have already drifted: the
schema says the boilerplate must set `framesRoot`, the editor's blank template
no longer writes it.

Add a test that asserts each `blockTemplate()` output satisfies the schema's
rules — device blocks carry the required `data-*` attributes and a width but no
height, text blocks carry `data-role`, nothing references a network asset — and
that `blankStripTemplate()` renders through `render.mjs`.

**Acceptance:** the test fails if `schema.ts` is edited away from the document.
Deliberately break one rule locally and watch it fail before committing.

**Risk:** low. Do this immediately after S1 so the test encodes the corrected
contract rather than the old one.

---

## S3 — Turn `strip-data.json` into the inspector

`render.mjs` already extracts a DOM snapshot on every render
(`render.mjs:148–218`). It was built to feed `import-to-canvas`, whose only
consumer is being deleted — so rather than removing it, repoint it as the
agent's structured eyes.

What it captures today: text and device layers, with geometry, font size,
colour, weight, alignment, pose and pack.

**Add the diagnostics an agent cannot get from a PNG:**

- Did each device block actually build, or is it empty?
- Does each `data-screenshot` resolve, or did it 404?
- Does a text block overflow its panel, and by how much?
- How far does each block overhang, and on which edges? (Overhang is legitimate
  — this is information, not an error.)
- Which image layers are still the placeholder.

**Two decisions to make:**

1. **Image and decor layers are currently skipped** — the code comments they are
   "invisible to the rules validator", a validator that no longer exists. They
   should be captured now.
2. **Device `x`/`y` is stored as the block centre**, a canvas convention that
   disagrees with the editor and with every other coordinate in the system. With
   the canvas gone there is no consumer left for it. Recommend switching to
   top-left and bumping to `version: 2` — which also lets the file be renamed to
   something that is not a canvas term.

**Acceptance:** run against a strip with one deliberately broken pose and one
missing screenshot; the JSON names both, and nothing else is reported as wrong.

**Risk:** medium. This changes an output format. Nothing else reads it once
`import-to-canvas` is gone — confirm that before changing the shape.

---

## S4 — Wire the review step to the inspector

Rewrite § Review in `screenshot-design/SKILL.md` to read the inspector output
*before* looking at the PNGs: fix the facts first, then judge the design.

The reference-gallery comparison stays as-is — that is real work a model does
well. What changes is that "the device didn't build" stops being something the
agent has to notice in a picture.

**Acceptance:** an end-to-end run on a strip with a known defect surfaces it in
the first review round instead of shipping it.

**Risk:** low, but this is the step whose value is hardest to predict. Judge it
on a real run, not on how the prompt reads.

---

## S5 — Add the edit-an-existing-strip path

Nothing currently serves "add a caption to panel 3" or "make panel 2's device
bigger". The design skill assumes authoring a whole strip from a brief, so an
agent asked for a small change either improvises or restarts a design run.

Add it as a section in `screenshot-design` rather than a new skill — it shares
the render loop, the schema and the review step; only the entry point differs.
It needs: read the existing file, make the smallest edit that achieves the
request, re-render, compare against the previous render rather than a reference,
and leave everything else byte-identical.

**Acceptance:** "add a caption to panel 3" produces a diff of a few lines, not a
rewritten document.

**Risk:** low. Worth doing early if this is how you actually work day to day —
consider promoting it above S3.

---

## S6 — Phase D: delete `web_ui`

Now unblocked: the frames moved in Phase A, the editor cut over in Phase B, and
the prompts stopped referencing the canvas.

Remove `web_ui/` entirely, plus `composer/import-to-canvas.mjs` and
`composer/verify-import.mjs`, which exist only to drive it. Drop the
`web_ui/src/**` deny rules from `.claude/settings.json`. Update the root README's
architecture section and diagram. Decide then whether to keep the
`/web_ui/public/device-frames/*` back-compat alias in `render.mjs` and the editor
middleware — it protects the two untracked strips in `output/`, so it should
outlive the folder.

**Acceptance:** a strip renders and exports identically before and after;
`grep -r web_ui` returns only the deliberate alias and its comments.

**Risk:** low by then, and the largest single reduction in surface area.

---

## Order

S0 → S1 → S2 → S5 → S3 → S4 → S6.

S5 moved ahead of the inspector: it is small, it is probably the most common
real request, and it does not depend on anything else. S3 and S4 are one piece
of work split in two — do not leave S3 sitting unwired.

## Not in this plan

- **In-editor chat.** Deferred deliberately until the Claude Code path has been
  used enough to know what the interaction should be. The Agent SDK loads
  `.claude/` skills and subagents the same way Claude Code does, so none of the
  work above is wasted when that day comes.
- **Moving finished strips somewhere tracked.** `output/**` is gitignored, so
  agent-written strips have no history. Worth doing before an agent runs
  unattended, but it is a repo-layout decision, not pipeline work.
