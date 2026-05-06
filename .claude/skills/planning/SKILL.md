---
name: planning
disable-model-invocation: true
description: >-
  Screenshot designer brief for apps_publisher. Reads output/appstore.json
  and/or output/playstore.json (screenshots array), writes
  output/screenshot_report.md, and the final reply must paste the full report
  markdown per report-template Agent contract—never summary-only. One panel and
  one device frame per screenshots[] entry; theme.primary_color / secondary_color
  from the same store file as screenshots; messaging-only elsewhere. Use when
  acting as planning-agent or when the user names this skill.
---

# Planning (screenshot brief for designers)

## When this applies

Use **whenever** you act as **planning-agent** or the user asks you to load this skill. You turn each chosen store JSON file’s **`screenshots`** and its **`theme`** (`primary_color`, `secondary_color`) into **`output/screenshot_report.md`** for a designer: what to communicate per panel and how the story connects. **Screenshot copy and colors always come from the same file:** `appstore.json`’s theme pairs with App Store screenshots; `playstore.json`’s theme pairs with Play screenshots—do not mix themes across files. Layout and visuals stay unspecified except copying those two hex values from **that** file.

## Repo root

Let **`R`** = the **apps_publisher** repository root (this workspace).

## Forbidden (art direction)

Do **not** prescribe or imply:

- Fonts, typography scale, weights, letter spacing  
- Colors **beyond** copying **`theme.primary_color`** and **`theme.secondary_color`** from **the same** `appstore.json` or **`playstore.json`** you took **`screenshots`** from (no cross-file merging, no invented palette rules, gradients, or “use navy for headings”)  
- Device model, bezel, notch, tablet vs phone choices  
- Frame size, crop, rotation, shadows, mocks  
- Backgrounds, illustrations, ornamentation  
- Text or device **position**, alignment, grids, margins, safe-area pixels  

You **may** reference **in-app conceptual content** suggested by title/subtitle/description (e.g. “timeline UI,” “quick note”) as **storytelling**, not layout.

Include **`theme.primary_color`** and **`theme.secondary_color`** in the report (see **Theme** below), sourced only from whichever store JSON processed that panel table. Present them as **store listing brand reference**—copy hex strings verbatim; do not extrapolate into layout or mockup prescriptions.

## Input files

| Path | Condition |
| --- | --- |
| `R/output/appstore.json` | Read when the user specifies App Store / `appstore`, or when processing **both**, or when it exists and Play is unspecified (see defaults below). From this file you read **`screenshots`** **and** **`theme.primary_color`** / **`theme.secondary_color`** together. |
| `R/output/playstore.json` | Read when the user specifies Play Store / `playstore`, or when processing **both**. Same: **`screenshots`** and **`theme`** for Play come **only** from this file. |

### Which file(s) to read

1. If the **user names** one store or one filename → read **only** that file (must exist; if missing, report and stop).  
2. If **both** `output/appstore.json` and `output/playstore.json` exist and the user gave **no** preference → process **both** in one report (two `## … — panel detail` sections).  
3. If **only one** exists → process **that one** only.  
4. If **neither** exists → stop and tell the user to generate JSON first (e.g. data-gathering-agent).

## Parse and validate

1. Parse JSON from each chosen file; on failure, stop and report.  
2. From **that same file**, read **`screenshots`**: array of `{ order, title, subtitle, description }`. Read **`theme`** if present (`primary_color`, `secondary_color`). Never take `theme` from one store file while using `screenshots` from the other.
3. Require **non-empty** `screenshots`.  
4. Sort by **`order`** ascending before generating rows.  
5. **Strict panel / device rule:** **`screenshots.length`** = total **panels** = total **planned device frames** in the carousel. Exactly **one** table row **per** array element; **`Device frames`** column is always **`1`** per row—no invented multi-device panels.

## Theme (report section)

Put **`## Theme (from store JSON)`** **after** the title/metadata lines (`Source`, `Generated`) and **before** **`## Overview (for the designer)`**, matching [report-template.md](report-template.md) (intro line about same-source colors, then bullets or **`###`** sub-blocks).

