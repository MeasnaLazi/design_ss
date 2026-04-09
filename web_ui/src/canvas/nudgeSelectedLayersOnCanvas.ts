import { ActiveSelection, type Canvas, type FabricObject } from 'fabric'

import { getFabricObjectId } from '../lib/fabricObjectRegistry'

import { isDesignSystemCanvasObject } from './canvasObjectMarks'

function nudgeObject(obj: FabricObject, dx: number, dy: number): void {
  obj.set({
    left: (obj.left ?? 0) + dx,
    top: (obj.top ?? 0) + dy,
  })
  obj.setCoords()
}

/**
 * Moves the active user layer(s) by logical pixels. Supports {@link ActiveSelection}.
 * Returns whether anything was moved.
 */
export function nudgeSelectedLayersOnCanvas(
  canvas: Canvas,
  dx: number,
  dy: number,
): boolean {
  const active = canvas.getActiveObject()
  if (!active) return false

  if (active instanceof ActiveSelection) {
    const targets = active
      .getObjects()
      .filter((o) => !isDesignSystemCanvasObject(o) && getFabricObjectId(o))
    if (targets.length === 0) return false
    for (const obj of targets) {
      nudgeObject(obj, dx, dy)
    }
    active.setCoords()
    canvas.requestRenderAll()
    /** Keeps contextual X/Y and device W/H inputs in sync (they listen for `object:modified`). */
    canvas.fire('object:modified', { target: active })
    return true
  }

  if (isDesignSystemCanvasObject(active)) return false
  if (!getFabricObjectId(active)) return false

  nudgeObject(active, dx, dy)
  canvas.requestRenderAll()
  canvas.fire('object:modified', { target: active })
  return true
}
