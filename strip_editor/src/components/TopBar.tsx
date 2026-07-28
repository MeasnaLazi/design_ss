import { useCallback, useEffect, useState } from 'react'
import { Frame, Loader2, Maximize2, Minus, Plus, RotateCw, Save, X } from 'lucide-react'

import { AddMenu } from './AddMenu'
import { ZOOM_STEPS, useEditorStore } from '../store/useEditorStore'
import { isDirty, useHistoryStore } from '../store/useHistoryStore'
import { saveStrip } from '../editor/saveStrip'

function IconButton({
  onClick,
  title,
  active,
  children,
}: {
  onClick: () => void
  title: string
  active?: boolean
  children: React.ReactNode
}): React.ReactElement {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`rounded p-1.5 transition-colors ${
        active ? 'bg-sky-500/20 text-sky-300' : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100'
      }`}
    >
      {children}
    </button>
  )
}

/** Nearest preset step below / above the current zoom, for the -/+ buttons. */
function stepZoom(current: number, dir: -1 | 1): number {
  if (dir === -1) {
    const below = ZOOM_STEPS.filter((z) => z < current - 0.001)
    return below.length ? below[below.length - 1] : current
  }
  const above = ZOOM_STEPS.filter((z) => z > current + 0.001)
  return above.length ? above[0] : current
}

export function TopBar(): React.ReactElement {
  const filePath = useEditorStore((s) => s.filePath)
  const geometry = useEditorStore((s) => s.geometry)
  const nodes = useEditorStore((s) => s.nodes)
  const saving = useEditorStore((s) => s.saving)
  const zoom = useEditorStore((s) => s.zoom)
  const zoomMode = useEditorStore((s) => s.zoomMode)
  const showPanelOutlines = useEditorStore((s) => s.showPanelOutlines)
  const setZoom = useEditorStore((s) => s.setZoom)
  const useFitZoom = useEditorStore((s) => s.useFitZoom)
  const togglePanelOutlines = useEditorStore((s) => s.togglePanelOutlines)
  const reload = useEditorStore((s) => s.reload)
  const closeFile = useEditorStore((s) => s.closeFile)
  const dirty = useHistoryStore((s) => isDirty(s))
  const editCount = useHistoryStore((s) => s.log.length - s.savedAt)

  const [flash, setFlash] = useState<string | null>(null)

  const save = useCallback(async (): Promise<void> => {
    const outcome = await saveStrip()
    if (outcome.status === 'saved') setFlash(`Saved · ${(outcome.bytes / 1024).toFixed(1)} kB`)
    else if (outcome.status === 'nothing-to-save') setFlash('No changes')
    else if (outcome.status === 'conflict') setFlash(null)
    else setFlash(null)
  }, [])

  useEffect(() => {
    if (!flash) return
    const t = setTimeout(() => setFlash(null), 2500)
    return () => clearTimeout(t)
  }, [flash])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        void save()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [save])

  const confirmDiscard = (action: () => void): void => {
    if (dirty && !window.confirm('Discard unsaved changes to this strip?')) return
    action()
  }

  return (
    <header className="flex h-11 shrink-0 items-center gap-3 border-b border-zinc-800 bg-zinc-950 px-3">
      <span className="flex min-w-0 items-center gap-2">
        <span className="truncate text-sm font-medium text-zinc-200">{filePath ?? 'Strip Editor'}</span>
        {geometry && (
          <span className="shrink-0 text-xs text-zinc-500">
            {geometry.panels.length} panels · {nodes.filter((n) => n.kind !== 'panel').length} layers · {geometry.width}×
            {geometry.height}
          </span>
        )}
        {dirty && (
          // Whether there is unsaved work is the useful signal; how many
          // property changes it took to get there is not. The count stays in
          // the tooltip for when it is actually wanted.
          <span
            title={`${editCount} unsaved change${editCount === 1 ? '' : 's'}`}
            className="shrink-0 rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-300"
          >
            Unsaved
          </span>
        )}
        {flash && <span className="shrink-0 text-xs text-emerald-400">{flash}</span>}
      </span>

      <div className="ml-3 flex items-center">
        <AddMenu />
      </div>

      <div className="ml-auto flex items-center gap-1">
        <button
          type="button"
          onClick={() => void save()}
          disabled={!dirty || saving}
          title="Save (⌘S)"
          className={`flex items-center gap-1.5 rounded px-2 py-1 text-xs font-medium transition-colors ${
            dirty && !saving
              ? 'bg-sky-500 text-zinc-950 hover:bg-sky-400'
              : 'cursor-default bg-zinc-800 text-zinc-500'
          }`}
        >
          {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
          Save
        </button>

        <div className="mx-1 h-5 w-px bg-zinc-800" />

        <IconButton onClick={togglePanelOutlines} title="Toggle panel outlines" active={showPanelOutlines}>
          <Frame size={15} />
        </IconButton>
        <IconButton onClick={() => confirmDiscard(reload)} title="Reload from disk">
          <RotateCw size={15} />
        </IconButton>

        <div className="mx-1 h-5 w-px bg-zinc-800" />

        <IconButton onClick={() => setZoom(stepZoom(zoom, -1))} title="Zoom out">
          <Minus size={15} />
        </IconButton>
        <span className="w-14 text-center text-xs tabular-nums text-zinc-400">{Math.round(zoom * 100)}%</span>
        <IconButton onClick={() => setZoom(stepZoom(zoom, 1))} title="Zoom in">
          <Plus size={15} />
        </IconButton>
        <IconButton onClick={useFitZoom} title="Fit width" active={zoomMode === 'fit'}>
          <Maximize2 size={15} />
        </IconButton>

        <div className="mx-1 h-5 w-px bg-zinc-800" />

        <IconButton onClick={() => confirmDiscard(closeFile)} title="Close strip">
          <X size={15} />
        </IconButton>
      </div>
    </header>
  )
}
