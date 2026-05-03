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

Read **`creative_plan.panels[i]`** for each index. Implement **`looks_like`** and **`layers`** with **`add_text`**, **`add_device_frame`**, **`align`**, **`device_set_angle`**, **`layer_patch`**, **`set_z_index`**, etc. Resolve **`content_source`** against **`requirements.store.screenshots`**.

When a layer defines **`layout`**, prefer **`layout.text`** / **`layout.device`** / **`layout.spatial`** / **`layout.stack`** for that layer’s **`add_*`**, **`layer_patch`**, and positioning instead of inferring solely from **`role`** + strip-wide tiers.

**Default order:** `i = 0 … n-1` linearly. **No** “proceed to next panel?” prompts. After each panel reaches internal **Ship bar**, merge **`completed_panel_indexes`**, advance **`current_panel_index`**, continue until all planned panels are done.

**Escape hatch (later session):** User may ask orchestrator to **redo panel k** in a new delegation; document in Brief **`notes`** if needed.

---

## Panel-local coordinates

Treat the **active column** as its own artboard (origin top-left of that panel). Use **`panel_index`** / **`panel_number`** on **`add_text`**, **`add_device_frame`**, **`align`** with **`reference: "panel"`**. Snap **`x`/`y`** to **16** px within the panel. After **`pull-export --panels "<i>"`**, use **`panelLocalRect`** and per-layer **`left`/`top`** as **local** geometry.

- **Variety** across panels; **default:** do not change font/size/weight for the **same role** across columns — use strip-wide tiers (Step 6). **Exception:** when **`creative_plan.panels[i].layers[j].layout.text`** is set for a layer, use those values for that layer (overrides tier-by-role for that instance).
- **Previews:** Default **`render_panel_preview` for the active index. Full **`render_preview`** at milestones / final strip only.

### Preview performance (speed)

- **Strip default scale:** In `web_ui`, set **`VITE_AGENT_PREVIEW_MULTIPLIER=1`** in `.env` for faster PNG capture during iteration; use **`2`** (or omit) when you want maximum sharpness for the agent. Restart Vite after changing env.
- **CLI override:** **`designer pull-preview --panels "<i>" --preview-multiplier 1`** forwards **`preview_multiplier`** on the enqueued **`render_panel_preview`** without changing the global env.
- **Polling:** **`--poll-interval`** (seconds) on **`pull-preview --panels`** adjusts how often the CLI GETs **`agent-preview`** while waiting for new bytes (default **0.08**).
- **Fewer round-trips:** Prefer **`batch`** / **`layers_patch_bulk`** so many canvas mutations run in **one** SSE delivery before a single preview pull.
- **`export_json` + `pull-export`:** Run at **panel boundaries** when you need canonical **`layer_id`** / geometry for column **`i`** — not between every micro-tweak (saves work around previews, not the PNG encode itself).
- **Benchmark:** From publisher root, **`python toolkit/scripts/benchmark_agent_preview.py --panels 0`** prints wall-clock ms and PNG size for one enqueue + poll cycle (requires Web UI + designer tab).

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

- **One panel = one primary listing beat** from **`screenshots[i]`** and **`creative_plan.panels[i]`** — the main title/subtitle pair should still map to that store row. **Secondary** copy layers (`title_secondary`, `kicker`, extra **`device_frame`** entries, etc.) are allowed when **`creative_plan`** declares them.
- **Strip-wide typography (Step 6):** lock **title**, **subtitle**, optional **body** tiers before panel **0** copy ops — these are **defaults** when a text layer has **no** **`layout.text`**. Layers **with** **`layout.text`** use the plan’s **`font_token`** / **`size_px`** / etc. for that layer.
- **Geometry:** **`layout safe-zone`**, **`layout estimate-text-width`**, **`layout estimate-text-height`**. **`layer_patch`** width sets wrap; **`height`** required by API.

---

## Step 6 — Lock design system (**before panel 0 copy**)

Record in **`panel`:** **`typography_locked: true`**, **`title_tier`**, **`subtitle_tier`**, optional **`body_tier`**, **`spacing_ladder_px`**. Theme colors from **`store.theme`**.

---

## Step 7 — Build panel by panel (auto)

1. **`designer session`** → presetId, dimensions, **`design.config.screens`**, **`design.config.gap`**.
2. **`export_json`** + **`pull-export --panels "<i>"`** for **`layer_id`** ground truth for column **`i`**.
3. For each **`i`** in order:
   - For **each** `device_frame` in **`creative_plan.panels[i].layers`** (in plan order): **`add_device_frame`** using **`layout.device.anchor_panel_index`** when set, else **`panel_index`** = **`i`**. Apply **`tilt_deg`**, size, and z from **`layout.device`** / **`layout.stack`** via **`device_set_angle`**, **`device_set_size`** / **`layer_patch`**, **`set_z_index`** as needed.
   - **`add_text`** / **`align`** / position ops: **`panel_index`** matches the layer’s column (usually **`i`**); panel-local **`x`/`y`**. Multiple text layers per column are expected when the plan lists them.
4. After each **`i`**: **`render_panel_preview` + pull-preview`** (optional **`designer pull-preview --preview-multiplier 1`** for speed; see **Preview performance** above); save preview path under **`datasource/temp/`**; append **`i`** to **`completed_panel_indexes`**; bump **`updatedAt`**.

---

## Ship bar (per panel → then strip)

1. Text inside safe-zone; thumbnail-readable.
2. Clean composition; hierarchy.
3. Typography matches locked tiers / spacing ladder **or** per-layer **`layout.text`** when present.
4. Variety vs near-duplicate layouts.
5. **`layout predict-checks`** clean when used — includes **text–text** bbox overlap within the **same strip column** (pairwise), text–device overlap, safe-zone, contrast, and headline-size heuristics per **`toolkit/scripts/layout/quality.py`**.
6. At least one full **`render_preview`** when structure is complete + **final** strip.

---

## Step 8 — Finalize

Merge **`completed_panel_indexes`**; set **`updatedAt`**. Report preset, frames used per panel, paths to **`datasource/temp/`** previews. **No** approval question — user reviews files async or in a follow-up turn.

---

## Panel-phase checklist

- [ ] **`creative_plan`** read for every panel index.
- [ ] Per-layer **`layout`** applied when present (text + device + stack).
- [ ] **`align`** uses **`reference: "panel"`** for column anchors.
- [ ] Positional ops include **`panel_index`** matching the active column.
- [ ] **`typography_locked`** before copy placement; **`panel.title_tier` / `panel.subtitle_tier`** magnitudes align with **`creative_plan`** **`layout.text.size_px`** where the plan specifies sizes (dense strips).
- [ ] **`layout predict-checks`** run where applicable; fix **text–text** or **text–device** overlap errors before treating a panel as shippable.
- [ ] Brief reflects **`current_panel_index`** and **`completed_panel_indexes`**.
