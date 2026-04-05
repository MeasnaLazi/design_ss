import type { Canvas, Transform } from 'fabric'
import { Group } from 'fabric'

import { getFabricObjectId } from '../lib/fabricObjectRegistry'
import { useDesignStore } from '../store/useDesignStore'

function isDeviceGroup(target: unknown): target is Group {
  if (!(target instanceof Group)) return false
  const id = getFabricObjectId(target)
  if (!id) return false
  const rec = useDesignStore.getState().objects.find((o) => o.id === id)
  return rec?.kind === 'device'
}

/**
 * Keeps scaleX:scaleY equal to the ratio at the start of the gesture so the frame
 * does not stretch when using side handles or non-uniform corner scaling.
 */
function syncDeviceGroupScales(target: Group, transform: Transform): void {
  const corner = transform.corner
  const ox = transform.original.scaleX
  const oy = transform.original.scaleY
  if (Math.abs(ox) < 1e-9 || Math.abs(oy) < 1e-9) return

  const r = oy / ox

  if (corner === 'ml' || corner === 'mr') {
    target.set({ scaleY: target.scaleX * r })
  } else if (corner === 'mt' || corner === 'mb') {
    target.set({ scaleX: target.scaleY / r })
  } else {
    const dsx = Math.abs(target.scaleX - ox)
    const dsy = Math.abs(target.scaleY - oy)
    if (dsx >= dsy) {
      target.set({ scaleY: target.scaleX * r })
    } else {
      target.set({ scaleX: target.scaleY / r })
    }
  }

  target.set('dirty', true)
  target.setCoords()
}

export function attachDeviceGroupUniformScaling(canvas: Canvas): void {
  const onScaling = (opt: { transform: Transform }) => {
    const { transform } = opt
    const target = transform.target
    if (!isDeviceGroup(target)) return
    syncDeviceGroupScales(target, transform)
    canvas.requestRenderAll()
  }

  canvas.on('object:scaling', onScaling)
}
