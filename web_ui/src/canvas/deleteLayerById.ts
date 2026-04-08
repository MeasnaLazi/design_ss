import { ActiveSelection, IText, type Canvas } from 'fabric'

import { findObjectOnCanvasByAppId } from '../lib/fabricObjectRegistry'
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
 */
export function deleteLayerById(id: string): void {
  const canvas = useDesignStore.getState().fabricCanvas

  if (canvas) {
    const target = findObjectOnCanvasByAppId(canvas, id)
    if (target) {
      if (isDesignSystemCanvasObject(target)) {
        console.warn('[deleteLayerById] skipped system object', id)
        useDesignStore.getState().removeObject(id)
        return
      }
      discardIfActive(canvas, target)
      canvas.remove(target)
      target.dispose()
      canvas.requestRenderAll()
    }
  }

  useDesignStore.getState().removeObject(id)
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
