import { Point, type Canvas } from 'fabric'

/** Applies absolute zoom level, anchored to the artboard center (canvas space). */
export function applyViewportZoom(canvas: Canvas, zoom: number): void {
  const cx = canvas.getWidth() / 2
  const cy = canvas.getHeight() / 2
  canvas.zoomToPoint(new Point(cx, cy), zoom)
}
