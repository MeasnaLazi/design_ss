import {
  CANVAS_ZOOM_MAX,
  CANVAS_ZOOM_MIN,
  useDesignStore,
} from '../../store/useDesignStore'
import { Minus, Plus } from 'lucide-react'

export function CanvasZoomControls() {
  const canvasZoom = useDesignStore((s) => s.canvasZoom)
  const zoomIn = useDesignStore((s) => s.zoomCanvasIn)
  const zoomOut = useDesignStore((s) => s.zoomCanvasOut)
  const resetCanvasZoom = useDesignStore((s) => s.resetCanvasZoom)

  const atMin = canvasZoom <= CANVAS_ZOOM_MIN + 1e-6
  const atMax = canvasZoom >= CANVAS_ZOOM_MAX - 1e-6
  const pct = Math.round(canvasZoom * 100)

  return (
    <div
      className="flex items-center gap-0.5 rounded-md border border-zinc-700 bg-zinc-800 p-0.5"
      role="group"
      aria-label="Canvas zoom"
    >
      <button
        type="button"
        onClick={zoomOut}
        disabled={atMin}
        className="flex size-8 items-center justify-center rounded text-zinc-100 enabled:hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-40"
        title="Zoom out"
        aria-label="Zoom out"
      >
        <Minus className="size-4" aria-hidden />
      </button>
      <button
        type="button"
        onClick={resetCanvasZoom}
        className="min-w-[3.25rem] px-1 py-1.5 text-center text-xs font-medium tabular-nums text-zinc-200 hover:bg-zinc-700/80"
        title="Reset zoom to 100%"
        aria-label={`Zoom ${pct} percent. Click to reset to 100 percent.`}
      >
        {pct}%
      </button>
      <button
        type="button"
        onClick={zoomIn}
        disabled={atMax}
        className="flex size-8 items-center justify-center rounded text-zinc-100 enabled:hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-40"
        title="Zoom in"
        aria-label="Zoom in"
      >
        <Plus className="size-4" aria-hidden />
      </button>
    </div>
  )
}
