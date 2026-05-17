import { Textbox, type Canvas, type FabricObject, type Transform, type TPointerEvent } from 'fabric'

import { getArtboardDimensionsFromConfig } from '../constants/artboardPresets'
import { getFabricObjectId } from '../lib/fabricObjectRegistry'
import { useDesignStore } from '../store/useDesignStore'
import { syncFabricDragTransformOffsets } from './syncFabricDragTransformOffsets'

/** Match `toolkit/scripts/core/constants.py` — App Store–style headline margins per panel. */
export const TEXT_SAFE_ZONE_TOP = 120
export const TEXT_SAFE_ZONE_BOTTOM = 120
export const TEXT_SAFE_ZONE_SIDES = 60

function panelBoundsForCenterX(
  centerX: number,
  screens: number,
  gap: number,
  W: number,
  H: number,
): { left: number; top: number; right: number; bottom: number } {
  let bestIdx = 0
  let bestDist = Infinity
  for (let i = 0; i < screens; i++) {
    const midX = i * (W + gap) + W / 2
    const d = Math.abs(centerX - midX)
    if (d < bestDist) {
      bestDist = d
      bestIdx = i
    }
  }
  const left = bestIdx * (W + gap)
  return { left, top: 0, right: left + W, bottom: H }
}

/**
 * Safe rectangle (canvas coordinates) for the panel whose horizontal span contains `centerX`.
 */
export function textSafeRectForPanelContainingX(
  centerX: number,
  screens: number,
  gap: number,
  panelW: number,
  panelH: number,
): { left: number; top: number; right: number; bottom: number } {
  const pb = panelBoundsForCenterX(centerX, screens, gap, panelW, panelH)
  return {
    left: pb.left + TEXT_SAFE_ZONE_SIDES,
    top: TEXT_SAFE_ZONE_TOP,
    right: pb.right - TEXT_SAFE_ZONE_SIDES,
    bottom: pb.bottom - TEXT_SAFE_ZONE_BOTTOM,
  }
}

/**
 * Clamps an axis-aligned Textbox (angle ≈ 0) so its bounding rect stays inside the safe zone of
 * the panel that contains the bbox horizontal center.
 * @returns true if position changed.
 */
export function clampTextboxToNearestPanelSafeZone(obj: Textbox): boolean {
  const id = getFabricObjectId(obj)
  if (!id) return false
  const rec = useDesignStore.getState().objects.find((o) => o.id === id)
  if (rec?.kind !== 'text') return false

  if (Math.abs(obj.angle ?? 0) > 1e-3) return false

  const cfg = useDesignStore.getState().config
  const screens = Math.max(1, Math.floor(Number(cfg.screens) || 1))
  const gap = cfg.gap
  const { width: panelW, height: panelH } = getArtboardDimensionsFromConfig(cfg)

  const b = obj.getBoundingRect()
  const cx = b.left + b.width / 2
  const safe = textSafeRectForPanelContainingX(cx, screens, gap, panelW, panelH)

  const innerW = safe.right - safe.left
  const innerH = safe.bottom - safe.top
  if (innerW < 1 || innerH < 1) return false

  let newLeft = b.left
  let newTop = b.top
  if (b.width <= innerW) {
    newLeft = Math.min(Math.max(b.left, safe.left), safe.right - b.width)
  } else {
    newLeft = safe.left
  }
  if (b.height <= innerH) {
    newTop = Math.min(Math.max(b.top, safe.top), safe.bottom - b.height)
  } else {
    newTop = safe.top
  }

  const dx = newLeft - b.left
  const dy = newTop - b.top
  if (Math.abs(dx) < 0.25 && Math.abs(dy) < 0.25) return false

  obj.set({
    left: (obj.left ?? 0) + dx,
    top: (obj.top ?? 0) + dy,
  })
  obj.setCoords()
  return true
}

function tryClampTarget(
  canvas: Canvas,
  target: FabricObject | undefined,
  transform?: Transform,
  e?: TPointerEvent,
): void {
  if (!(target instanceof Textbox)) return
  if (clampTextboxToNearestPanelSafeZone(target)) {
    syncFabricDragTransformOffsets(canvas, target, transform, e)
    canvas.requestRenderAll()
  }
}

/**
 * Keep design text inside per-panel safe margins during drags and after scales / new layers.
 */
export function attachTextboxSafeZoneClamp(canvas: Canvas): () => void {
  const onMoving = (opt?: {
    target?: FabricObject
    transform?: Transform
    e?: TPointerEvent
  }) => {
    tryClampTarget(canvas, opt?.target, opt?.transform, opt?.e)
  }
  const onModified = (opt?: {
    target?: FabricObject
    transform?: Transform
    e?: TPointerEvent
  }) => {
    tryClampTarget(canvas, opt?.target, opt?.transform, opt?.e)
  }
  const onAdded = (opt?: { target?: FabricObject }) => {
    tryClampTarget(canvas, opt?.target)
  }

  canvas.on('object:moving', onMoving)
  canvas.on('object:modified', onModified)
  canvas.on('object:added', onAdded)

  return () => {
    canvas.off('object:moving', onMoving)
    canvas.off('object:modified', onModified)
    canvas.off('object:added', onAdded)
  }
}
