import { useEffect, useReducer } from 'react'

import { findObjectOnCanvasByAppId } from '../../lib/fabricObjectRegistry'
import { useDesignStore } from '../../store/useDesignStore'

function formatPos(n: number): number {
  return Math.round(n * 10) / 10
}

export function ContextualPositionToolbar() {
  const selectedObject = useDesignStore((s) => s.selectedObject)
  const objects = useDesignStore((s) => s.objects)
  const fabricCanvas = useDesignStore((s) => s.fabricCanvas)
  const [, bump] = useReducer((n: number) => n + 1, 0)

  const isLayer =
    selectedObject != null && objects.some((o) => o.id === selectedObject)

  /**
   * Do not listen to `object:moving` / `object:scaling` / `object:rotating` here: those fire every
   * pointer frame and this component used `useReducer` → full React re-renders + controlled inputs
   * updating ~60×/s, which starves the main thread and makes Fabric drags feel stuttery.
   * Sync X/Y when the gesture completes via `object:modified` only.
   */
  useEffect(() => {
    if (!fabricCanvas || !isLayer) return
    const onBump = () => bump()
    fabricCanvas.on('object:modified', onBump)
    return () => {
      fabricCanvas.off('object:modified', onBump)
    }
  }, [fabricCanvas, isLayer])

  if (!isLayer || !selectedObject || !fabricCanvas) return null

  const target = findObjectOnCanvasByAppId(fabricCanvas, selectedObject)
  if (!target) return null

  const left = target.left ?? 0
  const top = target.top ?? 0

  const applyPosition = (patch: { left?: number; top?: number }) => {
    const canvas = useDesignStore.getState().fabricCanvas
    if (!canvas || !selectedObject) return
    const obj = findObjectOnCanvasByAppId(canvas, selectedObject)
    if (!obj) return
    obj.set(patch)
    obj.setCoords()
    canvas.requestRenderAll()
    bump()
  }

  return (
    <div
      className="ml-1 flex flex-wrap items-center gap-2 border-l border-zinc-700 pl-3"
      role="group"
      aria-label="Position"
    >
      <span className="hidden text-xs text-zinc-500 sm:inline">Position</span>
      <label className="flex items-center gap-1 text-xs text-zinc-400">
        <span className="w-3 shrink-0 font-medium">X</span>
        <input
          type="number"
          step="any"
          className="w-[4.5rem] rounded border border-zinc-700 bg-zinc-900 px-1.5 py-1 text-xs text-zinc-100 tabular-nums"
          value={formatPos(left)}
          onChange={(e) => {
            const n = Number(e.target.value)
            if (Number.isFinite(n)) applyPosition({ left: n })
          }}
          aria-label="X position in pixels"
        />
      </label>
      <label className="flex items-center gap-1 text-xs text-zinc-400">
        <span className="w-3 shrink-0 font-medium">Y</span>
        <input
          type="number"
          step="any"
          className="w-[4.5rem] rounded border border-zinc-700 bg-zinc-900 px-1.5 py-1 text-xs text-zinc-100 tabular-nums"
          value={formatPos(top)}
          onChange={(e) => {
            const n = Number(e.target.value)
            if (Number.isFinite(n)) applyPosition({ top: n })
          }}
          aria-label="Y position in pixels"
        />
      </label>
    </div>
  )
}
