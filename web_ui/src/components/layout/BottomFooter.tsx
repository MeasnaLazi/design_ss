import {
  type SaveToolbarStatus,
  useSaveStatusStore,
} from '../../store/useSaveStatusStore'

import { CanvasZoomControls } from './CanvasZoomControls'

function saveStatusTextClass(status: SaveToolbarStatus): string {
  switch (status) {
    case 'error':
      return 'text-red-400'
    case 'saved':
      return 'text-emerald-400/90'
    case 'saving':
    case 'pending':
      return 'text-zinc-400'
    default:
      return 'text-zinc-500'
  }
}

export function BottomFooter() {
  const saveStatus = useSaveStatusStore((s) => s.status)
  const saveMessage = useSaveStatusStore((s) => s.message)

  return (
    <footer
      className="flex h-11 shrink-0 items-center gap-3 border-t border-zinc-800 bg-zinc-900/80 px-4 backdrop-blur-sm"
      role="contentinfo"
      aria-label="Status and view options"
    >
      <span className="shrink-0 text-xs text-zinc-500">Canvas view</span>
      <div className="flex min-w-0 flex-1 items-center justify-start">
        {(saveMessage || saveStatus !== 'idle') && (
          <div
            className={`truncate text-xs ${saveStatusTextClass(saveStatus)}`}
            role="status"
            aria-live="polite"
            aria-atomic="true"
          >
            {saveMessage || (saveStatus === 'idle' ? '' : saveStatus)}
          </div>
        )}
      </div>
      <CanvasZoomControls />
    </footer>
  )
}
