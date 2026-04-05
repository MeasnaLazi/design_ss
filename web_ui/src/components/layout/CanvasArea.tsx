import { CanvasWorkspace } from '../canvas/CanvasWorkspace'
import { useDesignStore } from '../../store/useDesignStore'

export function CanvasArea() {
  const background = useDesignStore((s) => s.config.background)

  return (
    <main
      className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
      aria-label="Canvas workspace"
    >
      <div
        className="flex min-h-0 flex-1 items-center justify-center overflow-hidden p-6"
        style={{ backgroundColor: background }}
      >
        <div className="shrink-0">
          <CanvasWorkspace />
        </div>
      </div>
    </main>
  )
}
