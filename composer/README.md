# composer/

HTML/CSS strip composer — Phase 1 of `docs/implementation-plan.md`.

Strips are authored as plain HTML (contract: [`strip-schema.md`](strip-schema.md)),
rendered to export-size PNGs by headless Chromium.

| File | Role |
| --- | --- |
| `render.mjs` | CLI: strip HTML → per-panel PNGs + `strip-data.json` (measured geometry + `problems`) (`--strip`, `--out`, `--full`). Serves the repo root locally so pages can use `/composer/**` and `/datasource/**`. |
| `check-schema.mjs` | Structural conformance against `strip-schema.md`, from the source text alone — no browser. `--all`, `--skeleton`, or a file. |
| `import-to-canvas.mjs` | CLI: replay a strip into the live Fabric canvas as native, editable layers via agent ops (text/device native + real screenshots; backgrounds/decor rasterized to image layers). Requires dev server + open designer tab. `--strip`, `--preset`, `--api`, `--end-mode`. Sets mode `agent` during import, `human` after. |
| `device-frames.mjs` | Browser runtime: builds `[data-device]` blocks — matrix3d homography warp from `frame.json` `corners`, clip via the pose SVG's `#screen` path, frame artwork on top. |
| `homography.mjs` | Shared math (Node + browser). Port-parity with `web_ui/src/canvas/applyScreenshotToDevice.ts`. |
| `strip-schema.md` | Layer contract for strip documents (keeps HTML importable to display JSON later). |
| `test/homography.test.mjs` | `node composer/test/homography.test.mjs` — corner round-trip < 1e-6 px for every pose of every pack. |
| `test/pose-test.html` | All 8 iphone_12_pro poses with a real screenshot — visual fit acceptance. |
| `test/bio-strip.html` | Hand-written 5-panel Bio strip (1290×2796) — pipeline acceptance. |

## Setup

```bash
cd composer
npm install
npx playwright install chromium
```

## Render

```bash
# from repo root
node composer/render.mjs --strip composer/test/pose-test.html --out output/temp/pose-test
node composer/render.mjs --strip composer/test/bio-strip.html --out output/strips/bio-test --full
```

Output: `panel<N>.png` per `[data-panel]` element (+ `strip.png` with `--full`),
JSON summary on stdout, exit non-zero on page errors.
