# Agent contract (planning-agent / planning skill)

When you finish writing `output/screenshot_report.md`, your **final reply** to the user must include the **entire** report as **full markdown**: the same substantive content as the file—**every** title line, metadata line, Theme section (including intro paragraph), **Overview** paragraphs, the verbatim **Out of scope** paragraph from **`# Designer report`**, **each** store `## … — panel detail` section, and **every row** of **every** panel table (`Panel` through `Continuity / handoff`). **Hard no:** replying with only a synopsis, bullets, shortened tables, truncated cells, “key takeaways,” or “see `screenshot_report.md`” **instead of** that full body.

You may prepend a single short line (“Full report follows.”) if needed; **after** the full markdown you may add: absolute path to `output/screenshot_report.md`, and the note that the user may edit that file and that re-running replaces it from JSON unless they opt out.

**Theme block:** After the Theme intro paragraph, if **one** JSON file was processed emit only `- **Primary:** …` / `- **Secondary:** …`. If **both** were processed emit `### App Store` plus two bullets then `### Play Store` plus two bullets. Do **not** paste scaffolding lines like “**One processed file:** …” into the generated report.

**Panel sections:** Emit one `## App Store — panel detail` (and/or `## Play Store — panel detail`) matching which files were read. Do **not** emit the scaffolding sentence “Repeat the following block…” in the generated report—that line is guidance for you only.

---

# Designer report (fill placeholders; output goes in file + chat — no scaffolding above)

# Screenshot design brief — {{APP_LABEL}}

**Source:** {{SOURCE_FILES}}  
**Generated:** {{DATE_LINE}}

## Theme (from store JSON)

Primary and secondary below are copied from the **same** store JSON file as the screenshot panels in this brief (`output/appstore.json` and/or `output/playstore.json`)—never mixed across files. If a value is missing or empty in JSON, write `—`.

## Overview (for the designer)

{{OVERVIEW_PARAGRAPHS}}

**Out of scope for this brief:** Fonts, typography sizes, broader palettes or gradients beyond primary/secondary above, device models, frame chrome, backgrounds beyond what those colors imply, shadows, padding, alignment, safe zones, pixel dimensions, animation, localization layout—those are designer decisions unless the client provides separate art direction.

## {{STORE_HEADING}} — panel detail

| Panel | Device frames | Title | Subtitle | Description | Summary for designer | Continuity / handoff |
| --- | ---:| --- | --- | --- | --- | --- |
| Panel 1 (order 1) | 1 | … | … | … | … | … |
