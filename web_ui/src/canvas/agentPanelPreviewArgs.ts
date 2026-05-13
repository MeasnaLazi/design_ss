import { screenExportRect } from '../constants/appStoreScreens'
import { getArtboardDimensionsFromConfig } from '../constants/artboardPresets'
import { useDesignStore } from '../store/useDesignStore'
import { useToastStore } from '../store/useToastStore'

const PANEL_PREVIEW_OPS = new Set(['render_panel_preview', 'capture_panel_preview_data'])

function panelPreviewOpLabel(operation: string): string {
  return PANEL_PREVIEW_OPS.has(operation) ? operation : 'panel_preview'
}

function showPanelPreviewToast(operation: string, message: string): void {
  useToastStore.getState().showToast(`${panelPreviewOpLabel(operation)}: ${message}`, 'warning')
}

/**
 * Resolves contiguous strip columns from `panel_indexes` or a single `panel_index` / `panel_number`.
 * Shows the same warning toasts as `render_panel_preview` and returns `null` on invalid input.
 */
export function resolvePanelPreviewSelection(
  args: Record<string, unknown>,
  operation = 'render_panel_preview',
): { panelIndexes: number[] } | null {
  const rawList = args.panel_indexes
  if (Array.isArray(rawList) && rawList.length > 0) {
    const parsed: number[] = []
    for (const item of rawList) {
      const n = Number(item)
      if (!Number.isInteger(n)) {
        showPanelPreviewToast(operation, 'panel_indexes must be integers.')
        return null
      }
      parsed.push(n)
    }
    const sorted = [...new Set(parsed)].sort((a, b) => a - b)
    for (let i = 0; i < sorted.length; i++) {
      if (sorted[i] !== sorted[0]! + i) {
        showPanelPreviewToast(
          operation,
          'panel_indexes must be contiguous strip columns (e.g. 0,1 or 2,3,4).',
        )
        return null
      }
    }
    const { config } = useDesignStore.getState()
    const screens = Math.max(1, Math.floor(Number(config.screens ?? 1)))
    const i0 = sorted[0]!
    const i1 = sorted[sorted.length - 1]!
    if (i0 < 0 || i1 >= screens) {
      showPanelPreviewToast(
        operation,
        `panel_indexes must be within [0, ${screens - 1}].`,
      )
      return null
    }
    return { panelIndexes: sorted }
  }

  const rawPanelIndex = args.panel_index
  const rawPanelNumber = args.panel_number
  const panelIndex =
    rawPanelIndex !== undefined
      ? Number(rawPanelIndex)
      : rawPanelNumber !== undefined
        ? Number(rawPanelNumber) - 1
        : Number.NaN
  if (!Number.isInteger(panelIndex)) {
    showPanelPreviewToast(
      operation,
      'provide panel_indexes (contiguous) or integer panel_index (0-based) or panel_number (1-based).',
    )
    return null
  }
  const { config } = useDesignStore.getState()
  const screens = Math.max(1, Math.floor(Number(config.screens ?? 1)))
  if (panelIndex < 0 || panelIndex >= screens) {
    showPanelPreviewToast(
      operation,
      `panel_index must be in [0, ${screens - 1}] or panel_number in [1, ${screens}].`,
    )
    return null
  }
  return { panelIndexes: [panelIndex] }
}

/** Document-space export rect spanning contiguous `panelIndexes` (preview crop geometry). */
export function panelPreviewExportRect(panelIndexes: number[]): {
  left: number
  top: number
  width: number
  height: number
} {
  const { config } = useDesignStore.getState()
  const { width, height } = getArtboardDimensionsFromConfig(config)
  const gap = config.gap
  const i0 = panelIndexes[0]!
  const i1 = panelIndexes[panelIndexes.length - 1]!
  const r0 = screenExportRect(i0, gap, width, height)
  const r1 = screenExportRect(i1, gap, width, height)
  return {
    left: r0.left,
    top: r0.top,
    width: r1.left + r1.width - r0.left,
    height: r0.height,
  }
}
