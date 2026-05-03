# Mobile publisher — orchestration workflow

Canonical step order and triggers for the orchestrator in [`CLAUDE.md`](../../CLAUDE.md). Sub-agent prompts live under [`.claude/agents/`](../agents/).

---

## Metadata (store JSON)

### Step 1 — Load config

Read `config.json` from the publisher working directory.

```json
{
  "ios_project_path": "",
  "android_project_path": ""
}
```

- If **at least one path** is populated, proceed to Step 2. Only generate outputs for platforms with a path (`output/appstore.json` for iOS, `output/playstore.json` for Android).
- If **both paths are empty**, stop and ask for at least one project path.
- If `config.json` does not exist, ask for paths and offer to create the file.

### Step 2 — Delegate to app_optimizer

Call **app_optimizer** with resolved project paths. It analyzes the project and writes `output/appstore.json` / `output/playstore.json`. Ensure `output/` exists (same level as `config.json`).

### Step 3 — Report back

Summarize generated metadata and flag fields needing manual attention (e.g. missing privacy URL, support email).

### Step 4 — Offer screenshot design

Ask:

> Would you also like to generate screenshot designs? I will capture **device and store requirements**, then a **creative plan** (background + each panel). After you approve the plan, I will start the **Web UI** and run **background** and **panel** execution automatically from that plan.

- If **yes**: continue with Steps 5–9.
- If **no**: end the screenshot path.

---

## Screenshots (multi-agent)

**Handoff file:** [`datasource/temp/design_brief.json`](../../datasource/temp/design_brief.json) — schema in [`.claude/skills/screenshot-docs/references/screenshot_design_brief.md`](../skills/screenshot-docs/references/screenshot_design_brief.md).

### Step 5 — screenshot_requirements

Delegate **screenshot_requirements**. Uses **`python toolkit/scripts/layout.py`** only (no Web UI). Writes / merges **`requirements`** in the brief.

**Do not** run **toolkit_runner** or **screenshot_planning** before this step completes successfully.

### Step 6 — screenshot_planning

Delegate **screenshot_planning** after **`requirements`** is complete. Iterates with the user until **`creative_plan.user_approved`** is **true** in the brief. No **`designer.py`** and no Web UI in this phase.

**Do not** run **toolkit_runner** until **`creative_plan.user_approved`** is **true**.

### Step 7 — toolkit_runner

Delegate **toolkit_runner** so **`toolkit`** + **`web_ui`** are ready on port **4713**. Relay the preview URL (e.g. `http://localhost:4713`).

**Rule:** **toolkit_runner** runs **after** **screenshot_planning** and **before** **screenshot_background** / **screenshot_panel**.

### Step 8 — screenshot_background

Delegate **screenshot_background** with the same Web UI instance **toolkit_runner** verified. Executes **`creative_plan`** for the strip background (**full auto** after plan lock: no conversational proceed gates; user only on errors). Writes previews under **`datasource/temp/`** when saving. Updates **`background`** in the brief.

### Step 9 — screenshot_panel

Delegate **screenshot_panel**. Executes **`creative_plan`** per panel in order (**full auto**; user only on errors). Updates **`panel`** in the brief. User may **redo a panel** in a **later** orchestrator turn if needed.

---

## Trigger rules

- **Generate store metadata** (or similar): start at Step 1.
- **Design screenshots** only (no metadata request): start at Step 4, then **5 → 6 → 7 → 8 → 9**. Store JSON must exist under **`output/`**; if not, ask the user to run the metadata path first.
- **Both** metadata and screenshots: run Steps 1–4 without pausing at Step 4’s question if the user already asked for both; then **5 → 6 → 7 → 8 → 9**.
- **Hard ordering:** **screenshot_requirements** → **screenshot_planning** → **toolkit_runner** → **screenshot_background** → **screenshot_panel** for every screenshot flow that uses the designer / Web UI.
