---
name: screenshot-brief
disable-model-invocation: true
description: >-
  Input-prep phase for apps_publisher store screenshots. Given a platform
  (ios | android), gathers App Store / Play Store listing metadata + theme,
  picks the device pack, writes output/appstore.json or output/playstore.json,
  then turns it into the designer brief output/screenshot_report.md. Runs in two
  phases — Gather (store JSON) then Plan (creative brief) — each with an in-chat
  review checkpoint. Use when acting as screenshot-agent or when the user names
  this skill.
---

# Screenshot brief (gather -> plan)

This skill produces everything the design phase needs, in two phases:
**Phase 1 gathers the store JSON**, **Phase 2 turns it into the creative brief**.
Present the in-chat checklist after Phase 1 and the full report after Phase 2,
then hand the brief to the design phase (`screenshot-design`).

## Platform (from the entry agent)

The entry agent passes **`--platform ios|android`**. It fixes the store and
constrains the device-frame choice:

| `--platform` | Store file | `device_frame_type` choices |
| --- | --- | --- |
| `ios` | `output/appstore.json` | `iphone` or `ipad` |
| `android` | `output/playstore.json` | `phone` or `tablet` |

In Phase 1 you still confirm the exact `device_frame_type` with the user, but
only from the pair allowed by `--platform` (do not offer the other store's
values). Everything else in the two phases below is unchanged.

## Phase 1 — Gather (store JSON)

### When this applies

Use **whenever** you are acting as **screenshot-agent** or the user asks you to load this skill. It governs how listing data is collected, how screenshot marketing copy is written, and where files are written.

### Required reading

1. **JSON shapes and category constants** — read [reference-schemas.md](reference-schemas.md) before writing `appstore.json` or `playstore.json`. Use those templates verbatim for structure and field names.
2. **Report layout** — follow the table structure in [checklist.md](checklist.md) when you **report back to the user in your message** (markdown tables).

### Workflow

#### 0. Locate the app project (automatic — no path input)

Do this **before** scanning or writing `output/*.json`. **Never ask the user for a project path.**

1. Let **`R`** = the **apps_publisher** repository root (this workspace).
2. **The app project is the parent folder of `R`** (`R/..`). apps_publisher is expected to live **inside the root folder of your Android/iOS project**, so its parent directory *is* that project.
3. *(Optional override, non-standard layouts only)* If **`R/config.json`** exists and sets a non-empty **`ios_project_path`** / **`android_project_path`**, resolve it relative to **`R`** and use that instead for the matching platform. The default remains the parent folder.
4. Scan the resolved app-project path for markers matching **`--platform`**:
   - **iOS:** `*.xcodeproj`, `*.xcworkspace`, or an Xcode project with `Info.plist`.
   - **Android:** `app/build.gradle` / `app/build.gradle.kts` (or equivalent module) with `applicationId`.
5. **If a matching project is found** → use it for **§2b** (scan and extract).
6. **If no matching project is found** (the parent folder has no iOS/Android markers and there is no valid override) → **do not ask for a path**. Tell the user plainly: *apps_publisher should sit in the root folder of your Android/iOS project; I couldn't detect one at `<resolved parent path>`.* Then continue with **§2a** (manual collection) so the run is not blocked.

#### 0b. Layout platform and device pack (once per run)

Do this **after** §0 (app project located), **before** §2b scan or §2a manual questions.

1. Confirm the exact **`device_frame_type`** with the user — only the pair allowed by **`--platform`** (`ios` → `iphone`/`ipad`; `android` → `phone`/`tablet`).
2. From the publisher repo root, run **`node .claude/skills/screenshot-brief/script/device-packs.mjs --type <choice>`**. Present the rows to the user and have them choose **one** pack.
3. Record **`device_frame_type`** = that choice (lowercase). Record **`device_pack_path`** = **`composer/device-frames/<id>/frame.json`** using the **`id`** from the CLI output for the chosen row.
4. When writing **`output/appstore.json`** and/or **`output/playstore.json`**, include both keys on **each** file written (same values if both files are produced).

#### 1. Path summary (optional short line)

You may send one short line stating the app-project path you will scan (absolute or repo-relative), then proceed to **§2b**.

#### 2a. No path — manual collection

