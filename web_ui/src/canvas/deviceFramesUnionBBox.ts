import type { Canvas } from 'fabric'
import { FabricImage, Group } from 'fabric'

import { findObjectOnCanvasByAppId } from '../lib/fabricObjectRegistry'
import type { DesignObjectRecord } from '../store/designTypes'

export type ArtboardBBox = { left: number; top: number; width: number; height: number }

/**
 * Axis-aligned union of each device group’s **frame image** (bezel asset), in canvas/artboard coordinates.
 * The frame is always the **last** child in the group (screenshot, if any, is inserted at index 0).
 *
 * Use this for scroll anchoring and scroll-range clamping — not {@link Group#getBoundingRect}, which
 * includes Fabric selection padding and transform-control bounds around the whole group.
 */
export function deviceGroupFrameUnionBBox(
  canvas: Canvas,
  objects: DesignObjectRecord[],
): ArtboardBBox | null {
  const deviceIds = new Set(
    objects.filter((o) => o.kind === 'device').map((o) => o.id),
  )
  if (deviceIds.size === 0) return null

  let left = Infinity
  let top = Infinity
  let right = -Infinity
  let bottom = -Infinity
  let any = false

  for (const id of deviceIds) {
    const obj = findObjectOnCanvasByAppId(canvas, id)
    if (!(obj instanceof Group)) continue
    const children = obj.getObjects()
    const frame = children[children.length - 1]
    if (!(frame instanceof FabricImage)) continue
    const b = frame.getBoundingRect()
    any = true
    left = Math.min(left, b.left)
    top = Math.min(top, b.top)
    right = Math.max(right, b.left + b.width)
    bottom = Math.max(bottom, b.top + b.height)
  }

  if (!any) return null
  return { left, top, width: right - left, height: bottom - top }
}
