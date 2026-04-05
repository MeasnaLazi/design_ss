import { Download, LayoutTemplate } from 'lucide-react'
import { useDesignStore } from '../../store/useDesignStore'
import { exportAppStoreScreensToZip } from '../../canvas/exportAppStoreScreens'
import { ContextualTextToolbar } from './ContextualTextToolbar'

export function TopToolbar() {
  const screens = useDesignStore((s) => s.config.screens)
  const gap = useDesignStore((s) => s.config.gap)

  const handleExportZip = async () => {
    const canvas = useDesignStore.getState().fabricCanvas
    const { screens: n, gap: g } = useDesignStore.getState().config
    if (!canvas) {
      console.warn('[TopToolbar] export: no canvas')
      return
    }
    try {
      await exportAppStoreScreensToZip(canvas, n, g)
    } catch (e) {
      console.error('[TopToolbar] export failed', e)
    }
  }

  return (
    <header
      className="flex h-12 shrink-0 items-center gap-3 border-b border-zinc-800 bg-zinc-900/80 px-4 backdrop-blur-sm"
      role="banner"
    >
      <div className="flex shrink-0 items-center gap-2">
        <LayoutTemplate className="size-5 text-emerald-400" aria-hidden />
        <span className="font-semibold tracking-tight text-zinc-100">
          App Store Screenshot Designer
        </span>
      </div>

      <div className="flex min-w-0 flex-1 justify-center overflow-x-auto">
        <ContextualTextToolbar />
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={handleExportZip}
          className="flex items-center gap-1.5 rounded-md border border-zinc-700 bg-zinc-800 px-2.5 py-1.5 text-xs font-medium text-zinc-100 hover:bg-zinc-700"
          title="Download each screen as PNG in a ZIP"
        >
          <Download className="size-3.5" aria-hidden />
          <span className="hidden sm:inline">Export ZIP</span>
        </button>
        <div className="hidden text-xs text-zinc-500 lg:block" aria-live="polite">
          {screens} screens · gap {gap}px
        </div>
      </div>
    </header>
  )
}
