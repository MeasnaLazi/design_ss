import { CanvasZoomControls } from './CanvasZoomControls'

export function BottomFooter() {
  return (
    <footer
      className="flex h-11 shrink-0 items-center gap-3 border-t border-zinc-800 bg-zinc-900/80 px-4 backdrop-blur-sm"
      role="contentinfo"
      aria-label="Status and view options"
    >
      <span className="text-xs text-zinc-500">Canvas view</span>
      <div className="min-w-0 flex-1" />
      <CanvasZoomControls />
    </footer>
  )
}
