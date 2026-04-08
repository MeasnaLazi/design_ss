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

/** Screenshot(s) sit before the bezel image (last child). */
function markScreenshotImagesNoCache(group: Group): void {
  const objs = group.getObjects()
  if (objs.length < 2) return
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

  canvas.on('object:rotating', refresh)
  canvas.on('object:scaling', refresh)
  canvas.on('object:modified', refresh)
}
