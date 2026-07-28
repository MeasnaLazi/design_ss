/**
 * Save orchestration: fold the edit log, patch the pristine file text, refuse if
 * the round trip is not clean, write atomically.
 */
import { StaleFileError, writeStrip } from '../lib/api'
import { foldEdits, useHistoryStore } from '../store/useHistoryStore'
import { getStageIframe } from './stageRef'
import { serializeWithEdits } from './serializeStrip'
import { useEditorStore } from '../store/useEditorStore'

export type SaveOutcome =
  | { status: 'saved'; bytes: number }
  | { status: 'nothing-to-save' }
  | { status: 'conflict'; expected: string; actual: string }
  | { status: 'error'; message: string }

/**
 * @param force skip the mtime precondition — used only after the human has
 *              explicitly chosen "overwrite" in the conflict prompt.
 */
export async function saveStrip(force = false): Promise<SaveOutcome> {
  const store = useEditorStore.getState()
  const history = useHistoryStore.getState()
  const { filePath, originalHtml, mtime } = store

  if (!filePath || originalHtml === null) return { status: 'error', message: 'no document open' }
  if (history.log.length === history.savedAt) return { status: 'nothing-to-save' }

  // The live document is only consulted for panels whose structure changed; every
// other edit is still spliced from the pristine text.
  const { html, missing, unlocatable, applied } = serializeWithEdits(
    originalHtml,
    foldEdits(history.log),
    getStageIframe()?.contentDocument ?? null,
  )

  // Refuse rather than write a partial patch: a save that silently drops one of
  // the human's changes is worse than one that fails and says why.
  if (missing.length > 0) {
    return {
      status: 'error',
      message: `Refusing to save: ${missing.length} edited block(s) are not in the file on disk (${missing.join(', ')}). Its structure changed — reload and redo the change.`,
    }
  }
  if (unlocatable.length > 0) {
    return { status: 'error', message: `Refusing to save — ${unlocatable.join('; ')}` }
  }
  if (applied === 0 || html === originalHtml) return { status: 'nothing-to-save' }

  store.setSaving(true)
  store.setSaveError(null)
  try {
    const result = await writeStrip(filePath, html, force ? null : mtime)
    useEditorStore.getState().onSaved(html, result.mtime)
    useHistoryStore.getState().markSaved()
    return { status: 'saved', bytes: result.bytes }
  } catch (e: unknown) {
    useEditorStore.getState().setSaving(false)
    if (e instanceof StaleFileError) {
      const conflict = { expected: e.expected, actual: e.actual }
      useEditorStore.getState().setConflict(conflict)
      return { status: 'conflict', ...conflict }
    }
    const message = e instanceof Error ? e.message : String(e)
    useEditorStore.getState().setSaveError(message)
    return { status: 'error', message }
  }
}
