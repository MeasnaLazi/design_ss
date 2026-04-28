import {
  Download,
  LayoutTemplate,
  Redo2,
  RotateCcw,
  Undo2,
} from 'lucide-react'
import {
  canRedoDesignHistory,
  canUndoDesignHistory,
  resetDesignHistoryFromCurrentCanvas,
  redoDesignHistory,
  undoDesignHistory,
  useDesignHistoryStore,
} from '../../history/designHistory'

import { exportAppStoreScreensToZip } from '../../canvas/exportAppStoreScreens'
import { applyEmptyDesignForPreset } from '../../canvas/loadDisplayDocument'
import {
  getArtboardDimensionsFromConfig,
} from '../../constants/artboardPresets'
import { useDesignStore } from '../../store/useDesignStore'
import { useSaveStatusStore } from '../../store/useSaveStatusStore'
import { useToastStore } from '../../store/useToastStore'

import { ContextualDeviceToolbar } from './ContextualDeviceToolbar'
import { ContextualPositionToolbar } from './ContextualPositionToolbar'
import { ContextualTextToolbar } from './ContextualTextToolbar'

export function TopToolbar() {
  useDesignHistoryStore((s) => s.rev)
  const canUndo = canUndoDesignHistory()
  const canRedo = canRedoDesignHistory()

  const handleExportZip = async () => {
    const canvas = useDesignStore.getState().fabricCanvas
    const cfg = useDesignStore.getState().config
    const { screens: n, gap: g } = cfg
    const { width: sw, height: sh } = getArtboardDimensionsFromConfig(cfg)
    const { showToast } = useToastStore.getState()
    if (!canvas) {
      console.warn('[TopToolbar] export: no canvas')
      showToast('Export failed — canvas is not ready yet.', 'error')
      return
    }
    try {
      await exportAppStoreScreensToZip(canvas, n, g, sw, sh)
      showToast('Screens exported — ZIP download started.', 'success')
    } catch (e) {
      console.error('[TopToolbar] export failed', e)
      showToast('Export failed — could not build the ZIP.', 'error')
    }
  }

  const handleReset = async () => {
    const proceed = window.confirm(
      [
        'Reset current design to the default empty layout?',
        '',
        'This clears the canvas, all layers, and undo/redo history.',
        'Auto-save will sync to datasource shortly (or press ⌘S / Ctrl+S to save immediately).',
      ].join('\n'),
    )
    if (!proceed) return

    const { config } = useDesignStore.getState()
    try {
      await applyEmptyDesignForPreset(config.artboardPresetId)
      resetDesignHistoryFromCurrentCanvas()
      useSaveStatusStore.getState().clearPersistedFingerprint()
      useSaveStatusStore
        .getState()
        .setIdle('Reset to default layout — auto-save will sync shortly.')
    } catch (e) {
      console.error('[TopToolbar] reset failed', e)
      useToastStore.getState().showToast('Reset failed — please try again.', 'error')
    }
  }

  return (
    <header
      className="relative z-50 flex h-12 shrink-0 items-center gap-3 border-b border-zinc-800 bg-zinc-900/80 px-4 backdrop-blur-sm"
      role="banner"
    >
      <div className="flex shrink-0 items-center gap-2">
        <LayoutTemplate className="size-5 text-emerald-400" aria-hidden />
        <span className="font-semibold tracking-tight text-zinc-100">
          Screenshotor
        </span>
      </div>

      <div className="flex min-w-0 flex-1 items-center justify-center gap-2 overflow-x-auto px-1">
        <ContextualTextToolbar />
        <ContextualDeviceToolbar />
      </div>

      <div className="flex shrink-0 items-center gap-2 sm:gap-3">
        <ContextualPositionToolbar />
        <div className="hidden h-6 w-px bg-zinc-700 sm:block" aria-hidden />
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            title="Undo (⌘Z / Ctrl+Z)"
            aria-label="Undo"
            disabled={!canUndo}
            onClick={() => void undoDesignHistory()}
            className="rounded-md border border-zinc-700 bg-zinc-800 p-1.5 text-zinc-100 hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Undo2 className="size-3.5" aria-hidden />
          </button>
          <button
            type="button"
            title="Redo (⌘⇧Z / Ctrl+Y)"
            aria-label="Redo"
            disabled={!canRedo}
            onClick={() => void redoDesignHistory()}
            className="rounded-md border border-zinc-700 bg-zinc-800 p-1.5 text-zinc-100 hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Redo2 className="size-3.5" aria-hidden />
          </button>
        </div>
        <button
          type="button"
          onClick={() => void handleReset()}
          className="flex items-center gap-1.5 rounded-md border border-zinc-700 bg-zinc-800 px-2.5 py-1.5 text-xs font-medium text-zinc-100 hover:bg-zinc-700"
          title="Reset to default empty layout and clear undo/redo history"
        >
          <RotateCcw className="size-3.5 shrink-0" aria-hidden />
          <span className="hidden sm:inline">Reset</span>
        </button>
        <button
          type="button"
          onClick={handleExportZip}
          className="flex items-center gap-1.5 rounded-md border border-zinc-700 bg-zinc-800 px-2.5 py-1.5 text-xs font-medium text-zinc-100 hover:bg-zinc-700"
          title="Download each screen as PNG in a ZIP"
        >
          <Download className="size-3.5" aria-hidden />
          <span className="hidden sm:inline">Export ZIP</span>
        </button>
      </div>
    </header>
  )
}
