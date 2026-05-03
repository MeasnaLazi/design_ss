# Phase: screenshot_planning

**Agent:** [`.claude/agents/screenshot_planning.md`](../../../agents/screenshot_planning.md)

## Purpose

Produce a single **`creative_plan`** object in **`datasource/temp/design_brief.json`** that is detailed enough for **`screenshot_background`** and **`screenshot_panel`** to execute **without further creative questions** (full-auto downstream).

---

## Few-shots (creativity vocabulary)

Before drafting **`creative_plan`**, **Read** layout pattern files under **`datasource/few_shots/`** from publisher root:

- Include **every** `*.md` in that folder **except** **`README.md`** and **`_TEMPLATE.md`** (human format spec + blank scaffold — **not** agent prompts).
- Use **Glob** or **Grep** to discover pattern slugs; default rich strip if unsure: **`datasource/few_shots/strip_bio_journal_few_shot.md`**.
- **Translate and adapt** — few-shots are **references**, not blueprints to copy 1:1. Pick what fits each **`screenshots[i]`** beat (you may use fewer devices, no cross-column span, different stacking, etc.). **Never** paste few-shot markdown as store listing copy; store strings come from **`requirements.store.screenshots`**. Turn chosen patterns into **`looks_like`**, **`layers[]`**, and optional **`layout`** for this app only.

---

## Creative output bar

Plans may specify **rich** strips when text invariants hold:

- **Multiple** `device_frame` layers per panel; varied **tilt**, **scale**, **z-order**; devices may **span adjacent strip columns** (document **`anchor_panel_index`** + **`spanning_panel_indexes`** in **`layout.device`**).
- **Multiple** copy roles per panel when needed: e.g. `title`, `title_secondary`, `kicker`, `subtitle`, `subtitle_secondary`, `body` — each with its own **`content_source`** and optional **`layout.text`**.
- **Cross-panel** continuity: one physical story across gutters (clamp-friendly); call it out in **`looks_like`** and device **`layout`**.

**Text invariants (always):** marketing copy stays **inside safe zones**, **never under bezels**, **no overlap between text boxes**, **no clipping** at panel edges. **Devices** are not held to the same rules: may cross gutters, tilt, stack, occlude.

---

## Executable typography (planning only)

- **`creative_plan`** / optional **`layout.text`** must use designer **`font_token`** values: `headline` \| `subheadline` \| `body` \| `caption`, plus **`size_px`**, **`weight`**, **`color_hex`**, etc. The Web UI maps tokens to loaded faces — do not treat arbitrary font **family** strings as API selectors. See **`toolkit/references/screenshot-designer-toolkit-reference.md`** (`add_text`).
- Optional human mood strings (e.g. in **`notes`** or a future **`typeface_intent`** field) should be **genre-level** only and must not read as “this exact font file is guaranteed loaded” unless documented elsewhere as supported.

Typography **policy** belongs in planning outputs and **`screenshot_design_brief.md`** — **not** duplicated inside **`datasource/few_shots/`** pattern bodies (those stay layout-only per folder README).

---

## What to include

### Strip background (`creative_plan.background`)

- Prefer **`preset_number` 1–13** and matching **`preset_name`** from the Background catalog (**`phase-background.md`**). If the user insists on mood-only direction, set **`preset_number`** `null` and spell **`mood_notes`** so Background can still map to a catalog choice deterministically.
- Tie language to **`requirements.store.theme`** (primary, background, text, accent).

### Per panel (`creative_plan.panels`)

- One object per index **`0 … n-1`** where **`n`** matches the agreed screenshot strip (typically **`requirements.target_panel_count`** and **`store.screenshots.length`**).
- **`looks_like`:** concrete visual paragraph: hierarchy, density, which devices lead, cross-column behavior, where negative space for type lives.
- **`layers`:** ordered list (bottom → top intent via optional **`layout.stack.stack_order`**). Each entry: **`role`**, **`content_source`**, optional **`frame_hint`** / **`notes`**, optional **`layout`** (see **`screenshot_design_brief.md`**).

### Composition patterns (pick what fits the beat)

- **Stacked devices:** rear supporting phone + foreground hero; different angles.
- **Continuation:** frame **cropped** at panel edge so it **reads into** the next column — set **`spanning_panel_indexes`** on the device layer when adjacent.
- **Single hero + depth:** one near-frontal device with faint secondary frames behind (z and opacity implied via order + **`looks_like`**).
- **Multi-line marketing blocks:** titles/subtitles with explicit **`layout.text.max_width_px`** / margins so **screenshot_panel** does not guess wrap.

### Per-panel strict checklist (planning should answer)

- **Top air:** % of column height or **`margin_top_px`** for first text block.
- **Side insets:** px or safe-zone alignment for text blocks.
- **Title box** and **subtitle box:** approximate position region or **`x_px`/`y_px`** hints in **`layout.text`**.
- **Each device:** `anchor_panel_index`, **`target_width_px`** (or scale hint), **`tilt_deg`**, **`z_index_hint`** / **`stack_order`**, screen **role** (not literal UI strings).
- **Text–text gap** and **text–device clearance** in **`layout.spatial`** so copy never sits behind bezels.

### Cross-panel validation note

When **`spanning_panel_indexes`** spans **2+** adjacent columns, **screenshot_panel** should use **`render_panel_preview`** / **`pull-preview --panels`** with that **adjacent index set** for a single combined PNG during checks — see **`phase-panel.md`** multi-column caution.

---

## User loop (only creative gate)

1. **Read** **`datasource/few_shots/`** pattern `*.md` (exclude `README.md`, `_TEMPLATE.md`) + **`requirements`** + pack context.
2. Draft **`creative_plan`**; merge into the brief; bump **`updatedAt`**; set **`creative_plan.user_approved`: false** until final.
3. Present the plan clearly (background summary + per-panel index headers).
4. Incorporate feedback; revise **`creative_plan`** (optional bump **`version`**).
5. **Mandatory:** Ask for explicit approval, e.g. *Reply **approved** to lock this plan and start the Web UI / execution phases.*
6. On approval tokens (approved, yes, looks good, ship it when clearly final), set **`creative_plan.user_approved`: true`**, merge, bump **`updatedAt`**, stop.

---

## Merge rules

- **Preserve** **`requirements`**, **`background`**, **`panel`** keys unless the user explicitly asks to reset downstream sections for a fresh run.
- Do **not** set **`requirements.handoff_ok`** / **`web_ui_status`** — Background agent owns those after **`designer handoff`**.

---

## Checklist

- [ ] **`creative_plan.panels.length`** matches intended panel count for this session.
- [ ] Every **`panels[i].index`** matches **`store.screenshots[i]`** semantics.
- [ ] **Few-shots** read (pattern `*.md` only) when shaping layout vocabulary.
- [ ] **Text invariants** satisfied in the written plan (safe zone, no overlap, no type behind devices).
- [ ] **`creative_plan.user_approved`** is **`true`** only after explicit user approval.
- [ ] No **`designer.py`** calls from this phase.
