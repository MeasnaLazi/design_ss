# Few-shot layout descriptions (`datasource/few_shots/`)

Markdown files here teach **composition patterns** for agents (primarily **`screenshot_planning`**). Each file is **layout and layer behavior only** — not a place for store listing copy, JSON payloads, or binary reference images.

**`screenshot_planning` creativity:** the agent should **Read** only **pattern** few-shots — every **`*.md`** in this folder **except** **`README.md`** and **`_TEMPLATE.md`**. Those two files are for **humans** (format spec and blank scaffold); they are **not** few-shot prompts for drafting **`creative_plan`**.

---

## File naming

- Use **lowercase slugs** with optional numeric suffix: `strip_dark_journal_v1.md`, `tablet_hero_split.md`.
- **One concept per file.** Split unrelated patterns into separate files.

---

## Required structure (every `.md` few-shot)

### 1. YAML front matter (first lines of the file)

Required keys:

| Key | Type | Meaning |
|-----|------|--------|
| `few_shot_id` | string | Stable id, **unique** across this folder (match filename stem when practical). |
| `title` | string | Human-readable name; may repeat as the document `H1`. |
| `use_for` | string | Primary consumer, e.g. `screenshot_planning`. |
| `content_type` | string | Always `layout_description` until another type is formally added. |

Optional keys (when useful):

| Key | Type | Meaning |
|-----|------|--------|
| `related_brief_sections` | string | e.g. `creative_plan.panels` |
| `notes` | string | One line of extra scope / non-goals. |

### 2. Body headings (fixed order, exact spelling)

Use **level-2 Markdown headings** in this **exact order**:

1. `## Overview`
2. `## Strip and background`
3. `## Text layers`
4. `## Device frames`
5. `## Invariants`

Optional block **after** invariants:

6. `## Composition notes` (optional — rhythm, variety, anti-patterns; still **no literal copy**)

### 3. Content rules

- **Describe** geometry, hierarchy, density, z-order, cross-panel behavior, and UI **roles** (e.g. “composer with keyboard”).
- **Do not** embed marketing strings, app names from listings, dates, cities, or other **instance values** pulled from a reference screenshot.
- **Do not** rely on companion `.json` or `.png` in this folder for the few-shot to make sense; the `.md` must stand alone.

---

## Adding a new few-shot

1. Copy [`_TEMPLATE.md`](_TEMPLATE.md) to a new slug filename.
2. Fill front matter and each required section.
3. Keep bullets **structural** (what goes where), not **verbatim** (what the words say).
