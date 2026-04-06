import { canvasAreaBackdropStyle } from '../../lib/canvasBackground'
import { CanvasWorkspace } from '../canvas/CanvasWorkspace'

export function CanvasArea() {
  return (
    <main
      className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
      aria-label="Canvas workspace"
    >
      <div
        className="min-h-0 flex-1 overflow-x-auto overflow-y-auto p-6"
        style={canvasAreaBackdropStyle()}
      >
        <div className="flex min-h-full min-w-full items-center justify-center">
          <div className="shrink-0">
            <CanvasWorkspace />
          </div>
        </div>
      </div>
    </main>
  )
}
