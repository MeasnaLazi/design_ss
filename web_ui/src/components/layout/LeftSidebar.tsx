import { useRef, useState, type ChangeEvent } from 'react'
import {
  ImageIcon,
  ImagePlus,
  Layers,
  Palette,
  Shapes,
  Smartphone,
  Type,
} from 'lucide-react'

import { addDeviceFrameToCanvas } from '../../canvas/addDeviceFrameToCanvas'
import { addTextboxToCanvas } from '../../canvas/addTextboxToCanvas'
import {
  SCREEN_LAYOUT_COUNT_MAX,
  SCREEN_LAYOUT_COUNT_MIN,
  SCREEN_LAYOUT_GAP_MAX,
  SCREEN_LAYOUT_GAP_MIN,
} from '../../constants/appStoreScreens'
import { useDesignStore } from '../../store/useDesignStore'

type CanvasFillTab = 'solid' | 'gradient' | 'image'

export function LeftSidebar() {
  const objects = useDesignStore((s) => s.objects)
  const selectedObject = useDesignStore((s) => s.selectedObject)
  const background = useDesignStore((s) => s.config.background)
  const backgroundGradient = useDesignStore((s) => s.config.backgroundGradient)
  const backgroundImageUrl = useDesignStore((s) => s.config.backgroundImageUrl)
  const screens = useDesignStore((s) => s.config.screens)
  const gap = useDesignStore((s) => s.config.gap)
  const setConfig = useDesignStore((s) => s.setConfig)
  const clearCanvasBackgroundImage = useDesignStore((s) => s.clearCanvasBackgroundImage)

  const [canvasFillTab, setCanvasFillTab] = useState<CanvasFillTab>(() => {
    const c = useDesignStore.getState().config
    if (c.backgroundImageUrl) return 'image'
    if (c.backgroundMode === 'gradient') return 'gradient'
    return 'solid'
  })

  const canvasBgInputRef = useRef<HTMLInputElement>(null)

  const handleAddText = () => {
    const canvas = useDesignStore.getState().fabricCanvas
    if (!canvas) {
      console.warn('[LeftSidebar] add text: no canvas')
      return
    }
    addTextboxToCanvas(canvas)
  }

  const handleAddDevice = async () => {
    const canvas = useDesignStore.getState().fabricCanvas
    if (!canvas) {
      console.warn('[LeftSidebar] add device: no canvas')
      return
    }
    try {
      await addDeviceFrameToCanvas(canvas)
    } catch (e) {
      console.error('[LeftSidebar] add device failed', e)
    }
  }

  const openCanvasBackgroundPicker = () => {
    canvasBgInputRef.current?.click()
  }

  const handleCanvasBackgroundFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const fr = new FileReader()
    fr.onload = () => {
      const url = typeof fr.result === 'string' ? fr.result : ''
      if (url) {
        setConfig({ backgroundImageUrl: url })
        setCanvasFillTab('image')
        console.log('[LeftSidebar] canvas background image set')
      }
    }
    fr.readAsDataURL(file)
  }

  const sortedLayers = [...objects].sort((a, b) => b.zIndex - a.zIndex)

  return (
    <aside
      className="flex w-60 shrink-0 flex-col border-r border-zinc-800 bg-zinc-900/50"
      aria-label="Assets and layers"
    >
      <div className="border-b border-zinc-800 p-3">
        <h2 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-zinc-500">
          <Palette className="size-3.5" aria-hidden />
          Canvas
        </h2>
        <p className="mt-1 text-[11px] leading-snug text-zinc-600">
          Solid or gradient base fill per panel; optional image stacks on top. Gutters
          between panels use a neutral fill.
        </p>
        <div
          className="mt-2 flex rounded-md border border-zinc-800 p-0.5"
          role="tablist"
          aria-label="Canvas fill type"
        >
          <button
            type="button"
            role="tab"
            aria-selected={canvasFillTab === 'solid'}
            onClick={() => {
              setCanvasFillTab('solid')
              setConfig({ backgroundMode: 'solid' })
            }}
            className={`min-w-0 flex-1 rounded px-1.5 py-1.5 text-[11px] font-medium sm:px-2 sm:text-xs ${
              canvasFillTab === 'solid'
                ? 'bg-zinc-700 text-zinc-100'
                : 'text-zinc-400 hover:bg-zinc-800/80'
            }`}
          >
            Solid
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={canvasFillTab === 'gradient'}
            onClick={() => {
              setCanvasFillTab('gradient')
              setConfig({ backgroundMode: 'gradient' })
            }}
            className={`min-w-0 flex-1 rounded px-1.5 py-1.5 text-[11px] font-medium sm:px-2 sm:text-xs ${
              canvasFillTab === 'gradient'
                ? 'bg-zinc-700 text-zinc-100'
                : 'text-zinc-400 hover:bg-zinc-800/80'
            }`}
          >
            Gradient
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={canvasFillTab === 'image'}
            onClick={() => setCanvasFillTab('image')}
            className={`min-w-0 flex-1 rounded px-1.5 py-1.5 text-[11px] font-medium sm:px-2 sm:text-xs ${
              canvasFillTab === 'image'
                ? 'bg-zinc-700 text-zinc-100'
                : 'text-zinc-400 hover:bg-zinc-800/80'
            }`}
          >
            Image
          </button>
        </div>

        {canvasFillTab === 'solid' ? (
          <label className="mt-2 flex items-center gap-2 text-xs text-zinc-400">
            <span className="w-14 shrink-0">Color</span>
            <input
              type="color"
              className="h-8 w-full max-w-[7rem] cursor-pointer rounded border border-zinc-700 bg-zinc-900 p-0.5"
              value={
                background.startsWith('#') && background.length >= 7
                  ? background.slice(0, 7)
                  : '#1a1a1a'
              }
              onChange={(e) => setConfig({ background: e.target.value })}
            />
          </label>
        ) : null}

        {canvasFillTab === 'gradient' ? (
          <div className="mt-2 space-y-2">
            <label className="flex items-center gap-2 text-xs text-zinc-400">
              <span className="w-14 shrink-0">From</span>
              <input
                type="color"
                className="h-8 w-full max-w-[7rem] cursor-pointer rounded border border-zinc-700 bg-zinc-900 p-0.5"
                value={
                  backgroundGradient.colorFrom.startsWith('#') &&
                  backgroundGradient.colorFrom.length >= 7
                    ? backgroundGradient.colorFrom.slice(0, 7)
                    : '#0f172a'
                }
                onChange={(e) =>
                  setConfig({ backgroundGradient: { colorFrom: e.target.value } })
                }
              />
            </label>
            <label className="flex items-center gap-2 text-xs text-zinc-400">
              <span className="w-14 shrink-0">To</span>
              <input
                type="color"
                className="h-8 w-full max-w-[7rem] cursor-pointer rounded border border-zinc-700 bg-zinc-900 p-0.5"
                value={
                  backgroundGradient.colorTo.startsWith('#') &&
                  backgroundGradient.colorTo.length >= 7
                    ? backgroundGradient.colorTo.slice(0, 7)
                    : '#1e293b'
                }
                onChange={(e) =>
                  setConfig({ backgroundGradient: { colorTo: e.target.value } })
                }
              />
            </label>
            <div>
              <div className="flex items-center justify-between text-xs text-zinc-400">
                <span>Angle</span>
                <span className="tabular-nums text-zinc-500">
                  {Math.round(backgroundGradient.angleDeg)}°
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={360}
                step={1}
                className="mt-1 w-full accent-emerald-500"
                value={((backgroundGradient.angleDeg % 360) + 360) % 360}
                onChange={(e) =>
                  setConfig({
                    backgroundGradient: {
                      angleDeg: Number(e.target.value),
                    },
                  })
                }
                aria-label="Gradient angle in degrees"
              />
              <p className="mt-0.5 text-[10px] leading-tight text-zinc-600">
                0° → right, 90° → down, 180° → left.
              </p>
            </div>
          </div>
        ) : null}

        {canvasFillTab === 'image' ? (
          <div className="mt-2 space-y-2">
            <p className="text-[11px] leading-snug text-zinc-600">
              Cover-crops per screenshot panel; solid or gradient still shows underneath
              if the image has transparency.
            </p>
            <button
              type="button"
              onClick={openCanvasBackgroundPicker}
              className="flex w-full items-center gap-2 rounded-md border border-zinc-700 bg-zinc-800/80 px-2 py-2 text-sm text-zinc-100 hover:bg-zinc-800"
            >
              <ImagePlus className="size-4 shrink-0" aria-hidden />
              Choose background…
            </button>
            {backgroundImageUrl != null && backgroundImageUrl.length > 0 ? (
              <button
                type="button"
                onClick={() => clearCanvasBackgroundImage()}
                className="w-full rounded-md border border-zinc-700/80 px-2 py-1.5 text-left text-xs text-zinc-300 hover:border-zinc-600 hover:bg-zinc-800/60"
              >
                Remove background
              </button>
            ) : null}
            <input
              ref={canvasBgInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleCanvasBackgroundFile}
            />
          </div>
        ) : null}

        <div className="mt-3 space-y-2 border-t border-zinc-800 pt-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
            Screenshot layout
          </h3>
          <p className="text-[11px] leading-snug text-zinc-600">
            Side-by-side App Store panels (6.7&quot; portrait) with a fixed gap between
            each.
          </p>
          <label className="flex items-center gap-2 text-xs text-zinc-400">
            <span className="w-14 shrink-0">Count</span>
            <input
              type="number"
              min={SCREEN_LAYOUT_COUNT_MIN}
              max={SCREEN_LAYOUT_COUNT_MAX}
              className="min-w-0 flex-1 rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100 tabular-nums"
              value={screens}
              onChange={(e) => {
                const v = parseInt(e.target.value, 10)
                if (!Number.isNaN(v)) setConfig({ screens: v })
              }}
            />
          </label>
          <label className="flex items-center gap-2 text-xs text-zinc-400">
            <span className="w-14 shrink-0">Gap (px)</span>
            <input
              type="number"
              min={SCREEN_LAYOUT_GAP_MIN}
              max={SCREEN_LAYOUT_GAP_MAX}
              step={5}
              className="min-w-0 flex-1 rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100 tabular-nums"
              value={gap}
              onChange={(e) => {
                const v = parseInt(e.target.value, 10)
                if (!Number.isNaN(v)) setConfig({ gap: v })
              }}
            />
          </label>
        </div>
      </div>

      <div className="border-b border-zinc-800 p-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
          Assets
        </h2>
        <ul className="mt-2 space-y-1">
          <li>
            <button
              type="button"
              onClick={handleAddText}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-zinc-200 hover:bg-zinc-800"
            >
              <Type className="size-4 shrink-0" aria-hidden />
              Text
            </button>
          </li>
          <li>
            <button
              type="button"
              onClick={handleAddDevice}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-zinc-200 hover:bg-zinc-800"
            >
              <Smartphone className="size-4 shrink-0" aria-hidden />
              Device frame
            </button>
          </li>
          <li>
            <button
              type="button"
              disabled
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-zinc-400 opacity-60"
              title="Available in a later phase"
            >
              <Shapes className="size-4 shrink-0" aria-hidden />
              Shapes
            </button>
          </li>
          <li>
            <button
              type="button"
              disabled
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-zinc-400 opacity-60"
              title="Available in a later phase"
            >
              <ImageIcon className="size-4 shrink-0" aria-hidden />
              Images
            </button>
          </li>
        </ul>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-auto p-3">
        <h2 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-zinc-500">
          <Layers className="size-3.5" aria-hidden />
          Layers
        </h2>
        {sortedLayers.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-600">No layers yet.</p>
        ) : (
          <ul className="mt-2 space-y-1">
            {sortedLayers.map((o) => (
              <li key={o.id}>
                <span
                  className={`block truncate rounded px-2 py-1 text-sm ${
                    selectedObject === o.id
                      ? 'bg-zinc-800 text-zinc-100'
                      : 'text-zinc-400'
                  }`}
                >
                  {o.name}
                  <span className="ml-1 text-xs text-zinc-600">({o.kind})</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  )
}
