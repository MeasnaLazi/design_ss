import type { DragEvent } from 'react'
import { useRef } from 'react'

import { addTextboxToCanvas } from '../../canvas/addTextboxToCanvas'
import { ASSET_DRAG_KIND_TEXT, ASSET_DRAG_MIME } from '../../constants/assetDrag'
import { canvasAreaBackdropStyle } from '../../lib/canvasBackground'
import { useDesignStore } from '../../store/useDesignStore'
import { CanvasWorkspace } from '../canvas/CanvasWorkspace'
import { useDeviceAnchoredCanvasScroll } from './useDeviceAnchoredCanvasScroll'

function hasAssetDrag(types: readonly string[] | DOMStringList): boolean {
  return Array.from(types).includes(ASSET_DRAG_MIME)
}

export function CanvasArea() {
  const scrollRef = useRef<HTMLDivElement>(null)
  const layout = useDeviceAnchoredCanvasScroll(scrollRef)

  const handleCanvasAreaDragOver = (e: DragEvent<HTMLDivElement>) => {
    if (!hasAssetDrag(e.dataTransfer.types)) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
  }

  const handleCanvasAreaDrop = (e: DragEvent<HTMLDivElement>) => {
    const kind = e.dataTransfer.getData(ASSET_DRAG_MIME)
    if (kind !== ASSET_DRAG_KIND_TEXT) return
    e.preventDefault()

    const fabricCanvas = useDesignStore.getState().fabricCanvas
    if (!fabricCanvas) return

    const el = fabricCanvas.upperCanvasEl
    const rect = el.getBoundingClientRect()
    const zoom = useDesignStore.getState().canvasZoom
    const x = (e.clientX - rect.left) / zoom
    const y = (e.clientY - rect.top) / zoom
    if (
      e.clientX < rect.left ||
      e.clientX > rect.right ||
      e.clientY < rect.top ||
      e.clientY > rect.bottom
    ) {
      return
    }

    const w = fabricCanvas.getWidth()
    const h = fabricCanvas.getHeight()
    if (x < 0 || y < 0 || x > w || y > h) return

    addTextboxToCanvas(fabricCanvas, { left: x, top: y })
  }

  return (
    <main
      className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
      aria-label="Canvas workspace"
    >
      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-x-auto overflow-y-auto p-6"
        style={canvasAreaBackdropStyle()}
        onDragOver={handleCanvasAreaDragOver}
        onDrop={handleCanvasAreaDrop}
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
