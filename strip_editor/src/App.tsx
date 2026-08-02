import { useEffect } from 'react'

import { EditorShell } from './components/EditorShell'
import { FilePicker } from './components/FilePicker'
import { isDirty, useHistoryStore } from './store/useHistoryStore'
import { stripFromLocation, syncLocation } from './lib/location'
import { useEditorStore } from './store/useEditorStore'

/**
 * Keep the open document and the URL saying the same thing.
 *
 * Browser state rather than view state, so it lives outside React's data flow:
 * the store is the source of truth and the address bar follows it — except on
 * first paint and on Back/Forward, where the URL leads.
 */
function useLocationSync(): void {
  useEffect(() => {
    const { openFile, closeFile } = useEditorStore.getState()

    // First paint: the URL wins, so a reload lands back on the same strip.
    // `replace`, not `push` — restoring where you already were should not add a
    // history entry.
    // The `!== filePath` guard matters under StrictMode, which mounts effects
    // twice in dev: without it the document would be opened, and its history
    // reset, a second time for no reason.
    const initial = stripFromLocation()
    if (initial && initial !== useEditorStore.getState().filePath) openFile(initial)
    syncLocation(initial, 'replace')

    // Store → URL. `syncLocation` no-ops when the two already agree, which is
    // what stops the Back handler below from re-pushing the entry it consumed.
    const unsubscribe = useEditorStore.subscribe((state, prev) => {
      if (state.filePath !== prev.filePath) syncLocation(state.filePath)
    })

    // URL → store, for Back and Forward.
    const onPopState = (): void => {
      const target = stripFromLocation()
      const current = useEditorStore.getState().filePath
      if (target === current) return

      // Leaving a document with unsaved edits would discard them with no way
      // back: the command log is per-document and is reset on open. Ask first,
      // and on a refusal put the URL back rather than leave the address bar
      // describing a document that is not open.
      if (current && isDirty(useHistoryStore.getState())) {
        if (!window.confirm('This strip has unsaved changes. Leave and lose them?')) {
          syncLocation(current, 'push')
          return
        }
      }
      if (target) openFile(target)
      else closeFile()
    }

    window.addEventListener('popstate', onPopState)
    return () => {
      unsubscribe()
      window.removeEventListener('popstate', onPopState)
    }
  }, [])
}

/**
 * Warn before a reload or tab close throws away unsaved edits.
 *
 * Reloading is a normal thing to do now that it returns you to the same strip,
 * which makes it far likelier to happen with work in progress.
 */
function useUnsavedGuard(): void {
  const dirty = useHistoryStore(isDirty)
  useEffect(() => {
    if (!dirty) return
    const onBeforeUnload = (e: BeforeUnloadEvent): void => {
      e.preventDefault()
      // Browsers supply their own wording; a non-empty returnValue is what marks
      // the event as needing confirmation in the older API.
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [dirty])
}

export default function App(): React.ReactElement {
  const filePath = useEditorStore((s) => s.filePath)
  useLocationSync()
  useUnsavedGuard()
  return filePath ? <EditorShell /> : <FilePicker />
}
