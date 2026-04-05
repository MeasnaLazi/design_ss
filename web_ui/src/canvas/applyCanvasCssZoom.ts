import type { Canvas } from 'fabric'

/**
 * Scales only the on-screen size of the canvas (CSS) while the backstore stays at full
 * artboard resolution for export. Does not use Fabric viewport zoom.
 */
export function applyCanvasCssZoom(
  canvas: Canvas,
  artboardWidth: number,
  artboardHeight: number,
  zoom: number,
): void {
  canvas.setViewportTransform([1, 0, 0, 1, 0, 0])
  canvas.setDimensions(
    {
      width: `${artboardWidth * zoom}px`,
      height: `${artboardHeight * zoom}px`,
    },
    { cssOnly: true },
  )
  canvas.requestRenderAll()
}
