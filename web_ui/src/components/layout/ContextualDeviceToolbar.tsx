import { Group } from 'fabric'
import { ImagePlus } from 'lucide-react'
import { useEffect, useReducer, useRef, useState, type ChangeEvent } from 'react'

import { applyScreenshotToDeviceGroup } from '../../canvas/applyScreenshotToDevice'
import { APP_STORE_SCREEN_WIDTH } from '../../constants/appStoreScreens'
import { findObjectOnCanvasByAppId } from '../../lib/fabricObjectRegistry'
import { useDesignStore } from '../../store/useDesignStore'

const DEVICE_SIZE_MIN_PX = 80
const DEVICE_SIZE_MAX_PX = Math.round(APP_STORE_SCREEN_WIDTH * 3)

function clampDeviceSizePx(n: number): number {
  if (!Number.isFinite(n)) return DEVICE_SIZE_MIN_PX
  return Math.min(DEVICE_SIZE_MAX_PX, Math.max(DEVICE_SIZE_MIN_PX, Math.round(n)))
}

export function ContextualDeviceToolbar() {
  const objects = useDesignStore((s) => s.objects)
  const selectedObject = useDesignStore((s) => s.selectedObject)
  const fabricCanvas = useDesignStore((s) => s.fabricCanvas)
  const [bumpCount, bump] = useReducer((n: number) => n + 1, 0)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [widthText, setWidthText] = useState('')
  const [heightText, setHeightText] = useState('')

  const deviceSelected =
    selectedObject != null &&
    objects.some((o) => o.id === selectedObject && o.kind === 'device')

  useEffect(() => {
    if (!fabricCanvas || !deviceSelected) return
    const onBump = () => bump()
    fabricCanvas.on('object:modified', onBump)
    fabricCanvas.on('object:scaling', onBump)
    fabricCanvas.on('object:rotating', onBump)
    return () => {
      fabricCanvas.off('object:modified', onBump)
      fabricCanvas.off('object:scaling', onBump)
      fabricCanvas.off('object:rotating', onBump)
    }
  }, [fabricCanvas, deviceSelected])

  useEffect(() => {
    if (!deviceSelected || !selectedObject || !fabricCanvas) return
    const target = findObjectOnCanvasByAppId(fabricCanvas, selectedObject)
    if (!(target instanceof Group)) return
    setWidthText(String(Math.round(target.getScaledWidth())))
    setHeightText(String(Math.round(target.getScaledHeight())))
  }, [deviceSelected, selectedObject, fabricCanvas, bumpCount])

  if (!deviceSelected || !selectedObject || !fabricCanvas) return null

  const target = findObjectOnCanvasByAppId(fabricCanvas, selectedObject)
  if (!(target instanceof Group)) return null

  const deviceAngleDeg = target.angle ?? 0

  const applyDeviceRotation = (deg: number) => {
    const canvas = useDesignStore.getState().fabricCanvas
    if (!canvas || !selectedObject) return
    const o = findObjectOnCanvasByAppId(canvas, selectedObject)
    if (!(o instanceof Group)) return
    const rec = useDesignStore.getState().objects.find((x) => x.id === selectedObject)
    if (rec?.kind !== 'device') return
    o.set({ angle: deg })
    o.setCoords()
    canvas.fire('object:modified', { target: o })
    canvas.requestRenderAll()
    bump()
  }

  const commitDeviceDimensions = () => {
    const canvas = useDesignStore.getState().fabricCanvas
    if (!canvas || !selectedObject) return
    const o = findObjectOnCanvasByAppId(canvas, selectedObject)
    if (!(o instanceof Group)) return
    const rec = useDesignStore.getState().objects.find((x) => x.id === selectedObject)
    if (rec?.kind !== 'device') return

    const wRaw = Number(widthText)
    const hRaw = Number(heightText)
    if (!Number.isFinite(wRaw) || !Number.isFinite(hRaw)) {
      setWidthText(String(Math.round(o.getScaledWidth())))
      setHeightText(String(Math.round(o.getScaledHeight())))
      return
    }

    const wPx = clampDeviceSizePx(wRaw)
    const hPx = clampDeviceSizePx(hRaw)

    const cw = o.getScaledWidth()
    const ch = o.getScaledHeight()
    if (cw < 1e-6 || ch < 1e-6) return

    const sx = (o.scaleX ?? 1) * (wPx / cw)
    const sy = (o.scaleY ?? 1) * (hPx / ch)
    o.set({ scaleX: sx, scaleY: sy })
    o.setCoords()
    canvas.fire('object:modified', { target: o })
    canvas.requestRenderAll()
    setWidthText(String(wPx))
    setHeightText(String(hPx))
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

      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        <label className="flex items-center gap-1.5 text-xs text-zinc-400">
          <span className="w-9 shrink-0 sm:w-10">Width</span>
          <input
            type="number"
            min={DEVICE_SIZE_MIN_PX}
            max={DEVICE_SIZE_MAX_PX}
            step={1}
            className="w-[4.5rem] rounded border border-zinc-700 bg-zinc-900 px-1.5 py-1 text-xs text-zinc-100 tabular-nums"
            value={widthText}
            onChange={(e) => setWidthText(e.target.value)}
            onBlur={() => commitDeviceDimensions()}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                ;(e.target as HTMLInputElement).blur()
              }
            }}
            aria-label="Device frame width in pixels"
          />
          <span className="text-[10px] text-zinc-600">px</span>
        </label>
        <label className="flex items-center gap-1.5 text-xs text-zinc-400">
          <span className="w-9 shrink-0 sm:w-10">Height</span>
          <input
            type="number"
            min={DEVICE_SIZE_MIN_PX}
            max={DEVICE_SIZE_MAX_PX}
            step={1}
            className="w-[4.5rem] rounded border border-zinc-700 bg-zinc-900 px-1.5 py-1 text-xs text-zinc-100 tabular-nums"
            value={heightText}
            onChange={(e) => setHeightText(e.target.value)}
            onBlur={() => commitDeviceDimensions()}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                ;(e.target as HTMLInputElement).blur()
              }
            }}
            aria-label="Device frame height in pixels"
          />
          <span className="text-[10px] text-zinc-600">px</span>
        </label>
        <label className="flex items-center gap-1.5 text-xs text-zinc-400">
          <span className="w-9 shrink-0 sm:w-10">Angle</span>
          <input
            type="number"
            step={1}
            className="w-[4.5rem] rounded border border-zinc-700 bg-zinc-900 px-1.5 py-1 text-xs text-zinc-100 tabular-nums"
            value={Math.round(deviceAngleDeg * 100) / 100}
            onChange={(e) => {
              const n = Number(e.target.value)
              if (Number.isFinite(n)) applyDeviceRotation(n)
            }}
            aria-label="Device rotation in degrees"
          />
          <span className="text-[10px] text-zinc-600">°</span>
        </label>
      </div>
    </div>
  )
}
