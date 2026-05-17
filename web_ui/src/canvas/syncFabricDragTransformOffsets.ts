import type { Canvas, FabricObject, Transform, TPointerEvent } from 'fabric'

/**
 * After programmatically changing `left`/`top` during a drag, update Fabric's transform offsets so
 * the next pointer frame does not revert to the pre-adjustment position.
 *
 * Design layers are canvas-root objects (not nested in a parent group), so scene coordinates
 * match Fabric's drag `offsetX`/`offsetY` model.
 */
export function syncFabricDragTransformOffsets(
  canvas: Canvas,
  target: FabricObject,
  transform: Transform | undefined,
  e: TPointerEvent | undefined,
): void {
  if (!transform || transform.target !== target || !e || target.group) return
  const pointer = canvas.getScenePoint(e)
  transform.offsetX = pointer.x - (target.left ?? 0)
  transform.offsetY = pointer.y - (target.top ?? 0)
}
