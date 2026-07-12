# Agent design quality — diagnosis and improvement plan

*Analysis only. No code changes. 2026-07-09.*

## 1. Diagnosis: why the output looks "AI-generic"

I reviewed the agent pipeline (`.claude/agents/`, `.claude/skills/screenshot-designing/`, `toolkit/references/`), the enqueue-op allowlist (`web_ui/screenshot-designer-server.ts`), and the actual rendered panels in `output/temp/`. The quality gap is not one bug — it is five compounding causes, and **the Python rules are only cause #3**.

### Cause 1 — The design vocabulary is too small (biggest factor)

The agent may only use: `set_background` (gradient/solid/image URL), `add_text`, `add_device_frame`, plus move/resize/align. That's it.

What it **cannot** do, even though the Web UI itself supports some of it (`addImageToCanvas.ts`, `applyScreenshotToDevice.ts` exist but are not in `CLIENT_AUTHORITATIVE_OPERATIONS`):

- Insert the **actual app screenshot into the device screen** — every panel ships with the green "place your screenshot" placeholder. This alone makes any panel look like an unfinished mockup.
- Add image layers, shapes, blobs, cards, badges, arrows, UI-element callouts.
- Apply shadows, glows, blur, noise/texture, or any depth effect.
- Overlap device across panel edges, crop a device at the bottom (the single most common pro App Store pattern), or span a device across two panels.

Professional store screenshots are built from exactly the elements the agent is forbidden to use. With a vocabulary of "gradient + 2 text layers + 1 empty frame," every composition converges to the same template regardless of how smart the agent is.

### Cause 2 — The agent designs through a keyhole

Design happens as imperative JSON ops over SSE, one coordinate at a time (`device_set_position x:400 y:520`). The agent must do layout math blind, then pay a full round-trip (enqueue → browser → pull-preview) to see anything. This is a low-bandwidth medium the model was never trained on. Result: it plays safe, uses minimal ops, and never explores.

Contrast with the 3D-agent projects you mentioned (Blender scripting, Three.js scenes): those work well **because the medium is code** — a declarative, expressive format the model has seen millions of examples of, where one generation produces a complete, internally coherent scene. The model isn't smarter there; the interface is.

### Cause 3 — The validator defines one archetype and punishes deviation

`validate-rules` hard-gates: device height 60–80% of panel, device centered X (`appstore_hero`), text↔device gap ≤ 8%, text top-safe margins, no text/device overlap, hierarchy sizes, align consistency. These rules **encode a single layout** — "headline block on top, centered upright phone below." Many award-quality store screenshots would *fail* this validator (cropped device, text overlapping a shadowed device, angled off-center hero, panel-spanning composition).

So yes, your instinct is right — the rules are too rigid. But note *how* they hurt: the gate is mandatory and runs *before* the vision rubric, so the agent's real optimization target is **rule compliance, not beauty**. The vision rubric (the only step that judges aesthetics) is advisory and capped at 2 loops.

### Cause 4 — No taste reference

The agent never sees an example of a great screenshot. The brief (`screenshot_report.md`) is text-only messaging. Humans design with references open; the agent designs from prose + rule IDs. Output regresses to the mean of "what passes the rules."

### Cause 5 — Panel-serial workflow prevents strip-level design

Single-panel-first with a hard gate means the strip is designed column by column. Pro carousels are designed **as one composition** (continuous background, device flowing across panels, rhythm of alternating layouts), then refined per panel. Strip checks run only at the end, when it's too late to change the concept.

## 2. Current solution — pros and cons

**Pros (worth keeping):**

- Reproducible, auditable, scriptable — everything is CLI + JSON in the repo; a run can be replayed. This fits the "for developers" mission.
- Deterministic guardrails — rules catch true defects (off-canvas text, unreadable 12px copy, mis-crops) cheaply, without vision calls.
- Clean agent separation (tooling → data → planning → design) with good handoff artifacts.
- Live human takeover — the Fabric editor lets a human continue from the AI state, which is a real differentiator.
- Store-spec correctness — presets, export sizes, safe zones are handled.

**Cons:**

- Expressiveness ceiling (Cause 1) — no amount of prompt engineering fixes a missing vocabulary.
- Wrong optimization target (Cause 3) — the gate rewards conformity; aesthetics are a side check.
- High cost per design decision (Cause 2) — round trip per micro-op; ≤2 validate cycles per panel means almost no aesthetic iteration.
- No references, no strip-first concept (Causes 4, 5).
- Skill/agent docs have grown very prescriptive (~500 lines of "non-negotiable" rules), which further narrows the model toward the one blessed layout.

## 3. Options

### Option A — Change the design medium to declarative code (HTML/CSS → render) — **recommended core**

The agent designs each strip as a single HTML/CSS (or SVG) document at export resolution — full strip, all panels, real app screenshots masked into device frames — rendered headlessly (Playwright/Chromium) to PNG. The existing rules run *after* render as a safety check, not as the creative gate.

