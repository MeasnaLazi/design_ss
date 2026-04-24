/** Dev-server endpoints for agent vision / export (see vite-plugin-datasource-api). */
export const AGENT_PREVIEW_ENDPOINT = '/__api/screenshot-designer/agent-preview'
export const AGENT_EXPORT_ENDPOINT = '/__api/screenshot-designer/agent-export'

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

/**
 * Upload the current Fabric canvas as PNG (multiplier for sharper agent vision).
 */
export async function pushLiveCanvasPreview(
  canvas: import('fabric').Canvas,
  multiplier = 2,
): Promise<void> {
  const dataUrl = canvas.toDataURL({
    format: 'png',
    multiplier,
    enableRetinaScaling: true,
  })
  const blob = await (await fetch(dataUrl)).blob()
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
