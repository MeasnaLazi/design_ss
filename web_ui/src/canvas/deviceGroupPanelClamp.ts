import type { Canvas, TPointerEvent, Transform } from 'fabric'
import { FabricImage, Group } from 'fabric'

import { getArtboardDimensionsFromConfig } from '../constants/artboardPresets'
import { DEVICE_FRAME_PANEL_CLAMP_VERTICAL_BLEED_PX } from '../constants/deviceFrame'
import { getFabricObjectId } from '../lib/fabricObjectRegistry'
import { useDesignStore } from '../store/useDesignStore'
import { syncFabricDragTransformOffsets } from './syncFabricDragTransformOffsets'

function isDeviceGroup(target: unknown): target is Group {
  if (!(target instanceof Group)) return false
  const id = getFabricObjectId(target)
  if (!id) return false
  const rec = useDesignStore.getState().objects.find((o) => o.id === id)
  return rec?.kind === 'device'
}

/** Panel slot that best matches a canvas X (fallback when the bbox sits only in gutters). */
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

/** Panels whose horizontal span intersects the device bbox (so wide frames can span 2+ slots). */
function panelIndicesOverlappingHorizontally(
  bboxLeft: number,
  bboxRight: number,
  screens: number,
  gap: number,
  W: number,
): number[] {
  const hit: number[] = []
  for (let i = 0; i < screens; i++) {
    const pl = i * (W + gap)
    const pr = pl + W
    if (bboxRight > pl && bboxLeft < pr) {
      hit.push(i)
    }
  }
  return hit
}

/** Union of all given panel rects (contiguous range from min to max index, including gaps). */
function unionPanelBoundsFromIndices(
  indices: number[],
  gap: number,
  W: number,
  H: number,
): { left: number; top: number; right: number; bottom: number } | null {
  if (indices.length === 0) return null
  const minI = Math.min(...indices)
  const maxI = Math.max(...indices)
  const left = minI * (W + gap)
  const right = maxI * (W + gap) + W
  return { left, top: 0, right, bottom: H }
}

/**
 * Keeps a device frame group’s axis-aligned bbox inside the union of every screenshot panel it
 * horizontally overlaps (so one phone can span two or more panels), with optional vertical bleed
 * past the artboard top/bottom. Falls back to the nearest panel if the bbox lies only in gutters.
 *
 * Uses the **bezel** {@link FabricImage} (last group child), not {@link Group#getBoundingRect}, so
 * the clamp matches the visible frame — same idea as {@link deviceGroupFrameUnionBBox}. The group
 * bbox can diverge (e.g. layout / children union), which showed up with the axis-aligned **front**
 * frame sitting past the panel edge while other angles looked fine.
 */
export function clampDeviceGroupToNearestPanel(target: Group): void {
  const id = getFabricObjectId(target)
  if (!id) return
  const rec = useDesignStore.getState().objects.find((o) => o.id === id)
  if (rec?.kind !== 'device') return

  const cfg = useDesignStore.getState().config
  const { screens, gap } = cfg
  if (screens < 1) return

  const { width: W, height: H } = getArtboardDimensionsFromConfig(cfg)

  const children = target.getObjects()
  const frame = children[children.length - 1]
  const b =
    frame instanceof FabricImage ? frame.getBoundingRect() : target.getBoundingRect()
  const br = b.left + b.width
  const indices = panelIndicesOverlappingHorizontally(b.left, br, screens, gap, W)
  const union = unionPanelBoundsFromIndices(indices, gap, W, H)
  const cx = b.left + b.width / 2
  const { left: pl, top: pt, right: pr, bottom: pb } =
    union ?? panelBoundsForCenterX(cx, screens, gap, W, H)

  const bleed = DEVICE_FRAME_PANEL_CLAMP_VERTICAL_BLEED_PX
  const vSpan = pb - pt + 2 * bleed

  let newBl = b.left
  let newBt = b.top

  const unionW = pr - pl
  const maxBl = pr - b.width
  const minBl = pl
  if (maxBl >= minBl) {
    newBl = Math.min(Math.max(b.left, minBl), maxBl)
  } else {
    newBl = pl + (unionW - b.width) / 2
  }

  const minBt = pt - bleed
  const maxBt = pb + bleed - b.height
  if (maxBt >= minBt) {
    newBt = Math.min(Math.max(b.top, minBt), maxBt)
  } else {
    newBt = pt - bleed + (vSpan - b.height) / 2
  }

  const dx = newBl - b.left
  const dy = newBt - b.top
  if (dx !== 0 || dy !== 0) {
    target.set({
      left: (target.left ?? 0) + dx,
      top: (target.top ?? 0) + dy,
    })
    target.setCoords()
  }
}

export function attachDeviceGroupPanelClamp(canvas: Canvas): void {
  const tryClamp = (
    t: unknown,
    transform?: Transform,
    e?: TPointerEvent,
  ): void => {
    if (!(t instanceof Group) || !isDeviceGroup(t)) return
    const leftBefore = t.left
    const topBefore = t.top
    clampDeviceGroupToNearestPanel(t)
    if (t.left !== leftBefore || t.top !== topBefore) {
      syncFabricDragTransformOffsets(canvas, t, transform, e)
      canvas.requestRenderAll()
    }
  }

  const onMoving = (opt: { target?: unknown; transform?: Transform; e?: TPointerEvent }) => {
    tryClamp(opt.target, opt.transform, opt.e)
  }

  const onModified = (opt: { target?: unknown; transform?: Transform; e?: TPointerEvent }) => {
    tryClamp(opt.target, opt.transform, opt.e)
  }

  canvas.on('object:moving', onMoving)
  canvas.on('object:modified', onModified)
}
