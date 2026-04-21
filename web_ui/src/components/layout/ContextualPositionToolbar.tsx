import { useCallback, useEffect, useReducer, useState } from 'react'

import { findObjectOnCanvasByAppId } from '../../lib/fabricObjectRegistry'
import { useDesignStore } from '../../store/useDesignStore'

function formatPos(n: number): number {
  return Math.round(n * 10) / 10
}

function posToInputString(n: number): string {
  const v = formatPos(n)
  return Number.isInteger(v) ? String(v) : String(v)
}

export function ContextualPositionToolbar() {
  const selectedObject = useDesignStore((s) => s.selectedObject)
  const objects = useDesignStore((s) => s.objects)
  const fabricCanvas = useDesignStore((s) => s.fabricCanvas)
  const [, bump] = useReducer((n: number) => n + 1, 0)
  const [leftDraft, setLeftDraft] = useState<string | null>(null)
  const [topDraft, setTopDraft] = useState<string | null>(null)

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

  useEffect(() => {
    setLeftDraft(null)
    setTopDraft(null)
  }, [selectedObject])

  const applyPosition = useCallback(
    (patch: { left?: number; top?: number }) => {
      const canvas = useDesignStore.getState().fabricCanvas
      const id = useDesignStore.getState().selectedObject
      if (!canvas || !id) return
      const obj = findObjectOnCanvasByAppId(canvas, id)
      if (!obj) return
      obj.set(patch)
      obj.setCoords()
      canvas.requestRenderAll()
      bump()
    },
    [],
  )

  if (!isLayer || !selectedObject || !fabricCanvas) return null

  const target = findObjectOnCanvasByAppId(fabricCanvas, selectedObject)
  if (!target) return null

  const left = target.left ?? 0
  const top = target.top ?? 0

  const commitLeft = () => {
    if (leftDraft == null) return
    const trimmed = leftDraft.trim()
    setLeftDraft(null)
    if (trimmed === '') return
    const n = Number(trimmed)
    if (!Number.isFinite(n)) return
    applyPosition({ left: n })
  }

  const commitTop = () => {
    if (topDraft == null) return
    const trimmed = topDraft.trim()
    setTopDraft(null)
    if (trimmed === '') return
    const n = Number(trimmed)
    if (!Number.isFinite(n)) return
    applyPosition({ top: n })
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
          type="text"
          inputMode="decimal"
          className="w-[4.5rem] rounded border border-zinc-700 bg-zinc-900 px-1.5 py-1 text-xs text-zinc-100 tabular-nums"
          value={leftDraft ?? posToInputString(left)}
          onFocus={() => setLeftDraft(posToInputString(left))}
          onChange={(e) => setLeftDraft(e.target.value)}
          onBlur={() => commitLeft()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              ;(e.target as HTMLInputElement).blur()
            }
          }}
          aria-label="X position in pixels"
        />
      </label>
      <label className="flex items-center gap-1 text-xs text-zinc-400">
        <span className="w-3 shrink-0 font-medium">Y</span>
        <input
          type="text"
          inputMode="decimal"
          className="w-[4.5rem] rounded border border-zinc-700 bg-zinc-900 px-1.5 py-1 text-xs text-zinc-100 tabular-nums"
          value={topDraft ?? posToInputString(top)}
          onFocus={() => setTopDraft(posToInputString(top))}
          onChange={(e) => setTopDraft(e.target.value)}
          onBlur={() => commitTop()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              ;(e.target as HTMLInputElement).blur()
            }
          }}
          aria-label="Y position in pixels"
        />
      </label>
    </div>
  )
}
