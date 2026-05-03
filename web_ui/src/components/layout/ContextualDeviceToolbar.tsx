import { Group } from 'fabric'
import { ImagePlus } from 'lucide-react'
import { useEffect, useReducer, useRef, useState, type ChangeEvent } from 'react'

import { applyScreenshotToDeviceGroup } from '../../canvas/applyScreenshotToDevice'
import { getArtboardDimensionsFromConfig } from '../../constants/artboardPresets'
import { findObjectOnCanvasByAppId } from '../../lib/fabricObjectRegistry'
import { useDesignStore } from '../../store/useDesignStore'

const DEVICE_SIZE_MIN_PX = 80

function clampDeviceSizePx(n: number, maxPx: number): number {
  if (!Number.isFinite(n)) return DEVICE_SIZE_MIN_PX
  return Math.min(maxPx, Math.max(DEVICE_SIZE_MIN_PX, Math.round(n)))
}

export function ContextualDeviceToolbar() {
  const objects = useDesignStore((s) => s.objects)
  const selectedObject = useDesignStore((s) => s.selectedObject)
  const fabricCanvas = useDesignStore((s) => s.fabricCanvas)
  const panelWidth = useDesignStore(
    (s) => getArtboardDimensionsFromConfig(s.config).width,
  )
  const deviceSizeMaxPx = Math.round(panelWidth * 3)
  const [bumpCount, bump] = useReducer((n: number) => n + 1, 0)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const widthFieldFocusedRef = useRef(false)
  const heightFieldFocusedRef = useRef(false)
  const angleFieldFocusedRef = useRef(false)
  const [widthText, setWidthText] = useState('')
  const [heightText, setHeightText] = useState('')
  const [angleText, setAngleText] = useState('')

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
    const w = String(Math.round(target.getScaledWidth()))
    const h = String(Math.round(target.getScaledHeight()))
    const a = String(Math.round((target.angle ?? 0) * 100) / 100)
    queueMicrotask(() => {
      if (!widthFieldFocusedRef.current) setWidthText(w)
      if (!heightFieldFocusedRef.current) setHeightText(h)
      if (!angleFieldFocusedRef.current) setAngleText(a)
    })
  }, [deviceSelected, selectedObject, fabricCanvas, bumpCount])

  if (!deviceSelected || !selectedObject || !fabricCanvas) return null

  const target = findObjectOnCanvasByAppId(fabricCanvas, selectedObject)
  if (!(target instanceof Group)) return null

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

    const trimmedW = widthText.trim()
    const trimmedH = heightText.trim()
    if (trimmedW === '' || trimmedH === '') {
      setWidthText(String(Math.round(o.getScaledWidth())))
      setHeightText(String(Math.round(o.getScaledHeight())))
      return
    }
    const wRaw = Number(trimmedW)
    const hRaw = Number(trimmedH)
    if (!Number.isFinite(wRaw) || !Number.isFinite(hRaw) || wRaw <= 0 || hRaw <= 0) {
      setWidthText(String(Math.round(o.getScaledWidth())))
      setHeightText(String(Math.round(o.getScaledHeight())))
      return
    }

    const wPx = clampDeviceSizePx(wRaw, deviceSizeMaxPx)
    const hPx = clampDeviceSizePx(hRaw, deviceSizeMaxPx)

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

  const commitDeviceAngle = () => {
    const canvas = useDesignStore.getState().fabricCanvas
    if (!canvas || !selectedObject) return
    const o = findObjectOnCanvasByAppId(canvas, selectedObject)
    if (!(o instanceof Group)) return
    const trimmed = angleText.trim()
    if (trimmed === '') {
      setAngleText(String(Math.round((o.angle ?? 0) * 100) / 100))
      return
    }
    const n = Number(trimmed)
    if (!Number.isFinite(n)) {
      setAngleText(String(Math.round((o.angle ?? 0) * 100) / 100))
      return
    }
    applyDeviceRotation(n)
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
            type="text"
            inputMode="numeric"
            className="w-[4.5rem] rounded border border-zinc-700 bg-zinc-900 px-1.5 py-1 text-xs text-zinc-100 tabular-nums"
            value={widthText}
            onFocus={() => {
              widthFieldFocusedRef.current = true
            }}
            onChange={(e) => setWidthText(e.target.value)}
            onBlur={() => {
              widthFieldFocusedRef.current = false
              commitDeviceDimensions()
            }}
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
            type="text"
            inputMode="numeric"
            className="w-[4.5rem] rounded border border-zinc-700 bg-zinc-900 px-1.5 py-1 text-xs text-zinc-100 tabular-nums"
            value={heightText}
            onFocus={() => {
              heightFieldFocusedRef.current = true
            }}
            onChange={(e) => setHeightText(e.target.value)}
            onBlur={() => {
              heightFieldFocusedRef.current = false
              commitDeviceDimensions()
            }}
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
            type="text"
            inputMode="decimal"
            className="w-[4.5rem] rounded border border-zinc-700 bg-zinc-900 px-1.5 py-1 text-xs text-zinc-100 tabular-nums"
            value={angleText}
            onFocus={() => {
              angleFieldFocusedRef.current = true
              setAngleText(String(Math.round((target.angle ?? 0) * 100) / 100))
            }}
            onChange={(e) => setAngleText(e.target.value)}
            onBlur={() => {
              angleFieldFocusedRef.current = false
              commitDeviceAngle()
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                ;(e.target as HTMLInputElement).blur()
              }
            }}
            aria-label="Device rotation in degrees"
          />
          <span className="text-[10px] text-zinc-600">°</span>
        </label>
      </div>
    </div>
  )
}
