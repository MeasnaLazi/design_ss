/**
 * Re-index the live document after a structural change, preserving identity.
 *
 * Lives on its own so both `structureActions` and `undoRedo` can call it without
 * importing each other.
 */
import { getStageIframe } from './stageRef'
import { indexStrip } from './blockRegistry'
import { useEditorStore } from '../store/useEditorStore'

export function reindexLive(): void {
  const iframe = getStageIframe()
  const store = useEditorStore.getState()
  if (!iframe || !store.geometry) return
  store.setReady(store.geometry, indexStrip(iframe), store.composerErrors)
}