- **Pro:** This is the medium LLMs are best at for visual design — gradients, shadows, blur, masks, overlap, typography, pseudo-elements all come free. One generation yields a complete, coherent strip concept. Iteration = edit code, not 30 enqueue-ops. Deterministic and diff-able in git (keeps your developer-first mission). This is exactly the property that makes the 3D-agent projects look good.
- **Pro:** Real screenshots go in the frame via CSS masking — kills the green placeholder problem without new canvas ops.
- **Con:** The rendered strip is not natively editable in the Fabric canvas. You'd need an import path (HTML → display JSON) to keep "human continues from AI." A pragmatic middle: constrain the agent to a structured template (design tokens + slot positions in JSON, HTML generated from it) so it stays convertible.
- **Con:** New dependency (headless browser) and a second render path to maintain alongside Fabric.

### Option B — Curated template library + agent as art director

Hand-design (or collect) 10–20 professional layout templates using the existing template feature. The agent's job shrinks to: pick template per panel/strip, remap theme colors, place copy, insert screenshots.

- **Pro:** Guaranteed quality floor; cheap, fast, reliable; zero new infrastructure — templates already exist in web_ui.
- **Pro:** Best effort/reward ratio if the goal is "shippable screenshots," not "AI that designs."
- **Con:** Bounded variety; someone must design the templates once; the AI isn't really designing.

### Option C — Fix the current loop (incremental)

Keep the canvas-op architecture but: (1) expose `add_image` and `apply_screenshot_to_device` to agents; (2) add shadow/effect ops; (3) invert the gate — vision rubric scores against 3–5 reference screenshots first, rules demoted to hard-fail safety (off-canvas, min font, export size) with the layout-taste rules (`device_height_band`, `device_horizontal_center`, `text_device_vertical_gap`, `text_align_consistency`) removed or made advisory; (4) design the strip concept first, then panels; (5) allow more iteration cycles; (6) cut skill docs down and add visual few-shot references.

- **Pro:** Preserves everything you built; each step is independently shippable; real screenshots in frames is by far the highest-leverage single change.
- **Con:** Ceiling remains — the medium is still coordinate ops through a keyhole; you'll get "good" but likely not "human-level" composition.

### Option D — Image-generation hybrid

Use an image model for background art / decorative layers, composite text and device via the canvas.

- **Pro:** Rich, organic visuals impossible with gradients alone.
- **Con:** Non-reproducible, brand-consistency and licensing risk, text rendering unreliable, breaks the deterministic developer-first story. Only worth it as an optional background provider later.

## 4. Recommendation

**A as the destination, C-lite as the immediate step, B as the quality floor.** Concretely, in order:

1. **(C, now)** Expose screenshot-into-frame + image layers to the agent, and demote the taste rules to advisory. Two changes, and the output stops looking like a mockup. Rules that remain hard: export size, safe area, min font, off-canvas.
2. **(B, cheap)** Add 5–10 reference strips (PNG) and 3–5 saved layout templates; feed references to the vision rubric as the scoring anchor and to the designer agent as few-shot inspiration.
3. **(A, the real fix)** Add an HTML/CSS strip-composer path: planning-agent brief → agent writes one HTML file per strip → Playwright renders panels at export size → existing `validate-rules` runs on the PNGs as safety → optional converter back to display JSON for human touch-up in Fabric. Keep the canvas-op path for human-in-the-loop edits.

**What this solves vs. today:**

| Problem today | After plan |
| --- | --- |
| Green placeholder screens | Real app screenshots masked into frames (step 1) |
| Every panel = same top-text/centered-phone template | Full CSS vocabulary: overlap, crop, shadow, span, asymmetry (step 3) |
| Agent optimizes for rule compliance | Vision scoring vs. references is the target; rules are safety only (steps 1–2) |
| No taste input | Reference gallery anchors "what good looks like" (step 2) |
| Column-by-column design, no strip concept | One HTML document *is* the strip concept (step 3) |
| Dozens of costly enqueue round-trips | One generation + cheap code edits per iteration (step 3) |

**Direct answer to your question:** it's not mainly that Python is "too rigid" — it's that the agent is asked to design in a language with almost no words (ops allowlist), graded by a rubric that enforces one layout (validator), with no pictures of what good looks like (no references). The 3D projects you admired succeed because agents there write expressive code and see full renders. Give this agent the same medium and the same feedback, and the gap to human design closes substantially.

## 5. Suggested next actions (when you're ready to change code)

1. Add `add_image` + `apply_screenshot_to_device` to `CLIENT_AUTHORITATIVE_OPERATIONS` and the toolkit validator/reference docs.
2. Split `validate-rules` checks into `safety` (hard) vs `style` (advisory) tiers via profile config.
3. Collect a `references/gallery/` of great App Store strips per category; wire into the vision rubric prompt.
4. Prototype the HTML strip composer on one app (Bio) as a standalone script + Playwright render; compare output side-by-side with the current pipeline before integrating.
