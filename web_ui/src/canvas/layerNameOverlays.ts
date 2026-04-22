import type { Canvas, FabricObject } from 'fabric'
import { IText } from 'fabric'

import { findObjectOnCanvasByAppId } from '../lib/fabricObjectRegistry'
import type { DesignObjectRecord } from '../store/designTypes'

export const LAYER_NAME_OVERLAY_MARK = '__appsPublisherLayerNameOverlay' as const
export type LayerNameOverlayText = IText & { [LAYER_NAME_OVERLAY_MARK]?: true }

export function isLayerNameOverlayText(o: unknown): o is LayerNameOverlayText {
  return o instanceof IText && !!(o as LayerNameOverlayText)[LAYER_NAME_OVERLAY_MARK]
}

export function removeLayerNameOverlaysFromCanvas(
  canvas: Canvas,
  ref: { current: LayerNameOverlayText[] },
): void {
  ref.current.forEach((label) => {
    try {
      canvas.remove(label)
    } catch {
      /* already detached */
    }
    label.dispose()
  })
  ref.current = []
  for (const o of [...canvas.getObjects()]) {
    if (isLayerNameOverlayText(o)) {
      canvas.remove(o)
      o.dispose()
    }
  }
}

function buildLayerNameLabel(
  canvas: Canvas,
  target: FabricObject,
  layer: DesignObjectRecord,
): LayerNameOverlayText {
  const bounds = target.getBoundingRect()
  const x = Math.max(2, Math.min(bounds.left + 6, Math.max(2, canvas.getWidth() - 180)))
  const y = Math.max(2, bounds.top - 48)
  const text = new IText(layer.name, {
    originX: 'left',
    originY: 'top',
    left: x,
    top: y,
    fontSize: 40,
    fontFamily: 'Arial',
    fontWeight: '400',
    fill: 'rgba(161, 161, 170, 0.95)',
    backgroundColor: '',
    selectable: false,
    evented: false,
    editable: false,
    excludeFromExport: true,
  }) as LayerNameOverlayText
  text[LAYER_NAME_OVERLAY_MARK] = true
  return text
}

/** Rebuilds non-interactive labels near each user-layer border. */
export function syncLayerNameOverlays(
  canvas: Canvas,
  ref: { current: LayerNameOverlayText[] },
  objects: readonly DesignObjectRecord[],
): void {
  removeLayerNameOverlaysFromCanvas(canvas, ref)
  for (const layer of objects) {
    const target = findObjectOnCanvasByAppId(canvas, layer.id)
    if (!target) continue
    const label = buildLayerNameLabel(canvas, target, layer)
    canvas.add(label)
    canvas.bringObjectToFront(label)
    ref.current.push(label)
  }
}
