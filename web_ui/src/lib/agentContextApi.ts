/** Dev-server endpoints for agent vision / export (see vite-plugin-datasource-api). */
export const AGENT_PREVIEW_ENDPOINT = '/__api/screenshot-designer/agent-preview'
export const AGENT_EXPORT_ENDPOINT = '/__api/screenshot-designer/agent-export'

/**
 * Default multiplier when `VITE_AGENT_PREVIEW_MULTIPLIER` is unset or invalid.
 * `1` = faster iteration; `2` = sharper agent vision (more pixels + retina factor).
 */
const FALLBACK_AGENT_PREVIEW_MULTIPLIER = 2

/**
 * Read strip-wide default from Vite env (`web_ui/.env`: `VITE_AGENT_PREVIEW_MULTIPLIER=1|2`).
 */
export function readDefaultAgentPreviewMultiplier(): number {
  const raw = import.meta.env.VITE_AGENT_PREVIEW_MULTIPLIER
  const n = Number(raw)
  if (n === 1 || n === 2) {
    return n
  }
  return FALLBACK_AGENT_PREVIEW_MULTIPLIER
}

/**
 * Per-operation override from `render_panel_preview` args (`preview_multiplier`: 1 | 2).
 * Invalid values yield `undefined` so callers fall back to {@link readDefaultAgentPreviewMultiplier}.
 */
export function parsePreviewMultiplierOverride(override: unknown): number | undefined {
  if (override === undefined || override === null || override === '') {
    return undefined
  }
  const n = Number(override)
  if (Number.isFinite(n) && (n === 1 || n === 2)) {
    return n
  }
  return undefined
}

export function resolveAgentPreviewMultiplier(override: unknown): number {
  return parsePreviewMultiplierOverride(override) ?? readDefaultAgentPreviewMultiplier()
}

/**
 * Upload a PNG (e.g. from {@link HTMLCanvasElement.toBlob}) as the latest agent preview.
 */
export async function pushAgentPreviewBlob(blob: Blob): Promise<{ ok: boolean; bytes?: number }> {
  const res = await fetch(AGENT_PREVIEW_ENDPOINT, {
    method: 'POST',
    body: blob,
    headers: { 'Content-Type': 'application/octet-stream' },
  })
  const j = (await res.json().catch(() => ({}))) as { ok?: boolean; bytes?: number; error?: string }
  if (!res.ok) {
    throw new Error(j.error ?? `agent preview upload failed (${res.status})`)
  }
  return { ok: true, bytes: j.bytes }
}

type FabricCanvas = import('fabric').Canvas

/**
 * Upload the current Fabric canvas as PNG (multiplier for sharper agent vision).
 * Uses `canvas.toBlob` to avoid an extra data-URL string round-trip.
 */
export async function pushLiveCanvasPreview(canvas: FabricCanvas, multiplier: number): Promise<void> {
  const blob = await canvas.toBlob({
    format: 'png',
    multiplier,
    enableRetinaScaling: true,
  })
  if (!blob) {
    throw new Error('canvas.toBlob returned null for agent preview')
  }
  await pushAgentPreviewBlob(blob)
}

/**
 * Upload a cropped region of the current Fabric canvas as PNG.
 */
export async function pushLiveCanvasPreviewRect(
  canvas: FabricCanvas,
  rect: { left: number; top: number; width: number; height: number },
  multiplier: number,
): Promise<void> {
  const blob = await canvas.toBlob({
    format: 'png',
    multiplier,
    enableRetinaScaling: true,
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
  })
  if (!blob) {
    throw new Error('canvas.toBlob returned null for agent preview (rect)')
  }
  await pushAgentPreviewBlob(blob)
}

/** POST latest compact layout summary for agent pull-export (see `buildAgentLayoutSummaryFromCanvas`). */
export async function pushAgentExportJson(payload: unknown): Promise<void> {
  const res = await fetch(AGENT_EXPORT_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string }
  if (!res.ok) {
    throw new Error(j.error ?? `agent export upload failed (${res.status})`)
  }
}

/**
 * GET latest export from dev server. Omit `panelIndex` for full-strip summary; pass `"0"` or `"0,1"`
 * (adjacent columns) for the sliced envelope — same as toolkit `pull-export --panels`.
 */
export async function fetchAgentExportJson(panelIndex?: string): Promise<unknown> {
  const url =
    panelIndex !== undefined && String(panelIndex).trim() !== ''
      ? `${AGENT_EXPORT_ENDPOINT}?${new URLSearchParams({
          panel_index: String(panelIndex).trim(),
        }).toString()}`
      : AGENT_EXPORT_ENDPOINT
  const res = await fetch(url)
  const j = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = j as { error?: string; detail?: string }
    throw new Error(err.error ?? err.detail ?? `agent export GET failed (${res.status})`)
  }
  return j
}
