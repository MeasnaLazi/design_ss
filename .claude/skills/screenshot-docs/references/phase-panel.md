# Phase: screenshot_panel

**Agent:** [`.claude/agents/screenshot_panel.md`](../../../agents/screenshot_panel.md)

**CLI** (publisher root): **`python toolkit/scripts/designer.py …`** for session / enqueue / pull-preview / pull-export; **`python toolkit/scripts/layout.py …`** for safe-zone, text metrics, **`predict-checks`**, **`contrast`**. **`--compact`** immediately after **`layout.py`** or **`designer.py`**. **`toolkit/SKILL.md`**, **`toolkit/references/screenshot-designer-toolkit-reference.md`**.

Persist previews and scratch JSON under **`datasource/temp/`**.

---

## Preconditions

- **`creative_plan.user_approved`** is **`true`**.
- **`background.user_approved`** is **`true`** (strip background finalized).
- **`requirements.pack_id`** and frame catalog available.
- **`design.config.screens`** ≥ **`min(max(5, screenshots.length), 10)`** when applicable. If UI shows **1** screen while multiple beats exist, **stop** (user must fix Web UI **Screens**, then **`designer session`**) — this is an **error** gate, not a creative proceed gate.

---

## Plan-driven execution

Read **`creative_plan.panels[i]`** for each index. Implement **`looks_like`** and **`layers`** with **`add_text`**, **`add_device_frame`**, **`align`**, etc. Resolve **`content_source`** against **`requirements.store.screenshots`**.

**Default order:** `i = 0 … n-1` linearly. **No** “proceed to next panel?” prompts. After each panel reaches internal **Ship bar**, merge **`completed_panel_indexes`**, advance **`current_panel_index`**, continue until all planned panels are done.

**Escape hatch (later session):** User may ask orchestrator to **redo panel k** in a new delegation; document in Brief **`notes`** if needed.

---

## Panel-local coordinates

Treat the **active column** as its own artboard (origin top-left of that panel). Use **`panel_index`** / **`panel_number`** on **`add_text`**, **`add_device_frame`**, **`align`** with **`reference: "panel"`**. Snap **`x`/`y`** to **16** px within the panel. After **`pull-export --panels "<i>"`**, use **`panelLocalRect`** and per-layer **`left`/`top`** as **local** geometry.

- **Variety** across panels; **do not** change font/size/weight for the **same role** across columns — use strip-wide tiers (Step 6).
- **Previews:** Default **`render_panel_preview` + `pull-preview`** for the active index. Full **`render_preview`** at milestones / final strip only.

### Caution — CLI `--panels` when **more than one** column

| Flow | Multi-column use |
|------|------------------|
| **`pull-preview --panels`** / **`render_panel_preview`** + **`panel_indexes`** | One **combined PNG** for the contiguous block. |
| **`pull-export --panels`** | One **compact layout summary per column** for that block. |

Use **multiple** indexes **only** if **`creative_plan`** explicitly calls for adjoined-column work. Otherwise **one panel at a time**.

---

## Safe-zone policy

- **Text:** inside safe-zone — no clipping.
- **Device frames:** may cross safe-zone for hero emphasis if checks pass.
- **Decorative:** only if legibility remains.

---

## Creative layout rules

- **One panel = one beat** from **`screenshots[i]`** and **`creative_plan.panels[i]`**.
- **Strip-wide typography (Step 6):** lock **title**, **subtitle**, optional **body** tiers before panel **0** copy ops.
- **Geometry:** **`layout safe-zone`**, **`layout estimate-text-width`**, **`layout estimate-text-height`**. **`layer_patch`** width sets wrap; **`height`** required by API.

---

## Step 6 — Lock design system (**before panel 0 copy**)

Record in **`panel`:** **`typography_locked: true`**, **`title_tier`**, **`subtitle_tier`**, optional **`body_tier`**, **`spacing_ladder_px`**. Theme colors from **`store.theme`**.

---

## Step 7 — Build panel by panel (auto)

1. **`designer session`** → presetId, dimensions, **`design.config.screens`**, **`design.config.gap`**.
2. **`export_json`** + **`pull-export --panels "<i>"`** for **`layer_id`** ground truth for column **`i`**.
3. For each **`i`** in order:
   - **`add_device_frame`** with **`panel_index`** = **`i`**.
   - **`add_text`** / **`align`** / position ops: always **`panel_index`** = **`i`**; panel-local **`x`/`y`**.
4. After each **`i`**: **`render_panel_preview` + pull-preview`**; save preview path under **`datasource/temp/`**; append **`i`** to **`completed_panel_indexes`**; bump **`updatedAt`**.

---

## Ship bar (per panel → then strip)

1. Text inside safe-zone; thumbnail-readable.
2. Clean composition; hierarchy.
3. Typography matches locked tiers / spacing ladder.
4. Variety vs near-duplicate layouts.
5. **`layout predict-checks`** clean when used.
6. At least one full **`render_preview`** when structure is complete + **final** strip.

---

## Step 8 — Finalize

Merge **`completed_panel_indexes`**; set **`updatedAt`**. Report preset, frames used per panel, paths to **`datasource/temp/`** previews. **No** approval question — user reviews files async or in a follow-up turn.

---

## Panel-phase checklist

- [ ] **`creative_plan`** read for every panel index.
- [ ] **`align`** uses **`reference: "panel"`** for column anchors.
- [ ] Positional ops include **`panel_index`** matching the active column.
- [ ] **`typography_locked`** before copy placement.
- [ ] Brief reflects **`current_panel_index`** and **`completed_panel_indexes`**.
