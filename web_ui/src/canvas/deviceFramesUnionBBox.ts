import type { Canvas } from 'fabric'

import { findObjectOnCanvasByAppId } from '../lib/fabricObjectRegistry'
import type { DesignObjectRecord } from '../store/designTypes'

export type ArtboardBBox = { left: number; top: number; width: number; height: number }

/**
 * Axis-aligned union of all device-frame groups on the canvas (artboard coordinates).
 * Used to anchor horizontal scrolling so the strip reveals the frames, not only empty gutters.
 */
export function deviceFramesUnionBBox(
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
    if (!obj) continue
    const b = obj.getBoundingRect()
    any = true
    left = Math.min(left, b.left)
    top = Math.min(top, b.top)
    right = Math.max(right, b.left + b.width)
    bottom = Math.max(bottom, b.top + b.height)
  }

  if (!any) return null
  return { left, top, width: right - left, height: bottom - top }
}