Use when: **§0** found no app project (the parent folder has no iOS/Android markers), or the user asks to enter details manually.

Ask **one question at a time**, in this order (do not batch):

1. App name  
2. Subtitle  
3. Description  
4. Primary color (hex, e.g. `#1A2B3C`)  
5. Secondary color (hex)

Map answers into **both** store files where the field exists:

| User answer | `appstore.json` | `playstore.json` |
| --- | --- | --- |
| App name | `name` | `title` |
| Subtitle | `subtitle` | use for `short_description` (trim to 80 chars if needed) |
| Description | `description` | `full_description` |
| Primary / secondary | `theme.primary_color`, `theme.secondary_color` | same |

Leave all other keys as empty strings, empty arrays, or empty objects per the template until you infer or generate them later in this workflow. Set `theme.style` to `"light"` unless the user specifies otherwise.

#### 2b. Path provided — scan and extract

1. Resolve the app-project path; if it is not a mobile project, say so and fall back to **2a**.
2. **Detect platforms**
   - **iOS** if you find `*.xcodeproj`, `*.xcworkspace`, or an Xcode project with `Info.plist`.
   - **Android** if you find `app/build.gradle` or `app/build.gradle.kts` (or equivalent module) with `applicationId`.
   - **Both** (e.g. Flutter, RN): populate **both** JSON files from the same scan where possible.
3. **Extract** (read files; do not guess secrets):
   - **Bundle / package**: `PRODUCT_BUNDLE_IDENTIFIER` (iOS), `applicationId` / `namespace` (Android).
   - **Version**: `CFBundleShortVersionString` / `versionName` (and `CFBundleVersion` / `versionCode` if useful for your notes; template uses marketing version fields).
   - **Name / title**: `CFBundleDisplayName` or `CFBundleName`; Android `strings.xml` `app_name`.
   - **Descriptions**: localized `InfoPlist.strings`, App Store–style `*.txt` if present, Fastlane metadata folders, or Play `full_description` / listing files if present.
   - **Colors**: `Assets.xcassets` accent colors, `colors.xml`, Material theme, or app icon dominant colors — only when clearly defined; otherwise leave theme hex fields empty and note in checklist.
4. Record in the checklist **which file path** each extracted value came from.

#### 3. Director of sales & marketing — screenshot slots

After core fields are known (from scan or manual path), fill **`screenshots`** for every file you are producing: **exactly five** objects with `order` 1–5.

Rules:

- Voice: confident, benefit-led, store-safe (no unverifiable rankings unless the user provided proof text).
- Respect character limits from [reference-schemas.md](reference-schemas.md) (`title` ≤30, `subtitle` ≤40, `description` ≤80 for each slot).
- Each order should highlight a **different** selling angle (e.g. onboarding, core action, trust, speed, delight).

#### 3b. Real app screenshots (for the designer)

The **the design phase** needs **real app captures** in
**`datasource/screenshots/<preset>/`** (preset = e.g. `appstore_iphone_portrait`) —
one per slot ideally, matching the five angles from **§3**.

1. Check what already exists there (view the PNGs — many may be placeholders).
2. If a chosen slot has **no** matching real capture, ask the user once to drop
   captures into that folder (list which slots are uncovered). Do not block on
   it — record the gap.
3. In your **§5 checklist**, add a `## 2b. Screenshot coverage` table: `Order |
   Slot claim | Matching capture (filename or —)`.

#### 4. Write outputs (publisher repo)

Write under the **apps_publisher** repo root (workspace):

| Condition | File |
| --- | --- |
| iOS / App Store–only or dual platform | `output/appstore.json` |
| Android / Play–only or dual platform | `output/playstore.json` |

- Use **valid JSON** (UTF-8, trailing newline optional but consistent).
- Preserve template key order where practical for diff readability.
- If only one platform applies, still write only the relevant file(s); do not invent the other platform’s `package_name` / `app_identifier`.

#### 5. Checklist report (user message only) — **mandatory**

The user needs **every field visible in chat** so they can spot mistakes and ask for changes without opening files first.

**After** writing `output/*.json`, your **same final turn** (or immediately following tool results in that turn) **must** include **all** of the following, in order, copied from [checklist.md](checklist.md):

