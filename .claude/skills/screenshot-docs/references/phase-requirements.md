# Phase: screenshot_requirements

**Agent:** [`.claude/agents/screenshot_requirements.md`](../../../agents/screenshot_requirements.md)

This phase uses **layout only** — **`python toolkit/scripts/layout.py`** from **publisher root** — no **`designer.py`** and no Web UI. The orchestrator runs **`screenshot_planning`** next, then **`toolkit_runner`**, then background / panel.

**Command form:** `python toolkit/scripts/layout.py [--compact] <subcommand> …` — **`--compact`** must come **right after** `layout.py`. Shorthand **`layout store-json`** means **`python toolkit/scripts/layout.py store-json`**.

Save scratch JSON under **`datasource/temp/`** with clear filenames.

---

## Workflow Step 0 — User go-ahead (blocking)

**Do not** begin this build’s **`layout`** work until the user explicitly approves. Until then, **do not** run:

- **`layout store-json`**, **`layout device-packs`**, **`layout load-frame`**, or other **`layout`** ops whose purpose is **this** screenshot build

**Never** in this agent: **`python toolkit/scripts/designer.py …`**.

**Mandatory prompt** — one message including:

1. One line: this step is **requirements only** (device, pack, store JSON on disk) — **creative planning and Web UI come later** (**`screenshot_planning`**, then **`toolkit_runner`**).
2. This go-ahead block:

> **Start screenshot design now?**  
> Next I will: (1) ask you to pick **device type** (iPhone / iPad / Android phone / Android tablet), (2) show **device packs** so you choose **one pack**, (3) load **store JSON** via the layout CLI, and (4) write **`datasource/temp/design_brief.json`**.  
> After that, the orchestrator will run **creative planning**, then start the **Web UI** (**`toolkit_runner`**), then **background** and **panel** execution from the approved plan.  
> Reply **yes**, **proceed**, or **start** when ready. If not ready, say **wait** or what to change first.

3. **Stop and wait.**

**Treat as approval:** yes, proceed, start, go ahead, ok, begin, y (when clearly agreeing).

**Narrow skip:** If the launching user message already explicitly affirms starting screenshot design and has no blockers, acknowledge in one line and continue.

**After Step 0 approval:** Ask **one** thing per user turn until requirements are done. Next message = **Step 2a only** (device type list). After they answer, **Step 2b** (show packs, pick one). Do **not** stack device type + pack pick + panel count in one message.

---

## Step 2 — Platform and device pack

### 2a — Device type

Ask with this shape:

> Select one target device type:  
> 1. iPhone  
> 2. iPad  
> 3. Android Phone  
> 4. Android Tablet

Map to **`--platform`**:

| Choice | `--platform` |
|--------|----------------|
| iPhone | `iphone` |
| iPad | `ipad` |
| Android Phone | `phone` |
| Android Tablet | `tablet` |

### 2b — List packs

Use **`layout device-packs`** (see toolkit reference). Filter by chosen platform **`type`**; show matching **`name`** values. User picks **one pack**. Record **`pack_id`** (directory name) and **`path`**.

### 2c — Load frame config

**`layout load-frame`** for the chosen **`pack_id`**. From each **`frames`** entry keep only **`name`**, **`description`**, **`framePath`** (for **`add_device_frame`** later — Panel agent uses these). Do not ask the user to pick frame styles; Panel chooses per panel from this pack.

---

## Step 3 — Store JSON (load + **user confirm**)

Run **`layout store-json`** for the same **`--platform`** (see toolkit for flags and paths).

Expect **`store`**, **`presetId`**, **`canvasSize`**, **`absolutePath`** in output. If the file is missing, stop — user should run **app_optimizer** to create **`output/*.json`**.

Extract **`store.name`**, **`store.theme`**, **`store.screenshots`**. Keep **`presetId`** and **`absolutePath`**.

### 3a — Show summary and ask for confirmation (blocking)

