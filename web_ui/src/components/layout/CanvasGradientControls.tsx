import { Plus, Trash2 } from 'lucide-react'
import { useCallback } from 'react'

import { CANVAS_GRADIENT_PRESETS } from '../../constants/gradientPresets'
import {
  clampGradientOffset,
  sortGradientStops,
} from '../../lib/backgroundGradient'
import type { BackgroundGradientKind, GradientColorStop } from '../../store/designTypes'
import { useDesignStore } from '../../store/useDesignStore'

function colorInputValue(hexish: string): string {
  if (hexish.startsWith('#') && hexish.length >= 7) {
    return hexish.slice(0, 7)
  }
  return '#1a1a1a'
}

function largestGapInsert(sorted: GradientColorStop[]): {
  offset: number
  color: string
} {
  let best = 0
  let offset = 0.5
  let color = sorted[0]?.color ?? '#1a1a1a'
  for (let i = 0; i < sorted.length - 1; i++) {
    const gap = sorted[i + 1].offset - sorted[i].offset
    if (gap > best) {
      best = gap
      offset = (sorted[i].offset + sorted[i + 1].offset) / 2
      color = sorted[i].color
    }
  }
  return { offset: clampGradientOffset(offset), color }
}

export function CanvasGradientControls() {
  const backgroundGradient = useDesignStore((s) => s.config.backgroundGradient)
  const setConfig = useDesignStore((s) => s.setConfig)

  const sorted = sortGradientStops(backgroundGradient.stops)
  const n = sorted.length

  const replaceStops = useCallback(
    (stops: GradientColorStop[]) => {
      const s = sortGradientStops(stops.map((x) => ({ ...x })))
      if (s.length >= 2) {
        s[0] = { ...s[0], offset: 0 }
        s[s.length - 1] = { ...s[s.length - 1], offset: 1 }
      }
      setConfig({
        backgroundGradient: {
          stops: s,
        },
      })
    },
    [setConfig],
  )

  const setKind = (kind: BackgroundGradientKind) => {
    setConfig({ backgroundGradient: { kind } })
  }

  const applyPreset = (gradient: (typeof CANVAS_GRADIENT_PRESETS)[number]['gradient']) => {
    setConfig({
      backgroundMode: 'gradient',
      backgroundGradient: {
        kind: gradient.kind,
        angleDeg: gradient.angleDeg,
        stops: gradient.stops.map((s) => ({ ...s })),
      },
    })
  }

  const addStop = () => {
    const base = sortGradientStops(backgroundGradient.stops)
    if (base.length < 2) return
    const { offset, color } = largestGapInsert(base)
    const next = sortGradientStops([...base, { offset, color }])
    replaceStops(next)
  }

  const removeStopAt = (index: number) => {
    if (n <= 2) return
    const next = sorted.filter((_, i) => i !== index)
    if (next.length < 2) return
    next[0] = { ...next[0], offset: 0 }
    next[next.length - 1] = { ...next[next.length - 1], offset: 1 }
    replaceStops(next)
  }

  const setStopColor = (index: number, color: string) => {
    const next = sorted.map((s, i) => (i === index ? { ...s, color } : { ...s }))
    replaceStops(next)
  }

  const setStopOffset = (index: number, offset: number) => {
    if (index <= 0 || index >= n - 1) return
    const prev = sorted[index - 1].offset
    const nextOff = sorted[index + 1].offset
    const lo = prev + 0.02
    const hi = nextOff - 0.02
    const clamped = Math.min(hi, Math.max(lo, offset))
    const next = sorted.map((s, i) =>
      i === index ? { ...s, offset: clampGradientOffset(clamped) } : { ...s },
    )
    replaceStops(next)
  }

  return (
    <div className="mt-2 space-y-3">
      <div>
        <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-zinc-500">
          Presets
        </p>
        <div className="flex flex-wrap gap-1">
          {CANVAS_GRADIENT_PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              title={p.label}
              onClick={() => applyPreset(p.gradient)}
              className="h-7 min-w-[4.5rem] flex-1 rounded border border-zinc-700/90 bg-zinc-800/60 px-1.5 text-[10px] font-medium text-zinc-300 hover:border-zinc-600 hover:bg-zinc-800"
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-zinc-500">
          Type
        </p>
        <div className="flex rounded-md border border-zinc-800 p-0.5">
          <button
            type="button"
            onClick={() => setKind('linear')}
            className={`min-w-0 flex-1 rounded px-2 py-1.5 text-[11px] font-medium ${
              backgroundGradient.kind === 'linear'
                ? 'bg-zinc-700 text-zinc-100'
                : 'text-zinc-400 hover:bg-zinc-800/80'
            }`}
          >
            Linear
          </button>
          <button
            type="button"
            onClick={() => setKind('radial')}
            className={`min-w-0 flex-1 rounded px-2 py-1.5 text-[11px] font-medium ${
              backgroundGradient.kind === 'radial'
                ? 'bg-zinc-700 text-zinc-100'
                : 'text-zinc-400 hover:bg-zinc-800/80'
            }`}
          >
            Radial
          </button>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between text-xs text-zinc-400">
          <span>{backgroundGradient.kind === 'radial' ? 'Focal angle' : 'Angle'}</span>
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
          {backgroundGradient.kind === 'linear'
            ? '0° → right, 90° → down, 180° → left.'
            : 'Moves the bright focal point around the panel (vignette-style).'}
        </p>
      </div>

      <div>
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">
            Color stops
          </p>
          <button
            type="button"
            onClick={addStop}
            className="inline-flex items-center gap-0.5 rounded border border-zinc-700/80 px-1.5 py-0.5 text-[10px] font-medium text-zinc-400 hover:border-zinc-600 hover:bg-zinc-800/60 hover:text-zinc-200"
          >
            <Plus className="size-3" aria-hidden />
            Add
          </button>
        </div>
        <ul className="mt-1.5 space-y-2">
          {sorted.map((stop, index) => {
            const isEdge = index === 0 || index === n - 1
            return (
              <li
                key={`${index}-${stop.offset}`}
                className="flex flex-wrap items-center gap-2 rounded-md border border-zinc-800/80 bg-zinc-900/40 px-2 py-1.5"
              >
                <span className="w-10 shrink-0 text-[10px] text-zinc-500">
                  {index === 0 ? 'Start' : index === n - 1 ? 'End' : `Mid ${index}`}
                </span>
                <input
                  type="color"
                  className="h-8 w-full max-w-[5.5rem] shrink-0 cursor-pointer rounded border border-zinc-700 bg-zinc-900 p-0.5"
                  value={colorInputValue(stop.color)}
                  onChange={(e) => setStopColor(index, e.target.value)}
                  aria-label={`Stop ${index + 1} color`}
                />
                {isEdge ? (
                  <span className="ml-auto text-[10px] tabular-nums text-zinc-600">
                    {index === 0 ? '0%' : '100%'}
                  </span>
                ) : (
                  <div className="ml-auto flex min-w-0 flex-1 items-center gap-2 sm:max-w-[10rem]">
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={1}
                      className="min-w-0 flex-1 accent-emerald-500"
                      value={Math.round(stop.offset * 100)}
                      onChange={(e) =>
                        setStopOffset(index, Number(e.target.value) / 100)
                      }
                      aria-label={`Stop ${index + 1} position`}
                    />
                    <span className="w-8 shrink-0 text-right text-[10px] tabular-nums text-zinc-500">
                      {Math.round(stop.offset * 100)}%
                    </span>
                  </div>
                )}
                {!isEdge ? (
                  <button
                    type="button"
                    onClick={() => removeStopAt(index)}
                    className="shrink-0 rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-red-400"
                    aria-label={`Remove stop ${index + 1}`}
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                ) : null}
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}
