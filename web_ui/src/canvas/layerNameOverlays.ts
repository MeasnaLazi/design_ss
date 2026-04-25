import type { Canvas, FabricObject } from 'fabric'
import { IText, Shadow } from 'fabric'

import { findObjectOnCanvasByAppId } from '../lib/fabricObjectRegistry'
import type { DesignObjectRecord, LayerTitleMode } from '../store/designTypes'

/**
 * High-contrast “annotation” styling for layer title chips: readable in screenshots, OCR, and
 * vision-model pass (saturated background vs near-black type; monospace IDs for character boundaries).
 */
const OVERLAY = {
  backgroundColor: '#f59e0b', // amber-500 — salient on light & dark artboard
  textFill: '#0a0a0a', // near-black
  nameFont:
    "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'Noto Sans', sans-serif",
  idFont: "ui-monospace, 'SF Mono', Menlo, Consolas, 'Cascadia Mono', 'Courier New', monospace",
} as const

const PAD = 6

/**
 * Box width for clamping; conservative so labels stay on-canvas when measuring API is imprecise.
 * (Wider for monospace + UUIDs.)
 */
function approxChipWidthPx(
  text: string,
  fontSize: number,
  mode: LayerTitleMode,
): number {
  const approxCharW =
    fontSize * (mode === 'id' ? 0.62 : 0.5) + (mode === 'id' ? fontSize * 0.012 : 0)
  return Math.min(1024, Math.max(32, 12 + text.length * approxCharW) + 2 * PAD)
}

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
  titleMode: LayerTitleMode,
): LayerNameOverlayText {
  const bounds = target.getBoundingRect()
  const y = Math.max(2, bounds.top - 52)
  const label = titleMode === 'id' ? layer.id : layer.name
  const isId = titleMode === 'id'
  const fontSize = isId ? 30 : 34
  const chipW = approxChipWidthPx(label, fontSize, titleMode)
  const minEdge = 4
  const x = Math.max(
    minEdge,
    Math.min(bounds.left + 6, Math.max(minEdge, canvas.getWidth() - chipW - minEdge)),
  )
  const text = new IText(label, {
    originX: 'left',
    originY: 'top',
    left: x,
    top: y,
    fontSize,
    lineHeight: 1.05,
    fontFamily: isId ? OVERLAY.idFont : OVERLAY.nameFont,
    fontWeight: '700',
    fill: OVERLAY.textFill,
    /** Full-opacity chip: stable color blocks for model / OCR vs variable canvas. */
    backgroundColor: OVERLAY.backgroundColor,
    /**
     * Soft halo separates the chip from nearby amber UI or artboard; not a text glyph stroke
     * (IText `stroke` would outline every character).
     */
    shadow: new Shadow({
      color: 'rgba(12, 12, 14, 0.5)',
      blur: 4,
      offsetX: 0,
      offsetY: 1,
    }),
    padding: PAD,
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
  titleMode: LayerTitleMode,
): void {
  removeLayerNameOverlaysFromCanvas(canvas, ref)
  for (const layer of objects) {
    const target = findObjectOnCanvasByAppId(canvas, layer.id)
    if (!target) continue
    const label = buildLayerNameLabel(canvas, target, layer, titleMode)
    canvas.add(label)
    canvas.bringObjectToFront(label)
    ref.current.push(label)
  }
}
