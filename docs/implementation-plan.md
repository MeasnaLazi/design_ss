# Implementation plan — HTML/CSS strip composer

*Status: awaiting approval. No code changes until approved. 2026-07-09.*

Builds on `docs/agent-design-improvement-plan.md`. Agreed decisions from discussion:

- Agent authors designs as **HTML/CSS strip documents**, rendered to PNG by Playwright; Fabric canvas remains the human editing surface.
- Device screenshots fit into frames via **matrix3d homography computed from the existing `frame.json` `corners`** (mask_analysis stays as the one-time calibration tool per frame pack).
- **No simultaneous co-design.** One-way exclusive modes: while the agent designs, the human canvas is locked; when the human designs, the agent is stopped. Handoff is explicit, not concurrent.

---

## Phase 1 — Composer core (render pipeline)

**Goal:** one HTML file → pixel-exact store PNGs, proving the medium works. No agent changes yet.

1. New top-level folder **`composer/`** (Node, since Playwright + frame assets are already Node-adjacent):
   - `composer/render.ts` — CLI: `npm run render -- --strip <file.html> --preset appstore_iphone_portrait --out output/panels/`. Opens the HTML in headless Chromium at exact export size, screenshots each panel slot and the full strip.
   - `composer/homography.ts` — ~30-line solve: unit rect → `frame.json` corners → CSS `matrix3d` string. Exposed both as a build-time helper and as a small inline runtime script the HTML can include.
   - `composer/strip-schema.md` — the **layer contract** the agent must follow: strip = absolutely-positioned panels; each panel contains blocks of kind `text | device | image | decor`, each block tagged `data-layer` + `data-panel` attributes. Free CSS allowed *inside* blocks; structure stays machine-readable (this keeps a future HTML→display-JSON importer mechanical).
2. Device component: reusable HTML/CSS snippet that takes `pack`, `pose`, `screenshot` and renders frame SVG over matrix3d-warped screenshot with `clipCornerRadiiPx` clip — reading `web_ui/public/device-frames/*/frame.json` directly.
3. **Acceptance:** hand-written test strip for Bio (using an existing pose per panel + a real screenshot) renders 5 PNGs at 1290×2796 with pixel-correct screen fit for all 8 iPhone poses. Visual side-by-side vs current canvas output.

**Risk:** none to existing code — additive folder only.

## Phase 2 — Validation split (safety vs style)

**Goal:** rules stop enforcing taste; they only catch defects.

1. In `toolkit/scripts/designer/` rules config: tag each check `safety` (hard fail: `png_preset_match`, `text_safe_margins`, `text_font_min_size`, off-canvas ink, `panel_empty_margin_bands`) or `style` (advisory: `device_height_band`, `device_horizontal_center`, `text_device_vertical_gap`, `text_align_consistency`, `text_hierarchy_sizes`, etc.).
2. `validate-rules` gains `--tier safety|all` (default `safety` for exit code; style results still printed as warnings). `validate-strip-rules` same treatment.
3. Update `toolkit/references/design-validate.md` accordingly.
4. **Acceptance:** a deliberately "pro-style" panel (cropped device, text overlapping shadowed device) passes `--tier safety` and fails nothing hard; a broken panel (text off-canvas) still exits non-zero.

## Phase 3 — Agent workflow on the new medium

**Goal:** screenshot-designer-agent authors HTML instead of enqueue-ops.

