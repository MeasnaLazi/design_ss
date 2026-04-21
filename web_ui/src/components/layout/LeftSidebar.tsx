import { useMemo, useRef, useState, type ChangeEvent } from 'react'
import {
  ChevronDown,
  ChevronUp,
  GripVertical,
  ImagePlus,
  Layers,
  Palette,
  Smartphone,
  Trash2,
  Type,
} from 'lucide-react'

import { addDeviceFrameToCanvas } from '../../canvas/addDeviceFrameToCanvas'
import { addTextboxToCanvas } from '../../canvas/addTextboxToCanvas'
import { deleteLayerById, selectLayerById } from '../../canvas/deleteLayerById'
import {
  getUserLayerIdsBottomToTop,
  moveLayerById,
} from '../../canvas/moveLayerOrder'
import {
  ARTBOARD_PRESETS,
  type ArtboardPresetId,
  screenshotBucketForConfig,
} from '../../constants/artboardPresets'
import {
  SCREEN_LAYOUT_COUNT_MAX,
  SCREEN_LAYOUT_COUNT_MIN,
  SCREEN_LAYOUT_GAP_MAX,
  SCREEN_LAYOUT_GAP_MIN,
} from '../../constants/appStoreScreens'
import {
  ASSET_DRAG_KIND_TEXT,
  ASSET_DRAG_MIME,
} from '../../constants/assetDrag'
import { activePackStyles, DEVICE_FRAME_TYPES, type DeviceFrameType } from '../../lib/deviceFrameCatalog'
import { useDeviceFramePackStore } from '../../store/useDeviceFramePackStore'
import { uploadScreenshotFile } from '../../lib/datasourceScreenshotsApi'
import { useDesignStore } from '../../store/useDesignStore'
import { useToastStore } from '../../store/useToastStore'

type CanvasFillTab = 'solid' | 'gradient' | 'image'