Send **one** concise message: app **name**, **path** to the JSON, **count** of `screenshots[]`, one-line **theme**, **presetId** if useful.

Ask explicitly, e.g.:

> **Does this store listing look right for screenshot work?** Reply **confirm** (or **yes** / **looks good**) to continue, or say **what to change**.

**Stop and wait** until the user **confirms** or describes changes.

### 3b — If the user wants changes

- **Wrong platform or pack** — Go back to **Step 2**, then **re-run `layout store-json`** and return to **3a**.
- **Store file content is wrong** — They should edit **`absolutePath`** or re-run **app_optimizer**; when done, **re-run `layout store-json`** and return to **3a**.
- **Small session-only tweaks** — Apply only what they asked into **`requirements.store`** / **`requirements.notes`**. Prefer file edits + **`layout store-json`** for durable listing changes.

Repeat **3a → 3b** until explicit **confirm**.

---

## Step 4 — Screenshot listing context (for Brief)

Treat each **`screenshots[]`** entry as **source copy** for a future panel.

**Panel count target:** **`target_panel_count` = `min(max(5, screenshots.length), 10)`** when data supports it (cap **10**). The Web UI **Screens** should be **≥ `target_panel_count`** before Panel-phase work; remind the user here if needed.

### 4a — Show panel plan and ask for confirmation (blocking)

Send **one** message: ordered **index → title** (and optional **subtitle**) for each **`screenshots[]`** row, the computed **`target_panel_count`**, and Web UI **Screens** reminder if needed.

Ask explicitly, e.g.:

> **Does this panel order and copy look right for the strip?** Reply **confirm** to lock this listing for the brief, or say **what to change**.

**Stop and wait** until the user **confirms** or describes changes.

### 4b — If the user wants changes

- **Same remedies as Step 3b** if the issue is the underlying store file or platform/pack.
- **Per-panel copy for this session only** — merge into **`requirements.store`** / **`notes`** as approved.
- **Panel count / Web UI** — acknowledge; re-show **4a** after they say they’re done.

Repeat **4a → 4b** until explicit **confirm**.

---

## Merge `design_brief.json`

After **Step 3** and **Step 4** are each **confirmed**, **write or merge** **`datasource/temp/design_brief.json`**.

**`requirements`** must match the **final agreed state**, including:

- **`store`** / **`store_json_path`** / **`preset_id`** from the latest successful **`layout store-json`** after any **3b** re-runs.
- Session tweaks from **3b** / **4b** in **`requirements.store`** / **`requirements.notes`**.
- **`target_panel_count`**, **`platform`**, **`pack_id`**, **`pack_path`**, frame metadata from **2c**, **`user_started`** per **`screenshot_design_brief.md`**. **Do not** set **`handoff_ok`** / **`web_ui_status`** here.
- For **5+** screenshots on one strip, optionally set **`requirements.notes`** with legibility guardrails (e.g. minimum title/subtitle **`size_px`** intent, vertical band summary) so **`screenshot_planning`** inherits strip-wide expectations before drafting **`creative_plan`**.

Also:

- Set **`updatedAt`** (ISO-8601).
- **Merge**; preserve **`creative_plan`**, **`background`**, **`panel`** unless the user asked to reset them.

Do **not** fabricate **`creative_plan`**, **`background`**, or **`panel`** if absent.

---

## Handoff

Tell the user requirements are saved and the orchestrator should run **`screenshot_planning`** next (then **`toolkit_runner`**, then **`screenshot_background`**, then **`screenshot_panel`**).

---

## Requirements-phase checklist

- [ ] **Step 0** approval before **`layout store-json`** / **`device-packs`** / **`load-frame`**.
- [ ] **No** **`designer.py`** in this phase.
- [ ] One **`pack_id`** + **`load-frame`** metadata recorded.
- [ ] Store path and **`store`** snapshot; user confirmed Step 3 and Step 4.
- [ ] **`datasource/temp/design_brief.json`** updated (`requirements`).
