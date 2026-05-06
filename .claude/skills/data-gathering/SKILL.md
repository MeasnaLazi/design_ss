---
name: data-gathering
disable-model-invocation: true
description: >-
  Gathers App Store / Play Store listing metadata and theme colors. Reads
  config.json at the apps_publisher repo root for ios_project_path /
  android_project_path, then
  scans those projects or prompts the user. Produces output/appstore.json
  and/or output/playstore.json plus screenshot copy (orders 1–5) and a full
  in-chat checklist (markdown ## 0–4 and tables) for user review and edits. Use
  when the user invokes data-gathering-agent, names this
  skill, or asks to generate or refresh store JSON.
---

# Data gathering (store JSON)

## When this applies

Use **whenever** you are acting as **data-gathering-agent** or the user asks you to load this skill. It governs how listing data is collected, how screenshot marketing copy is written, and where files are written.

## Required reading

1. **JSON shapes and category constants** — read [reference-schemas.md](reference-schemas.md) before writing `appstore.json` or `playstore.json`. Use those templates verbatim for structure and field names.
2. **Report layout** — follow the table structure in [checklist.md](checklist.md) when you **report back to the user in your message** (markdown tables).

## Workflow

### 0. Config bootstrap (always first)

Do this **before** scanning app trees or writing `output/*.json`.

1. Let **`R`** = the **apps_publisher** repository root (this workspace).
2. Read **`R/config.json`** only (repo-root `config.json`). If the file is missing or not valid JSON, stop and tell the user to add a valid `config.json` at the repo root; do not scan for alternate locations.
3. From that object, read **`ios_project_path`** and **`android_project_path`** (strings). Trim whitespace. Treat as **unset** if the key is missing, `null`, or `""` after trim.

**Resolve paths:** For each **set** value, resolve it relative to **`R`** (the repo root). Example: `ios_project_path` `"../Bio"` → `R/../Bio` (canonical absolute path preferred in the checklist).

**Branch:**

| After reading config | What to do |
| --- | --- |
| **At least one** of `ios_project_path` / `android_project_path` is set | Use those paths for **§2b** for each set platform. **Do not** ask the user for paths unless a resolved path is missing, unreadable, or clearly not an iOS/Android project — then ask **once** for a corrected path for that platform only. |
| **Neither** is set | In your **first reply**, ask once for optional iOS and/or Android project paths (one message; user may paste one or two paths). |

**If you asked the user for paths (neither was set in config) and their reply is “nothing”:**

- Treat as **no usable path** if the message is **blank**, whitespace-only, or contains **no** path-like line (no `/`, no `\`, no `.xcodeproj`, no `build.gradle`, no drive letter) **and** the user did **not** write `skip` or `manual`.
- In that case **do not** ask paths again. Go straight to **§2a** and ask the **first** manual question (**App name**), then continue one question at a time.

If the user **did** reply with `skip` or `manual`, go to **§2a** the same way (start with App name).

### 1. Path summary (optional short line)

When paths came from config or the user, you may send one short line stating which roots you will scan (absolute or repo-relative), then proceed to **§2b** for those platforms.

### 2a. No path — manual collection

Use when: no iOS path and no Android path are in use (config unset, user empty/skip/manual, or invalid paths abandoned).

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

### 2b. Path provided — scan and extract

1. Resolve the path; if invalid or not a mobile project, say so and fall back to **2a** or ask for a corrected path (see §0).
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

### 3. Director of sales & marketing — screenshot slots

After core fields are known (from scan or manual path), fill **`screenshots`** for every file you are producing: **exactly five** objects with `order` 1–5.

Rules:

- Voice: confident, benefit-led, store-safe (no unverifiable rankings unless the user provided proof text).
- Respect character limits from [reference-schemas.md](reference-schemas.md) (`title` ≤30, `subtitle` ≤40, `description` ≤80 for each slot).
- Each order should highlight a **different** selling angle (e.g. onboarding, core action, trust, speed, delight).

### 4. Write outputs (publisher repo)

Write under the **apps_publisher** repo root (workspace):

| Condition | File |
| --- | --- |
| iOS / App Store–only or dual platform | `output/appstore.json` |
| Android / Play–only or dual platform | `output/playstore.json` |

- Use **valid JSON** (UTF-8, trailing newline optional but consistent).
- Preserve template key order where practical for diff readability.
- If only one platform applies, still write only the relevant file(s); do not invent the other platform’s `package_name` / `app_identifier`.

### 5. Checklist report (user message only) — **mandatory**

The user needs **every field visible in chat** so they can spot mistakes and ask for changes without opening files first.

**After** writing `output/*.json`, your **same final turn** (or immediately following tool results in that turn) **must** include **all** of the following, in order, copied from [checklist.md](checklist.md):

1. **`## 0. Config and scan roots`** — table filled (config path, raw → resolved paths).
2. **`## 1. Core listing fields`** — markdown table with **five rows** (App name, Subtitle, Description, Primary color, Secondary color). Values must match what you put in the written JSON (`name` / `title`, `subtitle` / `short_description`, `description` / `full_description`, `theme.primary_color`, `theme.secondary_color`). If **both** store files were written and display strings differ, put both in the cell (e.g. `App Store: … | Play: …`) or add a clear sub-line per store. If only one file was written, fill from that file; use `—` only where the field does not exist in that schema.
3. **`## 2. Screenshot marketing copy (orders 1–5)`** — for **each** of `appstore.json` / `playstore.json` you wrote: a **`### appstore.json`** or **`### playstore.json`** subheading, then a **5-row** markdown table (`Order` 1–5, full `title` / `subtitle` / `description` text from JSON). **Do not** collapse this into a bullet like “5 screenshot slots generated.”
4. **`## 3. Output folder confirmation`** — table with written / updated / skipped for each output path.
5. **`## 4. Gaps / follow-ups`** — bullet list (or table) of empty URLs, missing Play `support_email`, wrong category, etc.

**Hard no:** A short “summary only” reply, ASCII box-drawing table, or bullets **instead of** §1 and §2 markdown tables is **non-compliant**. You may add **one** short sentence *after* the tables inviting the user to reply with corrections.

Do **not** write the checklist to `output/` or anywhere on disk unless the user explicitly asks for a saved copy.

Do **not** overwrite [checklist.md](checklist.md) in `.claude/skills/data-gathering/`.

## Quality bar

- JSON must parse with `json.loads` / `JSON.parse`.
- No spaces after commas in `keywords` (App Store).
- Category values must be **exactly** one of the constants in reference-schemas.md for the respective store.
- If a required URL or email is unknown after scan, leave empty and list under **Gaps / follow-ups** in **§4** of your reply.
- **§5 checklist** (headings **## 0** through **## 4** with full tables) is part of the deliverable, not optional commentary.
