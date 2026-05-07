/**
 * Slice a browser-pushed AgentLayoutSummaryV1 into per-panel summaries.
 * Mirrors `toolkit/scripts/designer/export_slice.py` (`slice_agent_layout_summary_v1`).
 */

export type UnknownRecord = Record<string, unknown>

function rectsOverlap(
  ax: number,
  ay: number,
  aw: number,
  ah: number,
  bx: number,
  by: number,
  bw: number,
  bh: number,
): boolean {
  return !(ax + aw <= bx || bx + bw <= ax || ay + ah <= by || by + bh <= ay)
}

export function stripPanelWidth(stripWidth: number, screens: number, gap: number): number {
  if (screens < 1) throw new Error('screens must be >= 1')
  return (stripWidth - gap * (screens - 1)) / screens
}

export function panelRect(
  index: number,
  gap: number,
  panelW: number,
  panelH: number,
): { left: number; top: number; width: number; height: number } {
  const left = index * (panelW + gap)
  return { left, top: 0, width: panelW, height: panelH }
}

function dedupePreserveOrder(values: number[]): number[] {
  const seen = new Set<number>()
  const out: number[] = []
  for (const v of values) {
    if (seen.has(v)) continue
    seen.add(v)
    out.push(v)
  }
  return out
}

/** Require one contiguous ascending segment after sort+dedupe (e.g. [0,1], [3,4]). */
export function sortedContiguousPanelIndexes(indexes: number[]): number[] {
  if (!indexes.length) throw new Error('panels list is empty')
  const uniq = dedupePreserveOrder([...indexes]).sort((a, b) => a - b)
  for (let i = 0; i < uniq.length; i++) {
    if (uniq[i] !== uniq[0]! + i) {
      throw new Error(
        `panel indexes must be adjacent columns on the strip; after sorting: ${JSON.stringify(uniq)}`,
      )
    }
  }
  return uniq
}

export function parsePanelIndexesArg(raw: string): number[] {
  const s = raw.trim()
  if (!s) throw new Error('panels list is empty')
  const parts = s.split(',').map((p) => p.trim())
  const out: number[] = []
  for (const p of parts) {
    if (!p) throw new Error('panels list has an empty segment')
    if (!/^-?\d+$/.test(p)) throw new Error(`invalid panel index token: ${JSON.stringify(p)}`)
    out.push(Number(p))
  }
  return out
}

/**
 * Same envelope as Python `slice_agent_layout_summary_v1` / `pull-export --panels`.
 */
export function sliceAgentLayoutSummaryV1(
  full: UnknownRecord,
  panelIndexes: number[],
): UnknownRecord {
  if (full.error) {
    return { ...full }
  }

  const ver = full.layoutSummaryVersion
  if (ver !== 1) {
    throw new Error(`layoutSummaryVersion must be 1 to slice, got ${String(ver)}`)
  }

  const canvas = full.canvas
  const layout = full.layout
  const layers = full.layers
  if (
    typeof canvas !== 'object' ||
    canvas === null ||
    typeof layout !== 'object' ||
    layout === null ||
    !Array.isArray(layers)
  ) {
    throw new Error('export JSON missing canvas, layout, or layers')
  }

  const c = canvas as UnknownRecord
  const stripW = c.width
  const stripH = c.height
  const L = layout as UnknownRecord
  const screens = L.screens
  const gap = L.gap
  const preset = L.artboardPresetId

  if (typeof stripW !== 'number' || typeof stripH !== 'number') {
    throw new Error('canvas.width / canvas.height must be numbers')
  }
  if (typeof screens !== 'number' || screens < 1 || !Number.isInteger(screens)) {
    throw new Error('layout.screens must be an integer >= 1')
  }
  if (typeof gap !== 'number' || gap < 0) {
    throw new Error('layout.gap must be a non-negative number')
  }
  if (typeof preset !== 'string') {
    throw new Error('layout.artboardPresetId must be a string')
  }

  const panelW = stripPanelWidth(stripW, screens, gap)
  const panelH = stripH
  if (panelW <= 0 || panelH <= 0) {
    throw new Error('derived panel width/height must be positive')
  }

  let savedAt = full.savedAt
  if (typeof savedAt !== 'string') savedAt = ''

  const background = full.background
  const requested = sortedContiguousPanelIndexes([...panelIndexes])
  const panelsOut: UnknownRecord[] = []

  for (const pi of requested) {
    if (pi < 0 || pi >= screens) {
      throw new Error(`panel_index ${pi} out of range for layout.screens=${screens}`)
    }

    const { left: pl, top: pt, width: pw, height: ph } = panelRect(pi, gap, panelW, panelH)
    const plI = Math.round(pl)
    const ptI = Math.round(pt)
    const pwI = Math.max(1, Math.round(pw))
    const phI = Math.max(1, Math.round(ph))

    const slicedLayers: UnknownRecord[] = []
    for (const layer of layers) {
      if (typeof layer !== 'object' || layer === null) continue
      const o = layer as UnknownRecord
      const lx = o.left
      const ly = o.top
      const lw = o.width
      const lh = o.height
      if (
        typeof lx !== 'number' ||
        typeof ly !== 'number' ||
        typeof lw !== 'number' ||
        typeof lh !== 'number'
      ) {
        continue
      }
      if (!rectsOverlap(lx, ly, lw, lh, pl, pt, pw, ph)) continue
      const layerCopy: UnknownRecord = { ...o }
      layerCopy.left = lx - pl
      layerCopy.top = ly - pt
      slicedLayers.push(layerCopy)
    }

    const summary: UnknownRecord = {
      layoutSummaryVersion: 1,
      savedAt,
      canvas: { width: pwI, height: phI },
      layout: {
        artboardPresetId: preset,
        screens: 1,
        gap: 0,
      },
      background: typeof background === 'object' && background !== null ? background : {},
      layers: slicedLayers,
    }

    panelsOut.push({
      panelIndex: pi,
      panelLocalRect: { left: 0, top: 0, width: pwI, height: phI },
      stripRect: { left: plI, top: ptI, width: pwI, height: phI },
      summary,
    })
  }

  return {
    slicedExportVersion: 1,
    requestedPanelIndexes: requested,
    sourceSavedAt: savedAt,
    sourceCanvas: { width: Math.round(stripW), height: Math.round(stripH) },
    sourceLayout: { screens, gap },
    panels: panelsOut,
  }
}
