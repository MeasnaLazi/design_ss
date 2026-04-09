import { getFabricObjectId } from '../lib/fabricObjectRegistry'
import { useDesignStore } from '../store/useDesignStore'

import { isDesignSystemCanvasObject } from './canvasObjectMarks'

/**
 * Sets each design layer’s `zIndex` to match the Fabric stack: bottom object → 0, top → n−1.
 * The sidebar lists higher `zIndex` first, so this aligns saved metadata with actual paint order.
 */
export function reindexLayersFromCanvas(): boolean {
  const canvas = useDesignStore.getState().fabricCanvas
  if (!canvas) {
    console.warn('[reindexLayersFromCanvas] no canvas')
    return false
  }

  const userObjects = canvas.getObjects().filter((o) => !isDesignSystemCanvasObject(o))
  const idsInOrder = userObjects
    .map((o) => getFabricObjectId(o))
    .filter((id): id is string => typeof id === 'string')

  const idToZ = new Map(idsInOrder.map((id, i) => [id, i]))

  const { objects, setObjects } = useDesignStore.getState()
  const next = objects.map((o) => {
    const z = idToZ.get(o.id)
    if (z === undefined) return o
    return { ...o, zIndex: z }
  })

  setObjects(next)
  console.log('[reindexLayersFromCanvas] zIndex 0..', idsInOrder.length - 1, idsInOrder)
  return true
}
