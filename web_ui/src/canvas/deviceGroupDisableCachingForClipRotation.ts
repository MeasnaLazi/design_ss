import type { Canvas, FabricObject } from 'fabric'
import { FabricImage, Group } from 'fabric'

import { getFabricObjectId } from '../lib/fabricObjectRegistry'
import { useDesignStore } from '../store/useDesignStore'

function isDeviceGroup(target: unknown): target is Group {
  if (!(target instanceof Group)) return false
  const id = getFabricObjectId(target)
  if (!id) return false
  const rec = useDesignStore.getState().objects.find((o) => o.id === id)
  return rec?.kind === 'device'
}

const ANGLE_EPS = 1e-3

/** Caching is unsafe when the device group is rotated/skewed (clip + bezel mis-compose). */
function deviceGroupEligibleForTranslateCache(group: Group): boolean {
  if (Math.abs(group.angle ?? 0) > ANGLE_EPS) return false
  if (Math.abs(group.skewX ?? 0) > ANGLE_EPS) return false
  if (Math.abs(group.skewY ?? 0) > ANGLE_EPS) return false
  return true
}

/**
 * While dragging at 0°/0 skew, cached bitmaps avoid repainting large clipped screenshots every
 * pointer frame. {@link markScreenshotImagesNoCache} restores the safe state on gesture end.
 */
function enableDeviceGroupTranslateCache(group: Group): void {
  if (group.objectCaching) return
  for (const o of group.getObjects()) {
    if (!(o instanceof FabricImage)) continue
    o.set({ objectCaching: true, dirty: true })
    o.setCoords()
    const cp = o.clipPath as FabricObject | undefined
    if (cp) {
      cp.set({ objectCaching: true, dirty: true })
    }
  }
  group.set({ objectCaching: true, dirty: true })
}

/** Screenshot(s) sit before the bezel image (last child). */
function markScreenshotImagesNoCache(group: Group): void {
  const objs = group.getObjects()
  for (let i = 0; i < objs.length - 1; i++) {
    const o = objs[i]
    if (!(o instanceof FabricImage)) continue
    /**
     * Rotation must come only from the device {@link Group}; the image stays at 0° in group space.
     * Copying `group.angle` onto the child stacked transforms (~50° + ~50°).
     */
    o.set({
      objectCaching: false,
      angle: 0,
      skewX: 0,
      skewY: 0,
      lockRotation: true,
      dirty: true,
    })
    o.setCoords()
    const cp = o.clipPath as FabricObject | undefined
    if (cp) {
      cp.set({ objectCaching: false, dirty: true })
    }
  }
  const frame = objs[objs.length - 1]
  if (frame instanceof FabricImage) {
    frame.set({ objectCaching: false, dirty: true })
    frame.setCoords()
  }
  group.set({ objectCaching: false, dirty: true })
}

/**
 * Fabric can rasterize clipped images incorrectly when a {@link Group} rotates; ensure device
 * groups (including ones created before `objectCaching: false` was set) opt out of caching.
 */
export function attachDeviceGroupNoCacheForScreenshotClip(canvas: Canvas): void {
  const refresh = (opt: { target?: FabricObject }) => {
    const t = opt.target
    if (!isDeviceGroup(t)) return
    markScreenshotImagesNoCache(t)
  }

  const onMoving = (opt: { target?: FabricObject }) => {
    const t = opt.target
    if (!isDeviceGroup(t)) return
    if (!deviceGroupEligibleForTranslateCache(t)) return
    enableDeviceGroupTranslateCache(t)
  }

  const onModified = (opt: { target?: FabricObject }) => {
    const t = opt.target
    if (!isDeviceGroup(t)) return
    /**
     * Pure translate at 0° keeps translate-cache enabled during the drag; flipping back to
     * no-cache on `object:modified` repaints the bezel/screenshot and looks like a drop jump.
     */
    if (deviceGroupEligibleForTranslateCache(t)) {
      enableDeviceGroupTranslateCache(t)
    } else {
      markScreenshotImagesNoCache(t)
    }
  }

  canvas.on('object:moving', onMoving)
  canvas.on('object:rotating', refresh)
  canvas.on('object:scaling', refresh)
  canvas.on('object:modified', onModified)
}