export function LeftSidebar() {
  const objects = useDesignStore((s) => s.objects)
  const fabricCanvas = useDesignStore((s) => s.fabricCanvas)
  const selectedObject = useDesignStore((s) => s.selectedObject)
  const background = useDesignStore((s) => s.config.background)
  const backgroundGradient = useDesignStore((s) => s.config.backgroundGradient)
  const backgroundImageUrl = useDesignStore((s) => s.config.backgroundImageUrl)
  const screens = useDesignStore((s) => s.config.screens)
  const gap = useDesignStore((s) => s.config.gap)
  const artboardPresetId = useDesignStore((s) => s.config.artboardPresetId)
  const setConfig = useDesignStore((s) => s.setConfig)
  const clearCanvasBackgroundImage = useDesignStore((s) => s.clearCanvasBackgroundImage)

  const [canvasFillTab, setCanvasFillTab] = useState<CanvasFillTab>(() => {
    const c = useDesignStore.getState().config
    if (c.backgroundImageUrl) return 'image'
    if (c.backgroundMode === 'gradient') return 'gradient'
    return 'solid'
  })

  const devices = useDeviceFramePackStore((s) => s.devices)
  const registryStatus = useDeviceFramePackStore((s) => s.status)
  const registryError = useDeviceFramePackStore((s) => s.errorMessage)
  const selectedDeviceType = useDeviceFramePackStore((s) => s.selectedDeviceType)
  const selectedPackId = useDeviceFramePackStore((s) => s.selectedPackId)
  const selectedFrameName = useDeviceFramePackStore((s) => s.selectedFrameName)
  const setSelectedDeviceType = useDeviceFramePackStore((s) => s.setSelectedDeviceType)
  const setSelectedPackId = useDeviceFramePackStore((s) => s.setSelectedPackId)
  const setSelectedFrameName = useDeviceFramePackStore((s) => s.setSelectedFrameName)

  const devicesOfType = useMemo(
    () => devices.filter((d) => d.manifest.type === selectedDeviceType),
    [devices, selectedDeviceType],
  )

  const packStyles = useMemo(
    () => activePackStyles(devices, selectedPackId),
    [devices, selectedPackId],
  )

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
      await addDeviceFrameToCanvas(canvas, selectedFrameName)
    } catch (e) {
      console.error('[LeftSidebar] add device failed', e)
    }
  }

  const openCanvasBackgroundPicker = () => {
    canvasBgInputRef.current?.click()
  }

  const handleCanvasBackgroundFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const applyDataUrl = () => {
      const fr = new FileReader()
      fr.onload = () => {
        const url = typeof fr.result === 'string' ? fr.result : ''
        if (url) {
          setConfig({ backgroundImageUrl: url })
          setCanvasFillTab('image')
          console.log('[LeftSidebar] canvas background image set (embedded)')
        }
      }
      fr.readAsDataURL(file)
    }
    try {
      const bucket = screenshotBucketForConfig(useDesignStore.getState().config)
      const url = await uploadScreenshotFile(file, { bucket })
      setConfig({ backgroundImageUrl: url })
      setCanvasFillTab('image')
      console.log('[LeftSidebar] canvas background image set')
    } catch {
      useToastStore
        .getState()
        .showToast(
          'Saved as embedded image; dev server required to store under datasource.',
          'warning',
        )
      applyDataUrl()
    }
  }

  const sortedLayers = [...objects].sort((a, b) => b.zIndex - a.zIndex)

  return (
    <aside
      className="flex min-h-0 w-60 shrink-0 flex-col overflow-y-auto overflow-x-hidden border-r border-zinc-800 bg-zinc-900/50"
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
            Each preset uses its own{' '}
            <code className="rounded bg-zinc-800 px-0.5 text-[10px] text-zinc-400">
              display_*.json
            </code>{' '}
            in datasource: switching preset loads that file (or a blank layout if missing). Saves go to
            the same file.
          </p>
          <label className="flex flex-col gap-1 text-xs text-zinc-400">
            <span className="font-medium text-zinc-500">Artboard preset</span>
            <select
              className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100"
              value={artboardPresetId}
              onChange={(e) =>
                setConfig({ artboardPresetId: e.target.value as ArtboardPresetId })
              }
              aria-label="Artboard export preset"
            >
              {ARTBOARD_PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label} ({p.width}×{p.height})
                </option>
              ))}
            </select>
          </label>
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
          <li className="flex items-stretch gap-0.5">
            <button
              type="button"
              onClick={handleAddText}
              className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-zinc-200 hover:bg-zinc-800"
            >
              <Type className="size-4 shrink-0" aria-hidden />
              Text
            </button>
            <button
              type="button"
              draggable
              title="Drag onto canvas to place text"
              aria-label="Drag text onto canvas"
              className="flex shrink-0 items-center justify-center rounded-md border border-zinc-800 px-1.5 text-zinc-500 hover:border-zinc-600 hover:bg-zinc-800 hover:text-zinc-300"
              onDragStart={(e) => {
                e.dataTransfer.setData(ASSET_DRAG_MIME, ASSET_DRAG_KIND_TEXT)
                e.dataTransfer.effectAllowed = 'copy'
              }}
            >
              <GripVertical className="size-4" aria-hidden />
            </button>
          </li>
          <li className="space-y-2">
            <p className="px-0.5 text-[10px] font-medium uppercase tracking-wider text-zinc-500">
              Device frame
            </p>
            <label className="block text-[11px] text-zinc-500">
              <span className="mb-0.5 block text-zinc-600">Product type</span>
              <select
                className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-xs text-zinc-100"
                value={selectedDeviceType}
                onChange={(e) => setSelectedDeviceType(e.target.value as DeviceFrameType)}
                disabled={registryStatus !== 'ready'}
              >
                {DEVICE_FRAME_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-[11px] text-zinc-500">
              <span className="mb-0.5 block text-zinc-600">Device</span>
              <select
                className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-xs text-zinc-100"
                value={selectedPackId ?? ''}
                onChange={(e) => setSelectedPackId(e.target.value)}
                disabled={registryStatus !== 'ready' || devicesOfType.length === 0}
              >
                {devicesOfType.length === 0 ? (
                  <option value="">No devices for this type</option>
                ) : (
                  devicesOfType.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.manifest.name}
                    </option>
                  ))
                )}
              </select>
            </label>
            {registryStatus === 'error' && registryError ? (
              <p className="rounded border border-amber-900/60 bg-amber-950/40 px-2 py-1 text-[10px] leading-snug text-amber-200/90">
                {registryError}
              </p>
            ) : null}
            {registryStatus === 'loading' ? (
              <p className="text-[10px] text-zinc-500">Loading device frames…</p>
            ) : null}
            <div
              className="grid max-h-48 grid-cols-2 gap-1.5 overflow-y-auto pr-0.5"
              role="radiogroup"
              aria-label="Frame angle"
            >
              {packStyles.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  role="radio"
                  aria-checked={selectedFrameName === s.id}
                  aria-label={s.label}
                  title={s.label}
                  onClick={() => setSelectedFrameName(s.id)}
                  disabled={registryStatus !== 'ready'}
                  className={`flex flex-col items-center gap-0.5 rounded-md border p-1.5 transition-colors disabled:opacity-40 ${
                    selectedFrameName === s.id
                      ? 'border-emerald-500/60 bg-zinc-800 ring-1 ring-emerald-500/30'
                      : 'border-zinc-800 bg-zinc-900/60 hover:border-zinc-600'
                  }`}
                >
                  <img
                    src={s.src}
                    alt=""
                    className="pointer-events-none h-11 w-auto max-w-[2.75rem] object-contain opacity-90"
                  />
                  <span className="line-clamp-2 w-full text-center text-[9px] leading-tight text-zinc-400">
                    {s.label}
                  </span>
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={handleAddDevice}
              disabled={registryStatus !== 'ready' || !selectedPackId || packStyles.length === 0}
              className="flex w-full items-center justify-center gap-2 rounded-md border border-zinc-700 bg-zinc-800/80 px-2 py-2 text-sm text-zinc-100 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Smartphone className="size-4 shrink-0" aria-hidden />
              Add device
            </button>
          </li>
        </ul>
      </div>

      <div className="flex flex-col p-3 pb-4">
        <h2 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-zinc-500">
          <Layers className="size-3.5" aria-hidden />
          Layers
        </h2>
        <p className="mt-1 text-[10px] leading-snug text-zinc-600">
          Use arrows to change stacking (top of list = drawn in front).
        </p>
        {sortedLayers.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-600">No layers yet.</p>
        ) : (
          <ul className="mt-2 space-y-1">
            {sortedLayers.map((o) => {
              const stackIds = getUserLayerIdsBottomToTop(fabricCanvas)
              const pos = stackIds.indexOf(o.id)
              const canMoveUp = pos >= 0 && pos < stackIds.length - 1
              const canMoveDown = pos > 0
              return (
                <li key={o.id} className="flex items-stretch gap-0.5">
                  <div className="flex shrink-0 flex-col justify-center gap-0 border border-zinc-800/80 rounded">
                    <button
                      type="button"
                      title="Move forward (in front of the layer below in this list)"
                      aria-label={`Move layer ${o.name} up`}
                      disabled={!canMoveUp}
                      className="rounded-t p-0.5 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200 disabled:cursor-not-allowed disabled:opacity-30"
                      onClick={() => moveLayerById(o.id, true)}
                    >
                      <ChevronUp className="size-3.5" aria-hidden />
                    </button>
                    <button
                      type="button"
                      title="Move behind the next layer in this list"
                      aria-label={`Move layer ${o.name} down`}
                      disabled={!canMoveDown}
                      className="rounded-b p-0.5 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200 disabled:cursor-not-allowed disabled:opacity-30"
                      onClick={() => moveLayerById(o.id, false)}
                    >
                      <ChevronDown className="size-3.5" aria-hidden />
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => selectLayerById(o.id)}
                    className={`min-w-0 flex-1 truncate rounded px-2 py-1 text-left text-sm transition-colors ${
                      selectedObject === o.id
                        ? 'bg-zinc-800 text-zinc-100'
                        : 'text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200'
                    }`}
                  >
                    {o.name}
                    <span className="ml-1 text-xs text-zinc-600">({o.kind})</span>
                  </button>
                  <button
                    type="button"
                    title="Delete layer"
                    aria-label={`Delete layer ${o.name}`}
                    className="flex shrink-0 items-center justify-center rounded px-1.5 text-zinc-500 hover:bg-red-950/50 hover:text-red-300"
                    onClick={(e) => {
                      e.stopPropagation()
                      deleteLayerById(o.id)
                    }}
                  >
                    <Trash2 className="size-3.5" aria-hidden />
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </aside>
  )
}
