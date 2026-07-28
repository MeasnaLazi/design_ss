import { AlertTriangle } from 'lucide-react'

import { saveStrip } from '../editor/saveStrip'
import { useEditorStore } from '../store/useEditorStore'

/**
 * Save failures that need a decision, shown as a bar under the toolbar.
 *
 * The conflict case is the important one: the file changed on disk after the
 * editor opened it — an agent edit, a `git checkout`, a hand edit — and the
 * editor holds unsaved changes. There is no correct automatic answer, so both
 * options are spelled out with their consequence rather than resolved silently.
 * (P6 adds the file watcher that catches this the moment it happens, instead of
 * at save time.)
 */
export function SaveBanner(): React.ReactElement | null {
  const conflict = useEditorStore((s) => s.conflict)
  const saveError = useEditorStore((s) => s.saveError)
  const setConflict = useEditorStore((s) => s.setConflict)
  const setSaveError = useEditorStore((s) => s.setSaveError)
  const reload = useEditorStore((s) => s.reload)

  if (conflict) {
    return (
      <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-amber-800 bg-amber-950/80 px-3 py-2 text-xs text-amber-100">
        <AlertTriangle size={14} className="shrink-0" />
        <span className="min-w-0 flex-1">
          This file changed on disk after you opened it (disk {new Date(conflict.actual).toLocaleTimeString()}, yours{' '}
          {new Date(conflict.expected).toLocaleTimeString()}). Something else edited the strip.
        </span>
        <button
          type="button"
          onClick={() => {
            setConflict(null)
            reload()
          }}
          className="rounded bg-amber-200/90 px-2 py-1 font-medium text-amber-950 hover:bg-amber-100"
        >
          Reload from disk — lose my edits
        </button>
        <button
          type="button"
          onClick={() => {
            void saveStrip(true)
          }}
          className="rounded border border-amber-500/60 px-2 py-1 font-medium text-amber-200 hover:bg-amber-900/60"
        >
          Overwrite — lose their edits
        </button>
      </div>
    )
  }

  if (saveError) {
    return (
      <div className="flex shrink-0 items-center gap-3 border-b border-rose-800 bg-rose-950/80 px-3 py-2 text-xs text-rose-100">
        <AlertTriangle size={14} className="shrink-0" />
        <span className="min-w-0 flex-1">{saveError}</span>
        <button
          type="button"
          onClick={() => setSaveError(null)}
          className="rounded border border-rose-500/60 px-2 py-1 font-medium text-rose-200 hover:bg-rose-900/60"
        >
          Dismiss
        </button>
      </div>
    )
  }

  return null
}
