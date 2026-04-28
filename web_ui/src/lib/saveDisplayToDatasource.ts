import { buildDisplayDocumentFromCanvas } from '../canvas/serializeDisplayDocument'
import {
  displayDocumentFilenameForPreset,
  getDisplayFileSlug,
} from '../constants/artboardPresets'
import { useDesignStore } from '../store/useDesignStore'
import { useSaveStatusStore } from '../store/useSaveStatusStore'
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

/** Stable fingerprint for dedupe and change detection (matches design history semantics). */
export function fingerprintDisplayDocument(doc: DisplayDocumentV1): string {
  return JSON.stringify({
    design: doc.design,
    fabricObjects: doc.fabricObjects,
  })
}

export type PersistDisplaySource = 'manual' | 'auto'

export type PersistDisplayOptions = {
  source?: PersistDisplaySource
  /** When true, skip PUT if document matches last successful save (toolbar status only). */
  skipIfUnchanged?: boolean
  /** When set, passed to `fetch` so a newer auto-save can cancel an in-flight PUT. */
  signal?: AbortSignal
}

/**
 * Writes the current canvas + design store to `datasource/display_<slug>.json` via the dev API.
 * Updates {@link useSaveStatusStore} only (no toasts). Manual Save / ⌘S and auto-save share this path.
 */
export async function persistDisplayDocumentToDatasource(
  options?: PersistDisplayOptions,
): Promise<{ ok: boolean; skipped?: boolean }> {
  const source = options?.source ?? 'manual'
  const skipIfUnchanged = options?.skipIfUnchanged ?? false

  const canvas = useDesignStore.getState().fabricCanvas
  if (!canvas) {
    console.warn('[persistDisplayDocumentToDatasource] no canvas')
    useSaveStatusStore.getState().setError('Save failed — canvas is not ready yet.')
    return { ok: false }
  }

  const doc = buildDisplayDocumentFromCanvas(canvas)
  const fp = fingerprintDisplayDocument(doc)
  const lastFp = useSaveStatusStore.getState().lastPersistedFingerprint

  if (skipIfUnchanged && fp === lastFp) {
    useSaveStatusStore.getState().setSavedUnchanged('All changes saved.')
    return { ok: true, skipped: true }
  }

  const presetId = useDesignStore.getState().config.artboardPresetId
  const slug = getDisplayFileSlug(presetId)
  const basename = displayDocumentFilenameForPreset(presetId)

  useSaveStatusStore.getState().setSaving(source === 'auto' ? 'Auto-saving…' : 'Saving…')

  try {
    await putDisplayDocument(doc, slug, { signal: options?.signal })
    console.log('[persistDisplayDocumentToDatasource] saved to datasource/', basename)
    useSaveStatusStore
      .getState()
      .setSaved(`Saved to datasource/${basename}.`, fp)
    return { ok: true }
  } catch (e) {
    if (options?.signal?.aborted) {
      useSaveStatusStore.getState().setPending('Unsaved changes…')
      return { ok: false }
    }
    console.error('[persistDisplayDocumentToDatasource] save failed (dev server only)', e)
    downloadDisplayJson(doc, basename)
    useSaveStatusStore
      .getState()
      .setError(
        `Could not write to datasource (dev server only). Downloaded ${basename} instead.`,
      )
    return { ok: false }
  }
}

/** Manual save / hotkey — always PUT when the document differs from last persisted. */
export async function saveDisplayToDatasource(): Promise<void> {
  await persistDisplayDocumentToDatasource({ source: 'manual', skipIfUnchanged: true })
}
