import { applyEmptyDesignForPreset, loadDisplayDocumentIntoCanvas } from '../canvas/loadDisplayDocument'
import { parseDisplayDocument } from '../canvas/parseDisplayDocument'
import { getDisplayFileSlug } from '../constants/artboardPresets'
import { resetDesignHistoryFromCurrentCanvas } from '../history/designHistory'
import { tryFetchDisplayDocument } from './datasourceApi'
import { useDesignStore } from '../store/useDesignStore'

/**
 * Fetches the active preset’s `display_*.json` and applies it to the Fabric canvas (soft reload).
 * Used by SSE remote sync and the toolbar “Reload from datasource” action.
 */
export async function reloadDisplayFromDatasource(): Promise<void> {
  const fabricCanvas = useDesignStore.getState().fabricCanvas
  if (!fabricCanvas) return

  const presetId = useDesignStore.getState().config.artboardPresetId
  const slug = getDisplayFileSlug(presetId)
  const raw = await tryFetchDisplayDocument(slug)
  if (raw === null) {
    await applyEmptyDesignForPreset(presetId)
  } else {
    const doc = parseDisplayDocument(raw)
    await loadDisplayDocumentIntoCanvas(doc)
  }
  resetDesignHistoryFromCurrentCanvas()
}
