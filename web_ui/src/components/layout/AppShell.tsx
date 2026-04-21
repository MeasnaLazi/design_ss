import { useEffect } from 'react'

import { useArrowNudgeLayerHotkeys } from '../../hooks/useArrowNudgeLayerHotkeys'
import { useDeviceFramePackStore } from '../../store/useDeviceFramePackStore'
import { useArtboardPresetDisplaySync } from '../../hooks/useArtboardPresetDisplaySync'
import { useCopyPasteLayerHotkeys } from '../../hooks/useCopyPasteLayerHotkeys'
import { useDeleteLayerHotkeys } from '../../hooks/useDeleteLayerHotkeys'
import { useDesignHistoryRecorder } from '../../hooks/useDesignHistoryRecorder'
import { useSaveDesignHotkey } from '../../hooks/useSaveDesignHotkey'
import { useUndoRedoHotkeys } from '../../hooks/useUndoRedoHotkeys'
import { ToastHost } from '../ui/ToastHost'

import { BottomFooter } from './BottomFooter'
import { CanvasArea } from './CanvasArea'
import { LeftSidebar } from './LeftSidebar'
import { TopToolbar } from './TopToolbar'

export function AppShell() {
  useEffect(() => {
    void useDeviceFramePackStore.getState().loadRegistry()
  }, [])

  useArrowNudgeLayerHotkeys()
  useCopyPasteLayerHotkeys()
  useDeleteLayerHotkeys()
  useSaveDesignHotkey()
  useUndoRedoHotkeys()
  useDesignHistoryRecorder()
  useArtboardPresetDisplaySync()

  return (
    <div className="flex h-dvh min-h-0 flex-col bg-zinc-950 text-zinc-100 antialiased">
      <TopToolbar />
      <div className="flex min-h-0 flex-1">
        <LeftSidebar />
        <CanvasArea />
      </div>
      <BottomFooter />
      <ToastHost />
    </div>
  )
}
