import { useArrowNudgeLayerHotkeys } from '../../hooks/useArrowNudgeLayerHotkeys'
import { useArtboardPresetDisplaySync } from '../../hooks/useArtboardPresetDisplaySync'
import { useCopyPasteLayerHotkeys } from '../../hooks/useCopyPasteLayerHotkeys'
import { useDeleteLayerHotkeys } from '../../hooks/useDeleteLayerHotkeys'
import { useSaveDesignHotkey } from '../../hooks/useSaveDesignHotkey'
import { ToastHost } from '../ui/ToastHost'

import { BottomFooter } from './BottomFooter'
import { CanvasArea } from './CanvasArea'
import { LeftSidebar } from './LeftSidebar'
import { TopToolbar } from './TopToolbar'

export function AppShell() {
  useArrowNudgeLayerHotkeys()
  useCopyPasteLayerHotkeys()
  useDeleteLayerHotkeys()
  useSaveDesignHotkey()
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
