import { useRef } from 'react'

import { canvasAreaBackdropStyle } from '../../lib/canvasBackground'
import { CanvasWorkspace } from '../canvas/CanvasWorkspace'
import { useDeviceAnchoredCanvasScroll } from './useDeviceAnchoredCanvasScroll'

export function CanvasArea() {
  const scrollRef = useRef<HTMLDivElement>(null)
  const layout = useDeviceAnchoredCanvasScroll(scrollRef)

  return (
    <main
      className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
      aria-label="Canvas workspace"
    >
      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-x-auto overflow-y-auto p-6"
        style={canvasAreaBackdropStyle()}
      >
        <div
          className={`flex min-h-full items-center ${layout.deviceAnchored ? '' : 'min-w-full justify-center'}`}
          style={
            layout.deviceAnchored
              ? { width: layout.contentW, minWidth: '100%' }
              : undefined
          }
        >
          <div
            className="relative shrink-0"
            style={
              layout.deviceAnchored
                ? {
                    width: layout.contentW,
                    height: layout.trackHeight,
                  }
                : undefined
            }
          >
            <div
              style={
                layout.deviceAnchored
                  ? {
                      position: 'absolute',
                      left: layout.canvasLeft,
                      top: layout.canvasTop,
                      width: layout.canvasCssW,
                      height: layout.canvasCssH,
                    }
                  : undefined
              }
            >
              <CanvasWorkspace />
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
