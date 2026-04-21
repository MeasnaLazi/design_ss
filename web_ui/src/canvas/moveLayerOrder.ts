import type { Canvas } from 'fabric'

import { getFabricObjectId } from '../lib/fabricObjectRegistry'
import { useDesignStore } from '../store/useDesignStore'

import { isDesignSystemCanvasObject } from './canvasObjectMarks'
import { isGutterOverlayRect } from './gutterOverlayRects'
import { reindexLayersFromCanvas } from './reindexLayersFromCanvas'

function userStack(canvas: Canvas) {
  return canvas.getObjects().filter((o) => {
    if (isDesignSystemCanvasObject(o)) return false
    return typeof getFabricObjectId(o) === 'string'
  })
}

/** Bottom → top stack order (matches Fabric `getObjects` for user layers). */
export function getUserLayerIdsBottomToTop(canvas: Canvas | null): string[] {
  if (!canvas) return []
  return userStack(canvas)
    .map((o) => getFabricObjectId(o))
    .filter((id): id is string => typeof id === 'string')
}

function bringGutterOverlaysToFront(canvas: Canvas): void {
  for (const o of canvas.getObjects()) {
    if (isGutterOverlayRect(o)) {
      canvas.bringObjectToFront(o)
    }
  }
}

/**
 * @param towardTopOfList When true, moves one step toward the top of the Layers panel (more in front on canvas).
 */
export function moveLayerById(id: string, towardTopOfList: boolean): boolean {
  const canvas = useDesignStore.getState().fabricCanvas
  if (!canvas) return false

  const stack = userStack(canvas)
  const idx = stack.findIndex((o) => getFabricObjectId(o) === id)
  if (idx < 0) return false

  const obj = stack[idx]!

  if (towardTopOfList) {
    if (idx >= stack.length - 1) return false
    const above = stack[idx + 1]!
    canvas.remove(obj)
    const after = canvas.getObjects()
    const insertAt = after.indexOf(above) + 1
    if (insertAt < 0) return false
    canvas.insertAt(insertAt, obj)
  } else {
    if (idx <= 0) return false
    const below = stack[idx - 1]!
    canvas.remove(obj)
    const after = canvas.getObjects()
    const insertAt = after.indexOf(below)
    if (insertAt < 0) return false
    canvas.insertAt(insertAt, obj)
  }

  bringGutterOverlaysToFront(canvas)
  reindexLayersFromCanvas()
  canvas.fire('object:modified', { target: obj })
  canvas.requestRenderAll()
  return true
}
