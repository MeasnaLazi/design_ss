import type { Canvas, FabricObject } from 'fabric'
import { Rect } from 'fabric'

import { CANVAS_GUTTER_COLOR } from '../lib/canvasBackground'

export const GUTTER_OVERLAY_MARK = '__appsPublisherGutterOverlay' as const

export type GutterOverlayRect = Rect & { [GUTTER_OVERLAY_MARK]?: true }

export function isGutterOverlayRect(o: unknown): o is GutterOverlayRect {
  return o instanceof Rect && !!(o as GutterOverlayRect)[GUTTER_OVERLAY_MARK]
}

export function removeGutterOverlaysFromCanvas(
  canvas: Canvas,
  ref: { current: GutterOverlayRect[] },
): void {
  ref.current.forEach((r) => {
    try {
      canvas.remove(r)
    } catch {
      /* already detached */
    }
    r.dispose()
  })
  ref.current = []
  for (const o of [...canvas.getObjects()]) {
    if (isGutterOverlayRect(o)) {
      canvas.remove(o)
      o.dispose()
    }
  }
}

/**
 * Non-interactive rects over inter-panel gaps, same fill as the canvas gutter. Stacked above user
 * layers so bezels are masked in the gap while staying visible on panels.
 */
export function addGutterOverlayRects(
  canvas: Canvas,
  ref: { current: GutterOverlayRect[] },
  screens: number,
  gap: number,
  panelWidth: number,
  panelHeight: number,
): void {
  removeGutterOverlaysFromCanvas(canvas, ref)
  if (gap <= 0 || screens < 2) return

  const W = panelWidth
  const H = panelHeight

  for (let k = 0; k < screens - 1; k++) {
    const left = k * (W + gap) + W
    const rect = new Rect({
      left,
      top: 0,
      originX: 'left',
      originY: 'top',
      width: gap,
      height: H,
      fill: CANVAS_GUTTER_COLOR,
      strokeWidth: 0,
      selectable: false,
      evented: false,
      excludeFromExport: true,
    }) as GutterOverlayRect
    rect[GUTTER_OVERLAY_MARK] = true
    canvas.add(rect)
    ref.current.push(rect)
  }
}

/** Keeps gutter masks above any newly added objects (devices, text, background images). */
export function attachGutterOverlaysAlwaysOnTop(
  canvas: Canvas,
  getOverlays: () => readonly GutterOverlayRect[],
): () => void {
  const bringOverlaysToFront = () => {
    for (const r of getOverlays()) {
      if (r.canvas === canvas) {
        canvas.bringObjectToFront(r)
      }
    }
  }

  const onAdded = (opt: { target?: FabricObject }) => {
    const t = opt.target
    if (!t || isGutterOverlayRect(t)) return
    bringOverlaysToFront()
  }

  canvas.on('object:added', onAdded)
  return () => {
    canvas.off('object:added', onAdded)
  }
}
