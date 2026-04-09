import { buildDisplayDocumentFromCanvas } from '../canvas/serializeDisplayDocument'
import {
  displayDocumentFilenameForPreset,
  getDisplayFileSlug,
} from '../constants/artboardPresets'
import { useDesignStore } from '../store/useDesignStore'
import { useToastStore } from '../store/useToastStore'
import type { DisplayDocumentV1 } from '../types/displayDocument'

import { putDisplayDocument } from './datasourceApi'

function downloadDisplayJson(doc: DisplayDocumentV1, filename: string): void {
  const blob = new Blob([JSON.stringify(doc, null, 2)], {
    type: 'application/json',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

/**
 * Writes the current canvas + design store to `datasource/display_<slug>.json` via the dev API.
 * Same behavior as the toolbar “Save to datasource” action (toast + JSON download fallback).
 */
export async function saveDisplayToDatasource(): Promise<void> {
  const { showToast } = useToastStore.getState()
  const canvas = useDesignStore.getState().fabricCanvas
  if (!canvas) {
    console.warn('[saveDisplayToDatasource] no canvas')
    showToast('Save failed — canvas is not ready yet.', 'error')
    return
  }

  const doc = buildDisplayDocumentFromCanvas(canvas)
  const presetId = useDesignStore.getState().config.artboardPresetId
  const slug = getDisplayFileSlug(presetId)
  const basename = displayDocumentFilenameForPreset(presetId)

  try {
    await putDisplayDocument(doc, slug)
    console.log('[saveDisplayToDatasource] saved to datasource/', basename)
    showToast(`Saved to datasource/${basename}.`, 'success')
  } catch (e) {
    console.error('[saveDisplayToDatasource] save failed (dev server only)', e)
    downloadDisplayJson(doc, basename)
    showToast(
      `Could not write to datasource (dev server only). Downloaded ${basename} instead.`,
      'warning',
    )
  }
}
