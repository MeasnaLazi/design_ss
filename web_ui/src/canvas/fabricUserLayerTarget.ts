import { ActiveSelection, type FabricObject } from 'fabric'

import { isDesignSystemCanvasObject } from './canvasObjectMarks'
import { getFabricObjectId } from '../lib/fabricObjectRegistry'

/** True when a Fabric event target is a user-owned layer (not guides, panels, etc.). */
export function isUserLayerFabricTarget(target: FabricObject | undefined | null): boolean {
  if (!target) return false
  if (isDesignSystemCanvasObject(target)) return false
  if (target instanceof ActiveSelection) {
    return target
      .getObjects()
      .some((o) => !isDesignSystemCanvasObject(o) && getFabricObjectId(o))
  }
  return typeof getFabricObjectId(target) === 'string'
}