1. **`## 0. App project and device pack`** — table filled (detected app-project path or override, platform markers found).
2. **`## 1. Core listing fields`** — markdown table with **five rows** (App name, Subtitle, Description, Primary color, Secondary color). Values must match what you put in the written JSON (`name` / `title`, `subtitle` / `short_description`, `description` / `full_description`, `theme.primary_color`, `theme.secondary_color`). If **both** store files were written and display strings differ, put both in the cell (e.g. `App Store: … | Play: …`) or add a clear sub-line per store. If only one file was written, fill from that file; use `—` only where the field does not exist in that schema.
3. **`## 2. Screenshot marketing copy (orders 1–5)`** — for **each** of `appstore.json` / `playstore.json` you wrote: a **`### appstore.json`** or **`### playstore.json`** subheading, then a **5-row** markdown table (`Order` 1–5, full `title` / `subtitle` / `description` text from JSON). **Do not** collapse this into a bullet like “5 screenshot slots generated.”
4. **`## 3. Output folder confirmation`** — table with written / updated / skipped for each output path.
5. **`## 4. Gaps / follow-ups`** — bullet list (or table) of empty URLs, missing Play `support_email`, wrong category, etc.

**Hard no:** A short “summary only” reply, ASCII box-drawing table, or bullets **instead of** §1 and §2 markdown tables is **non-compliant**. You may add **one** short sentence *after* the tables inviting the user to reply with corrections.

Do **not** write the checklist to `output/` or anywhere on disk unless the user explicitly asks for a saved copy.

Do **not** overwrite [checklist.md](checklist.md) in `.claude/skills/screenshot-brief/`.

### Quality bar

