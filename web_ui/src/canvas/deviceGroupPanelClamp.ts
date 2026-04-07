import type { Canvas } from 'fabric'
import { Group } from 'fabric'

import {
  APP_STORE_SCREEN_HEIGHT,
  APP_STORE_SCREEN_WIDTH,
} from '../constants/appStoreScreens'
import { getFabricObjectId } from '../lib/fabricObjectRegistry'
import { useDesignStore } from '../store/useDesignStore'

function isDeviceGroup(target: unknown): target is Group {
  if (!(target instanceof Group)) return false
  const id = getFabricObjectId(target)
  if (!id) return false
  const rec = useDesignStore.getState().objects.find((o) => o.id === id)
  return rec?.kind === 'device'
}

/** Panel slot that best matches the device’s horizontal center (App Store artboard cell). */
function panelBoundsForDeviceCenter(
  bboxCenterX: number,
  screens: number,
  gap: number,
): { left: number; top: number; right: number; bottom: number } {
  const W = APP_STORE_SCREEN_WIDTH
  const H = APP_STORE_SCREEN_HEIGHT
  let bestIdx = 0
  let bestDist = Infinity
  for (let i = 0; i < screens; i++) {
    const midX = i * (W + gap) + W / 2
    const d = Math.abs(bboxCenterX - midX)
    if (d < bestDist) {
      bestDist = d
      bestIdx = i
    }
  }
  const left = bestIdx * (W + gap)
  return { left, top: 0, right: left + W, bottom: H }
}

/**
 * Keeps a device frame group’s axis-aligned bbox inside the nearest screenshot panel
 * so it cannot be dragged into gutters or past the artboard vertically.
 */
export function clampDeviceGroupToNearestPanel(target: Group): void {
  const id = getFabricObjectId(target)
  if (!id) return
  const rec = useDesignStore.getState().objects.find((o) => o.id === id)
  if (rec?.kind !== 'device') return

  const { screens, gap } = useDesignStore.getState().config
  if (screens < 1) return

  const b = target.getBoundingRect()
  const cx = b.left + b.width / 2
  const { left: pl, top: pt, right: pr, bottom: pb } = panelBoundsForDeviceCenter(
    cx,
    screens,
    gap,
  )

  let newBl = b.left
  let newBt = b.top

  const maxBl = pr - b.width
  const minBl = pl
  if (maxBl >= minBl) {
    newBl = Math.min(Math.max(b.left, minBl), maxBl)
  } else {
    newBl = pl + (APP_STORE_SCREEN_WIDTH - b.width) / 2
  }

  const maxBt = pb - b.height
  const minBt = pt
  if (maxBt >= minBt) {
    newBt = Math.min(Math.max(b.top, minBt), maxBt)
  } else {
    newBt = pt + (APP_STORE_SCREEN_HEIGHT - b.height) / 2
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
  /** Clamping during `object:moving` fights the pointer and feels janky; apply once the gesture ends. */
  const onModified = (opt: { target?: unknown }) => {
    const t = opt.target
    if (t instanceof Group && isDeviceGroup(t)) {
      clampDeviceGroupToNearestPanel(t)
    }
  }

  canvas.on('object:modified', onModified)
}
