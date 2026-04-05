import { CanvasWorkspace } from '../canvas/CanvasWorkspace'
import { useDesignStore } from '../../store/useDesignStore'

export function CanvasArea() {
  const background = useDesignStore((s) => s.config.background)

  return (
    <main
      className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
      aria-label="Canvas workspace"
    >
      <div
        className="min-h-0 flex-1 overflow-auto p-6"
        style={{ backgroundColor: background }}
      >
        <div className="inline-block min-w-min">
          <CanvasWorkspace />
        </div>
      </div>
    </main>
  )
}