- JSON must parse with `json.loads` / `JSON.parse`.
- No spaces after commas in `keywords` (App Store).
- Category values must be **exactly** one of the constants in reference-schemas.md for the respective store.
- If a required URL or email is unknown after scan, leave empty and list under **Gaps / follow-ups** in **§4** of your reply.
- **§5 checklist** (headings **## 0** through **## 4** with full tables) is part of the deliverable, not optional commentary.


## Phase 2 — Plan (creative brief)

### When this applies

Use **whenever** you act as **screenshot-agent** or the user asks you to load this skill. You turn each chosen store JSON file’s **`screenshots`** and its **`theme`** (`primary_color`, `secondary_color`) into **`output/screenshot_report.md`** for a designer: what to communicate per panel and how the story connects. **Screenshot copy and colors always come from the same file:** `appstore.json`’s theme pairs with App Store screenshots; `playstore.json`’s theme pairs with Play screenshots—do not mix themes across files. Layout and visuals stay unspecified except copying those two hex values from **that** file.

### Repo root

Let **`R`** = the **apps_publisher** repository root (this workspace).

### Forbidden (art direction)

Do **not** prescribe or imply:

- Fonts, typography scale, weights, letter spacing  
- Colors **beyond** copying **`theme.primary_color`** and **`theme.secondary_color`** from **the same** `appstore.json` or **`playstore.json`** you took **`screenshots`** from (no cross-file merging, no invented palette rules, gradients, or “use navy for headings”)  
- Device model, bezel, notch, tablet vs phone choices  
- Frame size, crop, rotation, shadows, mocks  
- Backgrounds, illustrations, ornamentation  
- Text or device **position**, alignment, grids, margins, safe-area pixels  

You **may** reference **in-app conceptual content** suggested by title/subtitle/description (e.g. “timeline UI,” “quick note”) as **storytelling**, not layout.

Include **`theme.primary_color`** and **`theme.secondary_color`** in the report (see **Theme** below), sourced only from whichever store JSON processed that panel table. Present them as **store listing brand reference**—copy hex strings verbatim; do not extrapolate into layout or mockup prescriptions.

### Input files

| Path | Condition |
| --- | --- |
| `R/output/appstore.json` | Read when the user specifies App Store / `appstore`, or when processing **both**, or when it exists and Play is unspecified (see defaults below). From this file you read **`screenshots`** **and** **`theme.primary_color`** / **`theme.secondary_color`** together. |
| `R/output/playstore.json` | Read when the user specifies Play Store / `playstore`, or when processing **both**. Same: **`screenshots`** and **`theme`** for Play come **only** from this file. |

#### Which file(s) to read

1. If the **user names** one store or one filename → read **only** that file (must exist; if missing, report and stop).  
2. If **both** `output/appstore.json` and `output/playstore.json` exist and the user gave **no** preference → process **both** in one report (two `## … — panel detail` sections).  
3. If **only one** exists → process **that one** only.  
4. If **neither** exists → stop and tell the user to generate JSON first (e.g. screenshot-agent).

### Parse and validate

1. Parse JSON from each chosen file; on failure, stop and report.  
2. From **that same file**, read **`screenshots`**: array of `{ order, title, subtitle, description }`. Read **`theme`** if present (`primary_color`, `secondary_color`). Read **`device_frame_type`** and **`device_pack_path`** when present. Never take `theme`, device fields, or `screenshots` from one store file while using another file’s panels.
3. Require **non-empty** `screenshots`.  
4. Sort by **`order`** ascending before generating rows.  
5. **Strict panel / device rule:** **`screenshots.length`** = total **panels** = total **planned device frames** in the carousel. Exactly **one** table row **per** array element; **`Device frames`** column is always **`1`** per row—no invented multi-device panels.

### Device frame pack (required)

For **each** processed store JSON file, load frame paths with the layout CLI—**do not** read `composer/device-frames/` by hand or guess **`framePath`** values.

1. Read **`device_pack_path`** (and **`device_frame_type`** for the report **Source** line) from **that** file.
2. **Extract `pack_id`** from **`device_pack_path`**: the directory name immediately after the `device-frames` segment.
   - Example: `composer/device-frames/iphone_12_pro/frame.json` → **`pack_id`** = `iphone_12_pro`
   - Example: `/device-frames/iphone_12_pro/frame.json` → **`pack_id`** = `iphone_12_pro`
   - If the path has no `device-frames` segment or **`pack_id`** would be empty, skip **`load-frame`** and use `—` in the table; note the gap.
3. From the publisher repo root **`R`**, run:

   `node .claude/skills/screenshot-brief/script/load-frame.mjs --pack <pack_id>`

   Optional **`--repo-root R`** if needed.
4. On **success** (command exits 0), parse the JSON: `{ "pack": "…", "frames": [ { "framePath": "…", … }, … ] }`. For each panel row (sorted by screenshot **`order`**), set **Device frame pack** to the **`framePath`** of the frame at the same **1-based index** in **`frames`** (order 1 → `frames[0].framePath`, order 2 → `frames[1].framePath`, …). Copy **`framePath`** verbatim from the CLI output (e.g. `/device-frames/iphone_12_pro/frame/front.svg`).
5. If a panel has no matching frame entry (fewer **`frames`** than panels), use `—` for that row and note under **Gaps / follow-ups**.
6. On **failure** (missing/empty **`device_pack_path`**, bad path shape, or **`load-frame`** error), use `—` in the table and note under **Gaps / follow-ups** in **Overview** (invalid or stale pack). Do **not** fabricate frame paths.

Run **`load-frame` once per processed store file** (each file’s own **`device_pack_path`** → **`pack_id`**). When both App Store and Play JSON are processed, validate each separately.

### Theme (report section)

Put **`## Theme (from store JSON)`** **after** the title/metadata lines (`Source`, **`Device frame type`**, `Generated`) and **before** **`## Overview (for the designer)`**, matching [report-template.md](report-template.md) (intro line about same-source colors, then bullets or **`###`** sub-blocks).

**Metadata — device frame type:** Immediately under **`**Source:** …`**, emit **`**Device frame type:** …`** with **`device_frame_type`** copied verbatim from **that** processed JSON file (`iphone`, `ipad`, `phone`, `tablet`, or `—` if missing/empty). When **both** store files are processed in one report, emit **one** brief block per store (e.g. under Source list both files, then two lines: `**Device frame type (App Store):** …` and `**Device frame type (Play Store):** …`)—each value from its own JSON only.

- **Single processed file:** Theme intro paragraph + **`Primary`** / **`Secondary`** bullets only (verbatim from `theme`, or `—` if missing/empty).  
- **Both files:** Theme intro paragraph + **`### App Store`** and **`### Play Store`**, each with Primary / Secondary from **that** JSON only.  
- Do **not** add `background_color`, `text_color`, or `accent_color` unless the user asks in chat; **this skill requires only primary and secondary.**

### Overview content

Under **`## Overview (for the designer)`**, include:

1. The numeric fact: **`N` panels** / **`N` device frames** where **`N` = screenshots.length**, and that each corresponds to **one store listing screenshot** / one JSON slot.  
2. **Marketing arc** in prose: overall story the carousel tells, using app name/subtitle/App Store `name` / Play Store `title` plus all screenshot copy as source material—not fabricating unrelated features.  
3. The **Out of scope** paragraph from [report-template.md](report-template.md) (same intent; small wording tweaks OK). Do **not** contradict the Theme section (primary/secondary are **in scope** there).

### Panel table

For **each** processed file, emit **`## {App Store | Play Store} — panel detail`** then **one markdown table**.

**Columns (fixed header):**

| Column | Rule |
| --- | --- |
| Panel | `Panel {i} (order {order})` aligned to sorted slice index from 1 |
| Device frames | Always `1` |
| Device frame pack | **`framePath`** from **`.claude/skills/screenshot-brief/script/load-frame.mjs --pack <pack_id>`** for that row’s screenshot **`order`** (`pack_id` parsed from **`device_pack_path`**; `frames[order − 1].framePath`); `—` if missing, load fails, or no frame at that index |
| Title | Verbatim `title` |
| Subtitle | Verbatim `subtitle` |
| Description | Verbatim `description` |
| Summary for designer | Why this slot matters; key message to land; relationship to carousel arc—**no visual specs** |
| Continuity / handoff | Plain-language narrative link to **next** row’s story (last row: finale / CTA or “carousel end”) |

Escape `|` characters inside Markdown cells.

### Output

- **Write** `R/output/screenshot_report.md` (**overwrite** unless the user asks to preserve a prior run). UTF-8.  
- Follow the structure in [report-template.md](report-template.md) from **`# Designer report`** downward (filled placeholders—**not** template `{{TOKENS}}`, not the illustrative “Panel 1” example row literal).  

#### Final chat reply (non-negotiable)

Read **`# Agent contract`** at the top of [report-template.md](report-template.md). Your **same final turn** (after the file is written) must include the **full** report markdown in the message—**verbatim** substance as `screenshot_report.md`, including **every** table **row** and **full** cell text (no “…” shortcuts), the full **Overview** prose, Theme block, Out of scope paragraph, and all panels tables. Allow **before** full body: optional one-off line (“Full report follows.”). Allow **after** full body only: absolute path plus the user-edit / re-run caveat from **§ After the report**. **Forbidden:** issuing only a summary, teaser, clipped table, truncated quotes, “see attached file instead of pasting”, or collapsing rows into bullets.

### After the report (user edits)

- The user **may edit** `output/screenshot_report.md` after you write it (tweaks to overview, table summaries, continuity notes, etc.). That is normal; the report is a **working document** for the designer handoff.  
- **`output/appstore.json` / `output/playstore.json`** remain the source of truth for **verbatim** screenshot copy and **theme** hex values. If the user changes only the markdown, those strings in the report may **drift** from JSON until they edit JSON or re-run.  
- Another run of this skill (or **screenshot-agent**) **regenerates** the report from JSON and **overwrites** `screenshot_report.md` by default—manual markdown edits are **lost** unless the user saved a copy elsewhere or explicitly asks you **not** to overwrite (then follow their instruction).  
- After the **full** report pasted in chat (§ Output — Final chat reply), append the path + edit/re-run caveat; do **not** replace the paste with summary-only wording.

### Do not edit

- Do **not** modify repo-root `CLAUDE.md`.  
- Do **not** change `output/appstore.json` / `output/playstore.json` unless the user explicitly asks (this skill).

### Done when

`output/screenshot_report.md` exists and matches **`# Designer report`** in [report-template.md](report-template.md), including **`Device frame type`** under **Source**, **`## Theme (from store JSON)`**, full Overview, verbatim Out of scope paragraph, and each store’s panel table with **`screenshots.length`** rows, **`Device frames` = 1** per row, and **Device frame pack** (`framePath` from **`load-frame`**) on every row. **And** your final assistant message includes that **same** complete report markdown in full (per **§ Output — Final chat reply**)—not an abridgement.