1. New skill **`.claude/skills/strip-composing/SKILL.md`** (replaces `screenshot-designing` as the designer's primary skill):
   - Inputs unchanged: `output/screenshot_report.md`, store JSON theme.
   - Workflow: read brief → write `output/strips/<store>_strip.html` per the layer contract → render via composer CLI → **look at PNGs (vision) against reference gallery** → edit HTML → re-render. Iterate freely (cheap now); `validate-rules --tier safety` as final gate per panel + strip.
   - Drop the single-panel gate; design the strip as one composition, then refine per panel.
2. **Reference gallery:** `composer/references/<category>/*.png` — 5–10 strong App Store strips (start with lifestyle/journaling for Bio). Vision rubric rewritten to score *against* these anchors instead of abstract categories.
3. Update `.claude/agents/screenshot-designer-agent.md`: HTML-first, canvas ops no longer used while in agent mode. Trim the prescriptive layout rules (they encoded the old archetype); keep copy-sanitization + theme-color sourcing rules.
4. `planning-agent`, `data-gathering-agent`, `tool-running-agent`: unchanged except tool-running also verifies `composer/` deps (Playwright installed).
5. **Acceptance:** full agent run on Bio produces a 5-panel strip with real screenshots in frames, visibly stronger than `output/temp/panel*.png` baseline; safety validation exit 0.

## Phase 4 — Mode lock + handoff (one-way exclusive editing)

**Goal:** agent mode and human mode are mutually exclusive, with explicit handoff.

1. Dev-server state: `screenshot-designer-server.ts` gets `GET/POST /__api/screenshot-designer/mode` → `{ mode: "human" | "agent", since, holder }`.
2. Web UI: when `mode=agent`, canvas becomes read-only with a banner ("Agent is designing — Take over" button). Clicking **Take over** sets `mode=human`.
3. Toolkit: `designer.py` gains `mode get|set`. Agent skill requires `mode set agent` at run start; every composer render + any future enqueue-op refuses when `mode=human` (agent stops cleanly and reports). Human clicking Take over therefore halts the agent at its next tool call.
4. Handoff artifact: on agent completion (or take-over), the **HTML → canvas importer** brings the design into Fabric. **Design revision (found during Phase 4 implementation):** `display_*.json` stores raw Fabric serializations (`fabricObjects` enlivened by `util.enlivenObjects`) — hand-crafting those in Node is fragile. Instead the importer is an **op-sequence replayer**: `composer/import-to-canvas.mjs` reads `output/strips/rendered/strip-data.json` + the strip HTML and emits ordered `enqueue-op` calls (`set_background`, `add_text` + patches, `add_device_frame` + `device_set_size`/`device_set_position`/`set_z_index`), letting the UI's existing creation paths build native, editable layers; the UI auto-save then persists `display_*.json`. **Prerequisites (from Phase 5's optional list, now required):** expose `add_image` (for decor rasterized to PNGs) and `apply_screenshot_to_device` (real screenshots into frames) as client ops in `applyAgentCommand.ts` + server allowlist + `enqueue_validate.py` + designer-reference. Fidelity: text/device/background native; decor blocks rasterized via Playwright element screenshots to `datasource/screenshots/` and imported as image layers; CSS-only effects (drop-shadows on devices) are approximated or dropped, listed in the importer's report.
5. **Acceptance:** agent run mid-flight + human Take over → agent stops within one op; imported design opens in canvas and is editable; agent restart requires explicit mode switch back.

## Phase 5 — Real screenshot pipeline + cleanup

1. Convention for real app screenshots: `datasource/screenshots/<preset>/<panel>.png`; data-gathering-agent records paths into store JSON slots; composer resolves them (fallback: existing placeholder).
2. Docs: README architecture section, `web_ui/TOOLKIT.md` (mode endpoint), retire outdated parts of `screenshot-designing` skill (keep file with pointer to `strip-composing`).
3. Optional (deferred): expose `add_image` / `apply_screenshot_to_device` as canvas enqueue-ops for human-mode agent assists — only if needed after Phase 4.

---

## Order & effort

| Phase | Depends on | Effort | Value |
| --- | --- | --- | --- |
| 1 Composer core | — | ~2–3 sessions | Proves medium; biggest unknown retired first |
| 2 Validation split | — (parallel to 1) | ~1 session | Removes taste-cage |
| 3 Agent workflow | 1, 2 | ~2 sessions | The actual quality jump |
| 4 Mode lock + importer | 1 | ~2 sessions | Restores human handoff |
| 5 Screenshots + docs | 3, 4 | ~1 session | Ship polish |

## Open decisions (answer at approval)

1. **Composer location:** standalone `composer/` with own `package.json` (proposed — clean deps) vs inside `web_ui/` (shares node_modules, but mixes concerns).
2. **Importer fidelity (Phase 4):** rasterize `decor` blocks to image layers (simple, proposed) vs attempt native shape layers in Fabric (more work, better editability).
3. **Old canvas-op design path:** keep documented as fallback (proposed) or remove from agent docs entirely.

## Rollback safety

Phases 1–3 are additive (new folder, new skill, flag on validator). The current pipeline keeps working untouched until Phase 4 modifies `screenshot-designer-server.ts` and the web UI — and that change is itself behind the mode flag defaulting to `human`.
