import { Group } from 'fabric'
import { ImagePlus } from 'lucide-react'
import { useEffect, useReducer, useRef, type ChangeEvent } from 'react'

import { applyScreenshotToDeviceGroup } from '../../canvas/applyScreenshotToDevice'
import { findObjectOnCanvasByAppId } from '../../lib/fabricObjectRegistry'
import { useDesignStore } from '../../store/useDesignStore'

export function ContextualDeviceToolbar() {
  const objects = useDesignStore((s) => s.objects)
  const selectedObject = useDesignStore((s) => s.selectedObject)
  const fabricCanvas = useDesignStore((s) => s.fabricCanvas)
  const [, bump] = useReducer((n: number) => n + 1, 0)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const deviceSelected =
    selectedObject != null &&
    objects.some((o) => o.id === selectedObject && o.kind === 'device')

  useEffect(() => {
    if (!fabricCanvas || !deviceSelected) return
    const onBump = () => bump()
    fabricCanvas.on('object:rotating', onBump)
    fabricCanvas.on('object:modified', onBump)
    fabricCanvas.on('object:scaling', onBump)
    return () => {
      fabricCanvas.off('object:rotating', onBump)
      fabricCanvas.off('object:modified', onBump)
      fabricCanvas.off('object:scaling', onBump)
    }
  }, [fabricCanvas, deviceSelected])

  if (!deviceSelected || !selectedObject || !fabricCanvas) return null

  const target = findObjectOnCanvasByAppId(fabricCanvas, selectedObject)
  if (!(target instanceof Group)) return null

  const deviceAngleDeg = target.angle ?? 0
  const normalizedAngle = ((deviceAngleDeg % 360) + 360) % 360

  const applyDeviceRotation = (deg: number) => {
    const canvas = useDesignStore.getState().fabricCanvas
    if (!canvas || !selectedObject) return
    const o = findObjectOnCanvasByAppId(canvas, selectedObject)
    if (!(o instanceof Group)) return
    const rec = useDesignStore.getState().objects.find((x) => x.id === selectedObject)
    if (rec?.kind !== 'device') return
    o.set({ angle: deg })
    o.setCoords()
    canvas.requestRenderAll()
    bump()
  }

  const openScreenshotPicker = () => fileInputRef.current?.click()

  const handleScreenshotFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !selectedObject) return
    const canvas = useDesignStore.getState().fabricCanvas
    if (!canvas) return
    try {
      await applyScreenshotToDeviceGroup(canvas, selectedObject, file)
      bump()
    } catch (err) {
      console.error('[ContextualDeviceToolbar] upload screenshot failed', err)
    }
  }

  return (
    <div
      className="flex max-w-full flex-wrap items-center gap-2 sm:gap-3"
      role="toolbar"
      aria-label="Device frame"
    >
      <button
        type="button"
        onClick={openScreenshotPicker}
        className="flex items-center gap-1.5 rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs font-medium text-zinc-100 hover:bg-zinc-700"
      >
        <ImagePlus className="size-3.5 shrink-0" aria-hidden />
        <span className="hidden sm:inline">Screenshot</span>
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleScreenshotFile}
      />

      <div className="flex min-w-0 max-w-[11rem] flex-1 items-center gap-2 sm:max-w-[14rem]">
        <span className="hidden shrink-0 text-xs text-zinc-500 sm:inline">Rotate</span>
        <input
          type="range"
          min={0}
          max={360}
          step={1}
          className="min-w-0 flex-1 accent-emerald-500"
          value={normalizedAngle}
          onChange={(e) => applyDeviceRotation(Number(e.target.value))}
          aria-label="Device rotation in degrees"
        />
        <span className="w-8 shrink-0 text-right text-xs tabular-nums text-zinc-400">
          {Math.round(normalizedAngle)}°
        </span>
      </div>

      <label className="flex items-center gap-1.5 text-xs text-zinc-400">
        <span className="hidden sm:inline">Angle</span>
        <input
          type="number"
          step={1}
          className="w-14 rounded border border-zinc-700 bg-zinc-900 px-1.5 py-1 text-xs text-zinc-100 tabular-nums"
          value={Math.round(deviceAngleDeg * 100) / 100}
          onChange={(e) => {
            const n = Number(e.target.value)
            if (Number.isFinite(n)) applyDeviceRotation(n)
          }}
        />
      </label>
    </div>
  )
}
