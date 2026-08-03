import { useEffect, useState } from 'react'
import { AlertTriangle, Bot, FileClock } from 'lucide-react'

import { useEditorStore } from '../store/useEditorStore'

/** Seconds until `iso`, floored at zero. */
function secondsUntil(iso: string | null): number | null {
  if (!iso) return null
  return Math.max(0, Math.ceil((Date.parse(iso) - Date.now()) / 1000))
}

/**
 * Bars for the two ways someone else can be working on this strip.
 *
 * `agent` mode is cooperative — an agent announces its turn and the editor gets
 * out of the way. The external-change prompt is not: it fires whenever the
 * bytes on disk move, whoever moved them, and only when there is unsaved work
 * to weigh against them.
 */
export function ModeBanner(): React.ReactElement | null {
  const mode = useEditorStore((s) => s.mode)
  const holder = useEditorStore((s) => s.modeHolder)
  const since = useEditorStore((s) => s.modeSince)
  const expiresAt = useEditorStore((s) => s.modeExpiresAt)
  const externalChange = useEditorStore((s) => s.externalChange)
  const setExternalChange = useEditorStore((s) => s.setExternalChange)
  const reload = useEditorStore((s) => s.reload)

  // Tick only while an agent holds the document, so the countdown moves without
  // re-rendering the banner once a second for the rest of the session.
  const [, setNow] = useState(0)
  useEffect(() => {
    if (mode !== 'agent') return
    const t = setInterval(() => setNow((n) => n + 1), 1000)
    return () => clearInterval(t)
  }, [mode])

  if (mode === 'agent') {
    const left = secondsUntil(expiresAt)
    return (
      <div className="flex shrink-0 items-center gap-3 border-b border-amber-700 bg-amber-950/80 px-3 py-2 text-xs text-amber-100">
        <Bot size={14} className="shrink-0" />
        <span className="min-w-0 flex-1">
          {/* No holder means nobody identified themselves — the file simply
              changed underneath us. Saying "an agent" would be a guess, and
              wrong for a git checkout or an edit in another program. */}
          {holder ? (
            <>
              <strong className="font-medium">{holder}</strong> is editing this strip
            </>
          ) : (
            'This strip is being changed outside the editor'
          )}
          {since ? ` since ${new Date(since).toLocaleTimeString()}` : ''}. The canvas is read-only so your edits cannot
          interleave with its turn.
        </span>
        <span
          className="shrink-0 rounded bg-amber-900/60 px-2 py-1 font-medium text-amber-200/80"
          title="The lock lapses on its own if the writer stops. Each write it makes extends it."
        >
          {left === null ? 'Locked' : left > 0 ? `Unlocks in ${left}s if idle` : 'Unlocking…'}
        </span>
      </div>
    )
  }

  if (externalChange) {
    return (
      <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-sky-700 bg-sky-950/80 px-3 py-2 text-xs text-sky-100">
        <FileClock size={14} className="shrink-0" />
        <span className="min-w-0 flex-1">
          This file changed on disk at {new Date(externalChange.mtime).toLocaleTimeString()} and you have unsaved
          changes.
        </span>
        <button
          type="button"
          onClick={() => {
            setExternalChange(null)
            reload()
          }}
          className="rounded bg-sky-200/90 px-2 py-1 font-medium text-sky-950 hover:bg-sky-100"
        >
          Reload — lose my edits
        </button>
        <button
          type="button"
          onClick={() => setExternalChange(null)}
          className="rounded border border-sky-500/60 px-2 py-1 font-medium text-sky-200 hover:bg-sky-900/60"
        >
          Keep editing
        </button>
        <span className="w-full text-[11px] text-sky-300/80">
          <AlertTriangle size={11} className="mr-1 inline" />
          Keeping your edits means the next save is refused until you reload or overwrite — saves check the file has not
          moved.
        </span>
      </div>
    )
  }

  return null
}
