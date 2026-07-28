# strip_editor — full implementation plan (self-contained)

> **Purpose of this document:** complete brief for building `strip_editor/` in a
> fresh session, with zero reliance on prior conversation. Give this file to the
> implementing agent as the primary instruction. Status: **approved direction,
> not yet started.**

---

## 1. Goal and rationale

Build a **visual editor that edits composer strip HTML files directly** — a
new app in a **new top-level folder `strip_editor/`** — so the strip HTML
becomes the **single source of truth** for store-screenshot designs, edited by
both the AI agent (file edits) and the human (this editor), with nothing to
keep in sync.

**Why (context from the project's history):**

- The repo already has an HTML-first design pipeline in `composer/`: agents
  author a whole strip as one HTML document, `composer/render.mjs` renders
  export-size PNGs via Playwright, and `toolkit ... validate-rules --tier
  safety` gates objective defects.
- The legacy human editor (`web_ui/`, Fabric.js canvas) required an
  HTML→canvas importer. Making two rendering engines agree produced a long
  tail of bugs (Fabric v7 center-origin default on textboxes, a text
  safe-zone clamp fighting programmatic placement mid-font-load, device panel
  clamps, font metric drift). Editing the HTML in the same engine that
  renders it (Chromium) eliminates that entire bug class: **what you edit is
  what ships.**
- Canvas→HTML back-sync is possible but lossy; a single-format editor
  dissolves the problem instead.

**The editor's guarantee:** open `output/strips/<name>.html` → see exactly
what `render.mjs` will export → manipulate blocks visually → save the same
file back.

## 2. Locked decisions

| Decision | Value |
| --- | --- |
| Location | **New folder `strip_editor/` at repo root.** Do not modify `web_ui/` (it stays as legacy until deprecation). |
| Stack | Same as `web_ui`: **Vite 8 + React 19 + TypeScript ~5.9 + Tailwind 4 (`@tailwindcss/vite`) + zustand 5 + lucide-react**. Node 22 (`.nvmrc`). **No fabric, no opencv.** |
| Dev port | **4714** (web_ui keeps 4713). Expose `EDITOR_API_BASE` pattern like `toolkit/.env`'s `DESIGNER_API_BASE`. |
| Source of truth | The strip HTML file, conforming to **`composer/strip-schema.md`**. The editor must never write markup that violates that schema. |
| Edit surface | The strip document rendered in an **iframe** (same-origin), with an overlay layer in the parent app for selection handles. The iframe DOM is mutated live; **Save** serializes it back to the file. |
| Agent/human turn-taking | Reuse the **one-way mode contract**: `GET/POST /__api/strip-editor/mode` (same JSON shape as web_ui's `/__api/screenshot-designer/mode`: `{mode: "human"|"agent", since, holder}`). While `agent`, the editor is read-only with the amber banner + **Take over** button; while `human`, agent file writes are the thing to avoid — the agent skill must check mode before editing strip files. |
| Agent interface | **File edits + auto-reload.** No SSE op channel. The dev server watches the open strip file; external changes reload the iframe (and show "agent updated the design" toast). |

## 3. What already exists (read these files first)

| Path (repo root) | Role for this project |
| --- | --- |
| `composer/strip-schema.md` | **The layer contract.** Panels: `<section data-panel="N">` at exact export size, `position:relative; overflow:hidden`. Layers: `data-layer="text|device|image|decor"` blocks, absolutely positioned. Text roles via `data-role="title|subtitle|caption"`. Device blocks: `data-device data-pack data-pose data-screenshot data-fit data-screen-fallback`, CSS `width` sets scale, **never set height** (aspect from pose). z-order = DOM order unless explicit `z-index`. |
| `composer/device-frames.mjs` | Browser runtime that builds device blocks (homography warp + `#screen` clip + frame SVG). The editor iframe loads it as-is. Sets `window.__composerReady`. |
| `composer/homography.mjs` | matrix3d solver + helpers (shared module, no deps). |
| `composer/render.mjs` | Headless export: strip → `panel<N>.png` + `strip-data.json` (AgentPanelPreviewData v1). The editor gets an "Export" button that shells out to it (dev-server endpoint). |
| `composer/test/bio-strip.html`, `output/strips/appstore_strip.html` | Real strip documents to develop against. |
| `web_ui/public/device-frames/<pack>/frame.json` + `frame/*.svg` | Device pose catalog: `frames[].name`, `corners` (screen quad, in **the SVG's own viewBox space**), `clipCornerRadiiPx`. |
| `toolkit/scripts/designer.py validate-rules … --tier safety` | Post-export validation (objective defects only; style checks are warnings). See `toolkit/references/design-validate.md` § Tiers. |
| `web_ui/vite-plugin-datasource-api.ts` | Reference implementation for a Vite dev-server API plugin (file IO, mode endpoint, screenshot upload). Copy patterns, not code wholesale. |
| `datasource/screenshots/<preset>/` | Real app screenshots the device picker should browse. |

## 4. Hard-won technical facts (do not rediscover these)

1. **Trust the SVG viewBox, not `frame.json` view sizes.** At least one entry
   (`iphone_12_pro/tilted-front`) has stale `viewWidth/viewHeight` (says
   1282×1485; SVG is 785×1401). `corners` and the `#screen` path are authored
   in the SVG's own viewBox space. `composer/device-frames.mjs` already does
   this correctly.
2. **URL spaces differ per server.** Strip HTML uses repo-root paths
   (`/datasource/...`, `/web_ui/public/device-frames/...`, `/composer/...`).
   The strip_editor dev server must serve these exact paths (repo-root static
   aliasing), plus alias `/__api/datasource/*` → `datasource/*` for strips
   authored with dev-server URLs.
3. **Fabric-era bugs are cautionary tales for editor code:** never rely on a
   library's implicit anchor/origin defaults; never auto-"correct" layer
   positions in event handlers (a safe-zone clamp measuring text mid-font-load
   yanked legal layers around for days). Layout policy belongs to the
   validator, not the editor.
4. **Fonts:** strips must not use network assets. System fonts work; a later
   phase can add `/composer/fonts/` with `@font-face` if needed. Wait for
   `document.fonts.ready` + `window.__composerReady` before enabling editing
   (geometry read too early = wrong).
5. **Panels export independently.** Blocks may overhang a panel
   (`overflow:hidden` crops them) — that's a *feature* (pro cropped-device
   look). The editor must allow dragging blocks partially outside panels and
   must not clamp.
6. **AgentPanelPreviewData v1** (`strip-data.json`) shape is defined by
   `web_ui/src/types/agentPanelPreviewData.ts`; `render.mjs` emits it from
   the DOM; validate-rules consumes it. Don't change the shape.

## 5. Product scope (v1)

A single-page app: file picker (strips under `output/strips/` +
`composer/test/`) → editor view:

- **Center:** zoomable/pannable strip surface (iframe at CSS scale; zoom
  25–200%, fit-width default; panel boundaries and gap visualized).
- **Left:** layer tree per panel (from DOM `data-layer` blocks; select,
  reorder by drag = DOM order/z-index, show/hide eye = `visibility`).
- **Right:** inspector for the selected block (contextual by kind).
- **Top:** file name + dirty state, Save, Export (render.mjs), Validate,
  zoom controls, mode banner slot.

### Editing capabilities v1

| Interaction | Mechanism |
| --- | --- |
| Select block | Overlay hit-testing via `elementFromPoint` in iframe; selection rectangle + 8 resize handles drawn in parent overlay (transform iframe coords → screen). |
| Move | Drag → update inline `left/top` (px, panel-relative). Arrow keys nudge 1px / Shift 10px. |
| Resize | Handles → update `width` (+`height` for non-device blocks). Devices: width only (aspect follows pose). Text: width changes wrap; font size in inspector. |
| Text edit | Double-click → `contentEditable` on the block inside the iframe; Enter inserts `<br>`; blur commits. |
| Text style | Inspector: font family (system list + strip-defined CSS vars), size, weight, color, align, line-height, letter-spacing → inline styles. |
| Device | Inspector: pack/pose picker (thumbnails rendered from the SVGs), screenshot picker (browse `datasource/screenshots/<preset>/` via API, incl. upload), `data-fit`, `data-screen-fallback` color, drop-shadow presets (CSS filter). Changing pose/screenshot re-runs the device runtime for that block. |
| Decor / image | Move/resize/delete; edit `border-radius`, `background`, `opacity`, `filter` (raw CSS field is acceptable for v1). |
| Panel background | Inspector when panel selected: CSS background editor (solid / linear / radial with stops) writing the panel's inline `background`. |
| Add layer | Toolbar: text (title/subtitle/caption presets), device (defaults to `front`), image (upload → `/datasource/screenshots/...`), decor (empty div primitive). Inserted per schema with `data-layer` attributes. |
| Delete / duplicate | Del key / ⌘D on selection. |
| Undo/redo | Command stack in the parent app (each command = {blockId, prop, before, after}); ⌘Z/⇧⌘Z. Serialize-checkpoint fallback is acceptable for v1 if commands get hairy. |

### Explicitly out of scope v1

Multi-select, rotation UI (raw CSS field covers it), snapping guides
(phase 7), template library, custom font upload, Play Store presets beyond
what the schema already allows, editing rasterized image *content*.

## 6. Server API (Vite plugin, mirror web_ui patterns)

| Method/path | Behavior |
| --- | --- |
| `GET /__api/strip-editor/files` | List `output/strips/*.html` + `composer/test/*.html` (name, mtime). |
| `GET /__api/strip-editor/file?path=` | Read strip HTML (path-jail to repo root, only `.html` under allowed dirs). |
| `PUT /__api/strip-editor/file?path=` | Save strip HTML (body = full document). Write atomic (tmp+rename). |
| `GET /__api/strip-editor/watch?path=` (SSE) | Emits when the file changes on disk (agent edits) → client reloads iframe if not dirty; if dirty, show conflict choice (reload vs keep mine). |
| `GET/POST /__api/strip-editor/mode` | Same contract as web_ui mode endpoint (in-memory, default `human`). |
| `POST /__api/strip-editor/export?path=` | Spawn `node composer/render.mjs --strip <path> --out output/strips/rendered --full`; stream/return the JSON summary. |
| `POST /__api/strip-editor/validate?path=` | After export, run `toolkit/.venv/bin/python toolkit/scripts/designer.py validate-rules … --tier safety` per panel using `output/strips/rendered/strip-data.json`; return aggregated JSON. |
| `GET /__api/strip-editor/screenshots?preset=` / `POST …/screenshots` | List / upload screenshots in `datasource/screenshots/<preset>/` (copy multipart pattern from `web_ui/vite-plugin-datasource-api.ts`, field `file`, bucket = preset). |
| Static | Serve repo-root paths: `/datasource/*`, `/web_ui/public/*`, `/composer/*`; alias `/__api/datasource/*` → `/datasource/*`. |

## 7. Serialization rules (critical)

- Parse once on load (iframe does it natively); **Save serializes
  `document.documentElement.outerHTML`** of the iframe plus doctype — after
  stripping editor artifacts: any element/attribute the editor injected must
  be namespaced (`data-se-*` attributes, `<style id="se-*">`, overlay handled
  in parent so ideally nothing leaks) and removed before serialization.
- Device blocks: the runtime injects children (stage/clip/img). **Before
  save, strip device block children** — the block must persist as the empty
  declarative element per schema (runtime rebuilds on load). Simplest: on
  save, for each `[data-device]` clone-empty the element preserving
  attributes/style.
- Preserve author formatting where cheap (don't pretty-print the whole file;
  targeted attribute/style mutations keep diffs small). Full-document
  re-serialization is acceptable v1 — git diffs matter less than correctness —
  but keep `<head>` (styles/scripts) byte-identical unless edited.
- Inline styles are the write target for geometry; do not rewrite authors'
  `<style>` rules (v1 reads computed styles, writes inline overrides).

## 8. Phases with acceptance criteria

**P0 — Scaffold + faithful viewing** (~1 session)
Vite app on 4714, static aliasing, file list, open
`composer/test/bio-strip.html` in the scaled iframe; panels/gaps outlined;
zoom/fit controls. ✅ Accept: bio strip renders identically to
`output/strips/bio-test/*.png`; devices build (runtime works in iframe).

**P1 — Selection + layer tree + inspector (read-only)** (~1 session)
Click/tree selection, handles drawn, inspector shows computed geometry +
kind-specific props. ✅ Accept: every `data-layer` block in both test strips
selectable from canvas and tree; geometry readouts match DOM.

**P2 — Move/resize/nudge + dirty state + Save** (~1 session)
Inline-style writes, overhang allowed, atomic save, reload-after-save renders
identically. ✅ Accept: move a title, save, run `render.mjs`, PNG shows the
move exactly; file diff touches only that block's style.

**P3 — Text editing + text inspector** (~1 session)
contentEditable with `<br>` handling, font controls. ✅ Accept: edit copy +
retype a title (family/size/line-height), save, export, validate `--tier
safety` exit 0.

**P4 — Device + image + decor + panel background editing** (~1–2 sessions)
Pose/screenshot pickers (incl. upload), fallback color, shadow presets,
background editor. ✅ Accept: swap a pose and screenshot, recolor a panel
gradient, export — screen fit stays pixel-correct on all 8 iphone poses.

**P5 — Add/delete/duplicate/z-order + undo/redo** (~1–2 sessions)
Schema-conformant insertion, command stack. ✅ Accept: build a 1-panel design
from a blank strip template entirely in the editor; 20-step undo/redo run
returns to byte-identical document.

**P6 — Agent interop: watch + mode lock + export/validate buttons** (~1 session)
SSE watch, conflict prompt, mode banner + take-over, Export/Validate UI.
✅ Accept: while agent (or `touch`) edits the file, editor reloads live;
in agent mode the surface is read-only; Validate button reports per-panel
safety results.

**P7 — Polish: snapping guides, blank-strip templates, keyboard map, README**
(~1 session) ✅ Accept: guides snap to panel edges/centers/sibling edges at
threshold 6px; `strip_editor/README.md` documents everything.

**P8 — Migration (separate approval)**
Update `.claude` skills: strip-composing gains "human continues in
strip_editor" handoff (replacing import-to-canvas as the default); README
architecture rewrite; `web_ui`/importer marked legacy. Do not delete web_ui.

## 9. New folder layout

```
strip_editor/
  package.json            # react, react-dom, zustand, lucide-react, tailwindcss, @tailwindcss/vite, vite, typescript
  .nvmrc                  # 22
  vite.config.ts          # port 4714 + apiPlugin + repo-root static aliases
  vite-plugin-editor-api.ts
  index.html
  src/
    main.tsx  App.tsx
    store/useEditorStore.ts        # file, dirty, selection, mode, zoom
    store/useHistoryStore.ts       # command stack
    editor/iframeBridge.ts         # load/reload, elementFromPoint, rect mapping, mutation helpers
    editor/serializeStrip.ts       # save-time cleanup (device children, se-* artifacts)
    editor/schema.ts               # data-layer kinds, insert templates, guards
    components/{FilePicker,EditorShell,StripStage,SelectionOverlay,LayerTree,Inspector/*,TopBar,ModeBanner,ExportPanel}.tsx
  README.md
```

## 10. Risks & mitigations

| Risk | Mitigation |
| --- | --- |
| iframe coordinate mapping under zoom | One transform helper, unit-tested; keep zoom as a single CSS scale on the iframe. |
| Serialization corrupting strips | Round-trip test in CI-ish script: load → save-with-no-edits must be semantically identical (compare rendered PNG hashes via render.mjs). |
| Device runtime rebuild churn | Rebuild only the affected block (`device-frames.mjs` exports `initDevices`; refactor-friendly: it may need a per-element rebuild export — small additive change to composer is allowed). |
| contentEditable HTML soup | Sanitize on commit: text nodes + `<br>` only inside text blocks. |
| Agent writes while editor dirty | Watch endpoint + explicit conflict dialog; mode discipline documented in skill. |

## 11. Kickoff for the fresh session (copy-paste)

> Read `docs/strip-editor-plan.md` and follow it. Start with Phase P0 in a new
> top-level folder `strip_editor/` (do not modify `web_ui/` or `composer/`
> behavior; small additive exports to `composer/device-frames.mjs` are
> allowed). Before coding, read: `composer/strip-schema.md`,
> `composer/device-frames.mjs`, `composer/render.mjs`,
> `web_ui/vite-plugin-datasource-api.ts` (patterns only), and open
> `composer/test/bio-strip.html`. Verify each phase's acceptance criteria
> before moving on, and stop for my review after every phase.
