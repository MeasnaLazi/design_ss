import { useCallback, useEffect, useState } from 'react'
import { Frame, ImageDown, Keyboard, Loader2, Maximize2, Minus, Plus, Redo2, RotateCw, Save, Undo2, WifiOff, X } from 'lucide-react'

import { AddMenu } from './AddMenu'
import { ZOOM_STEPS, useEditorStore } from '../store/useEditorStore'
import { canRedo, canUndo, isDirty, useHistoryStore } from '../store/useHistoryStore'
import { redo, redoLabel, undo, undoLabel } from '../editor/undoRedo'
import { exportStrip } from '../lib/api'
import { saveStrip } from '../editor/saveStrip'

function IconButton({
  onClick,
  title,
  active,
  disabled,
  children,
}: {
  onClick: () => void
  title: string
  active?: boolean
  disabled?: boolean
  children: React.ReactNode
}): React.ReactElement {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      disabled={disabled}
      className={`rounded p-1.5 transition-colors disabled:cursor-default disabled:opacity-30 disabled:hover:bg-transparent ${
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

export function TopBar({ onShowShortcuts }: { onShowShortcuts: () => void }): React.ReactElement {
  const filePath = useEditorStore((s) => s.filePath)
  const geometry = useEditorStore((s) => s.geometry)
  const nodes = useEditorStore((s) => s.nodes)
  const saving = useEditorStore((s) => s.saving)
  const exporting = useEditorStore((s) => s.exporting)
  const readOnly = useEditorStore((s) => s.mode === 'agent')
  const watchState = useEditorStore((s) => s.watchState)
  const notice = useEditorStore((s) => s.notice)
  const setNotice = useEditorStore((s) => s.setNotice)
  const zoom = useEditorStore((s) => s.zoom)
  const zoomMode = useEditorStore((s) => s.zoomMode)
  const showPanelOutlines = useEditorStore((s) => s.showPanelOutlines)
  const setZoom = useEditorStore((s) => s.setZoom)
  const useFitZoom = useEditorStore((s) => s.useFitZoom)
  const togglePanelOutlines = useEditorStore((s) => s.togglePanelOutlines)
  const reload = useEditorStore((s) => s.reload)
  const closeFile = useEditorStore((s) => s.closeFile)
  const dirty = useHistoryStore((s) => isDirty(s))
  const undoable = useHistoryStore((s) => canUndo(s))
  const redoable = useHistoryStore((s) => canRedo(s))
  const editCount = useHistoryStore((s) => Math.abs(s.cursor - s.savedAt))

  const [flash, setFlash] = useState<string | null>(null)

  const save = useCallback(async (): Promise<void> => {
    const outcome = await saveStrip()
    if (outcome.status === 'saved') setFlash(`Saved · ${(outcome.bytes / 1024).toFixed(1)} kB`)
    else if (outcome.status === 'nothing-to-save') setFlash('No changes')
    else if (outcome.status === 'conflict') setFlash(null)
    else setFlash(null)
  }, [])

  /**
   * Export renders the file *on disk*, so unsaved work would silently not
   * appear in the PNGs. Saving first is what anyone pressing this button means.
   */
  const exportNow = useCallback(async (): Promise<void> => {
    const { filePath: path, setExporting, setSaveError } = useEditorStore.getState()
    if (!path) return
    setExporting(true)
    setSaveError(null)
    try {
      if (isDirty(useHistoryStore.getState())) {
        const saved = await saveStrip()
        if (saved.status !== 'saved' && saved.status !== 'nothing-to-save') {
          setExporting(false)
          return // the save path already surfaced why
        }
      }
      const result = await exportStrip(path)
      if (result.ok) {
        setFlash(`Exported ${result.panels?.length ?? 0} panels → ${result.outDir} · ${result.ms}ms`)
      } else {
        setSaveError(`Export failed: ${result.error ?? 'unknown error'}`)
      }
    } catch (e: unknown) {
      setSaveError(`Export failed: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      useEditorStore.getState().setExporting(false)
    }
  }, [])

  useEffect(() => {
    if (!flash) return
    const t = setTimeout(() => setFlash(null), 6000)
    return () => clearTimeout(t)
  }, [flash])

  // The watcher and other background work post notices through the store; the
  // toolbar is the one place that shows them.
  useEffect(() => {
    if (!notice) return
    setFlash(notice)
    setNotice(null)
  }, [notice, setNotice])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (!e.metaKey && !e.ctrlKey) return
      const key = e.key.toLowerCase()
      if (key === 's') {
        e.preventDefault()
        void save()
        return
      }
      // Undo and redo are global: a field or a text session has its own
      // native undo, so leave those alone.
      const target = e.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return
      if (useEditorStore.getState().editingId) return

      if (key === 'z' && !e.shiftKey) {
        e.preventDefault()
        void undo()
      } else if ((key === 'z' && e.shiftKey) || key === 'y') {
        e.preventDefault()
        void redo()
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
        {watchState === 'offline' ? (
          <span
            title="Not receiving file-change events — the dev server may have restarted. Live reload is off until it reconnects."
            className="flex shrink-0 items-center gap-1 rounded bg-rose-500/15 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-rose-300"
          >
            <WifiOff size={10} /> watch offline
          </span>
        ) : (
          watchState === 'live' && (
            // A filled dot rather than an outline icon: this sits on a near-black
            // toolbar at 11px, and the first attempt (a zinc-600 glyph) was
            // technically rendered and practically invisible.
            <span
              title="Live — watching this file for changes on disk"
              className="flex shrink-0 items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-emerald-400/80"
            >
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
              live
            </span>
          )
        )}
        {flash && <span className="shrink-0 text-xs text-emerald-400">{flash}</span>}
      </span>

      <div className="ml-3 flex items-center">
        <AddMenu />
      </div>

      <div className="ml-auto flex items-center gap-1">
        <IconButton
          onClick={() => void undo()}
          title={undoable ? `Undo ${undoLabel() ?? ''} (⌘Z)` : 'Nothing to undo'}
          disabled={!undoable || readOnly}
        >
          <Undo2 size={15} />
        </IconButton>
        <IconButton
          onClick={() => void redo()}
          title={redoable ? `Redo ${redoLabel() ?? ''} (⇧⌘Z)` : 'Nothing to redo'}
          disabled={!redoable || readOnly}
        >
          <Redo2 size={15} />
        </IconButton>

        <div className="mx-1 h-5 w-px bg-zinc-800" />

        <button
          type="button"
          onClick={() => void save()}
          disabled={!dirty || saving || readOnly}
          title="Save (⌘S)"
          className={`flex items-center gap-1.5 rounded px-2 py-1 text-xs font-medium transition-colors ${
            dirty && !saving && !readOnly
              ? 'bg-sky-500 text-zinc-950 hover:bg-sky-400'
              : 'cursor-default bg-zinc-800 text-zinc-500'
          }`}
        >
          {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
          Save
        </button>

        <IconButton
          onClick={() => void exportNow()}
          title={exporting ? 'Rendering…' : 'Export panel PNGs with render.mjs (saves first)'}
          disabled={exporting || readOnly}
        >
          {exporting ? <Loader2 size={15} className="animate-spin" /> : <ImageDown size={15} />}
        </IconButton>

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

        <IconButton onClick={onShowShortcuts} title="Keyboard shortcuts (?)">
          <Keyboard size={15} />
        </IconButton>
        <IconButton onClick={() => confirmDiscard(closeFile)} title="Close strip">
          <X size={15} />
        </IconButton>
      </div>
    </header>
  )
}