- **Single processed file:** Theme intro paragraph + **`Primary`** / **`Secondary`** bullets only (verbatim from `theme`, or `—` if missing/empty).  
- **Both files:** Theme intro paragraph + **`### App Store`** and **`### Play Store`**, each with Primary / Secondary from **that** JSON only.  
- Do **not** add `background_color`, `text_color`, or `accent_color` unless the user asks in chat; **this skill requires only primary and secondary.**

## Overview content

Under **`## Overview (for the designer)`**, include:

1. The numeric fact: **`N` panels** / **`N` device frames** where **`N` = screenshots.length**, and that each corresponds to **one store listing screenshot** / one JSON slot.  
2. **Marketing arc** in prose: overall story the carousel tells, using app name/subtitle/App Store `name` / Play Store `title` plus all screenshot copy as source material—not fabricating unrelated features.  
3. The **Out of scope** paragraph from [report-template.md](report-template.md) (same intent; small wording tweaks OK). Do **not** contradict the Theme section (primary/secondary are **in scope** there).

## Panel table

For **each** processed file, emit **`## {App Store | Play Store} — panel detail`** then **one markdown table**.

**Columns (fixed header):**

| Column | Rule |
| --- | --- |
| Panel | `Panel {i} (order {order})` aligned to sorted slice index from 1 |
| Device frames | Always `1` |
| Title | Verbatim `title` |
| Subtitle | Verbatim `subtitle` |
| Description | Verbatim `description` |
| Summary for designer | Why this slot matters; key message to land; relationship to carousel arc—**no visual specs** |
| Continuity / handoff | Plain-language narrative link to **next** row’s story (last row: finale / CTA or “carousel end”) |

Escape `|` characters inside Markdown cells.

## Output

- **Write** `R/output/screenshot_report.md` (**overwrite** unless the user asks to preserve a prior run). UTF-8.  
- Follow the structure in [report-template.md](report-template.md) from **`# Designer report`** downward (filled placeholders—**not** template `{{TOKENS}}`, not the illustrative “Panel 1” example row literal).  

### Final chat reply (non-negotiable)

Read **`# Agent contract`** at the top of [report-template.md](report-template.md). Your **same final turn** (after the file is written) must include the **full** report markdown in the message—**verbatim** substance as `screenshot_report.md`, including **every** table **row** and **full** cell text (no “…” shortcuts), the full **Overview** prose, Theme block, Out of scope paragraph, and all panels tables. Allow **before** full body: optional one-off line (“Full report follows.”). Allow **after** full body only: absolute path plus the user-edit / re-run caveat from **§ After the report**. **Forbidden:** issuing only a summary, teaser, clipped table, truncated quotes, “see attached file instead of pasting”, or collapsing rows into bullets.

## After the report (user edits)

- The user **may edit** `output/screenshot_report.md` after you write it (tweaks to overview, table summaries, continuity notes, etc.). That is normal; the report is a **working document** for the designer handoff.  
- **`output/appstore.json` / `output/playstore.json`** remain the source of truth for **verbatim** screenshot copy and **theme** hex values. If the user changes only the markdown, those strings in the report may **drift** from JSON until they edit JSON or re-run.  
- Another run of this skill (or **planning-agent**) **regenerates** the report from JSON and **overwrites** `screenshot_report.md` by default—manual markdown edits are **lost** unless the user saved a copy elsewhere or explicitly asks you **not** to overwrite (then follow their instruction).  
- After the **full** report pasted in chat (§ Output — Final chat reply), append the path + edit/re-run caveat; do **not** replace the paste with summary-only wording.

## Do not edit

- Do **not** modify repo-root `CLAUDE.md`.  
- Do **not** change `output/appstore.json` / `output/playstore.json` unless the user explicitly asks (this skill).

## Done when

`output/screenshot_report.md` exists and matches **`# Designer report`** in [report-template.md](report-template.md), including **`## Theme (from store JSON)`**, full Overview, verbatim Out of scope paragraph, and each store’s panel table with **`screenshots.length`** rows and **`Device frames` = 1** per row. **And** your final assistant message includes that **same** complete report markdown in full (per **§ Output — Final chat reply**)—not an abridgement.
