import { ActiveSelection, IText, type Canvas } from 'fabric'

import {
  findObjectOnCanvasByAppId,
  getFabricObjectId,
} from '../lib/fabricObjectRegistry'
import { useDesignStore } from '../store/useDesignStore'

import { isDesignSystemCanvasObject } from './canvasObjectMarks'

function discardIfActive(canvas: Canvas, target: Parameters<Canvas['remove']>[0]): void {
  const active = canvas.getActiveObject()
  if (!active) return
  if (
    active === target ||
    (active instanceof ActiveSelection && active.getObjects().includes(target))
  ) {
    canvas.discardActiveObject()
  }
}

/**
 * Removes a user layer from the Fabric canvas and the design store.
 * No-op on the canvas side if the object is missing (store is still updated).
 *
 * Store is updated **before** `canvas.remove` so undo history (`buildDisplayDocumentFromCanvas`)
 * never captures a frame where Fabric no longer has the object but `objects` still lists it.
 */
export function deleteLayerById(id: string): void {
  const canvas = useDesignStore.getState().fabricCanvas

  useDesignStore.getState().removeObject(id)

  if (canvas) {
    const target = findObjectOnCanvasByAppId(canvas, id)
    if (target) {
      if (isDesignSystemCanvasObject(target)) {
        console.warn('[deleteLayerById] skipped system object', id)
        return
      }
      discardIfActive(canvas, target)
      canvas.remove(target)
      target.dispose()
      canvas.requestRenderAll()
    }
  }
}

/**
 * Deletes whatever is selected on the canvas (single layer or {@link ActiveSelection}), or falls back
 * to the design store’s `selectedObject` when Fabric has no active object.
 * Returns whether any layer was removed. No-op while editing canvas text.
 */
export function deleteSelectedCanvasLayers(): boolean {
  const canvas = useDesignStore.getState().fabricCanvas
  if (!canvas || isFabricTextEditing(canvas)) return false

  const active = canvas.getActiveObject()

  if (active instanceof ActiveSelection) {
    const ids = active
      .getObjects()
      .filter((o) => !isDesignSystemCanvasObject(o))
      .map((o) => getFabricObjectId(o))
      .filter((id): id is string => typeof id === 'string')
    if (ids.length === 0) return false
    for (const id of ids) {
      deleteLayerById(id)
    }
    return true
  }

  if (active && !isDesignSystemCanvasObject(active)) {
    const id = getFabricObjectId(active)
    if (id) {
      deleteLayerById(id)
      return true
    }
  }

  const selectedObject = useDesignStore.getState().selectedObject
  if (selectedObject) {
    deleteLayerById(selectedObject)
    return true
  }

  return false
}

/** Selects a user layer on the canvas (updates Fabric + store via existing selection handlers). */
export function selectLayerById(id: string): void {
  const canvas = useDesignStore.getState().fabricCanvas
  if (!canvas) return
  const obj = findObjectOnCanvasByAppId(canvas, id)
  if (!obj || isDesignSystemCanvasObject(obj)) return
  canvas.setActiveObject(obj)
  canvas.requestRenderAll()
}

export function isFabricTextEditing(canvas: Canvas | null): boolean {
  if (!canvas) return false
  const active = canvas.getActiveObject()
  return active instanceof IText && !!active.isEditing
}
