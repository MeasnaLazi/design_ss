import { IText } from 'fabric'
import { AlignCenter, AlignLeft, AlignRight, Minus, Plus } from 'lucide-react'
import { useCallback, useEffect, useReducer, useState } from 'react'
import { useDesignStore } from '../../store/useDesignStore'

const FONT_CHOICES = [
  'system-ui, -apple-system, sans-serif',
  'Georgia, serif',
  '"Times New Roman", Times, serif',
  'Arial, Helvetica, sans-serif',
  '"Helvetica Neue", Helvetica, sans-serif',
  '"Courier New", monospace',
] as const

const FONT_SIZE_MIN = 8
const FONT_SIZE_MAX = 400
const FONT_SIZE_STEP = 2

function clampFontSize(n: number): number {
  return Math.min(FONT_SIZE_MAX, Math.max(FONT_SIZE_MIN, Math.round(n)))
}

function textFillToHex(obj: IText): string {
  const fill = obj.fill
  if (typeof fill === 'string') return fill
  return '#f4f4f5'
}

export function ContextualTextToolbar() {
  const canvas = useDesignStore((s) => s.fabricCanvas)
  /** Subscribe so we re-render when Fabric updates selection via the store */
  const selectedObject = useDesignStore((s) => s.selectedObject)
  const [, bump] = useReducer((n: number) => n + 1, 0)
  const [fontSizeDraft, setFontSizeDraft] = useState<string | null>(null)

  const patchActiveText = useCallback((patch: Record<string, unknown>) => {
    const c = useDesignStore.getState().fabricCanvas
    const obj = c?.getActiveObject()
    if (!c || !(obj instanceof IText)) return
    obj.set(patch)
    obj.set('dirty', true)
    c.fire('object:modified', { target: obj })
    c.requestRenderAll()
    bump()
    console.log('[ContextualTextToolbar] applied', patch)
  }, [])

  const active = canvas?.getActiveObject()

  useEffect(() => {
    setFontSizeDraft(null)
  }, [selectedObject])

  const commitFontSizeDraft = useCallback(() => {
    if (fontSizeDraft == null) return
    const trimmed = fontSizeDraft.trim()
    setFontSizeDraft(null)
    if (trimmed === '') return
    const n = Number(trimmed)
    if (!Number.isFinite(n)) return
    patchActiveText({ fontSize: clampFontSize(n) })
  }, [fontSizeDraft, patchActiveText])

  const nudgeFontSize = useCallback(
    (delta: number) => {
      const obj = useDesignStore.getState().fabricCanvas?.getActiveObject()
      const committed = obj instanceof IText ? (obj.fontSize ?? 32) : 32
      if (fontSizeDraft != null) {
        const trimmed = fontSizeDraft.trim()
        const parsed = trimmed === '' ? NaN : Number(trimmed)
        const base = Number.isFinite(parsed) ? clampFontSize(parsed) : committed
        setFontSizeDraft(null)
        patchActiveText({ fontSize: clampFontSize(base + delta) })
        return
      }
      patchActiveText({ fontSize: clampFontSize(committed + delta) })
    },
    [fontSizeDraft, patchActiveText],
  )

  if (!(active instanceof IText)) return null

  const fontFamily = active.fontFamily ?? FONT_CHOICES[0]
  const fontSize = active.fontSize ?? 32
  const fill = textFillToHex(active)
  const align = active.textAlign ?? 'left'
  const fontInPresetList = (FONT_CHOICES as readonly string[]).includes(fontFamily)

  return (
    <div
      className="flex max-w-full flex-wrap items-center gap-2 sm:gap-3"
      role="toolbar"
      aria-label="Text formatting"
    >
      <label className="flex items-center gap-1.5 text-xs text-zinc-400">
        <span className="hidden sm:inline">Font</span>
        <select
          className="max-w-[10rem] rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-100"
          value={fontFamily}
          onChange={(e) => patchActiveText({ fontFamily: e.target.value })}
        >
          {!fontInPresetList ? (
            <option value={fontFamily}>{fontFamily}</option>
          ) : null}
          {FONT_CHOICES.map((f) => (
            <option key={f} value={f}>
              {f.split(',')[0]?.replaceAll('"', '')}
            </option>
          ))}
        </select>
      </label>

      <div
        className="flex items-center gap-1 text-xs text-zinc-400"
        role="group"
        aria-label="Font size"
      >
        <span className="hidden sm:inline">Size</span>
        <div className="flex items-center rounded border border-zinc-700 bg-zinc-900">
          <button
            type="button"
            title="Smaller"
            aria-label="Decrease font size"
            disabled={fontSize <= FONT_SIZE_MIN}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-l border-r border-zinc-700 text-zinc-300 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"
            onClick={() => nudgeFontSize(-FONT_SIZE_STEP)}
          >
            <Minus className="size-3.5" aria-hidden />
          </button>
          <input
            type="text"
            inputMode="decimal"
            className="w-14 border-0 bg-transparent px-1 py-1 text-center text-xs text-zinc-100 tabular-nums outline-none focus:ring-0"
            value={fontSizeDraft ?? String(Math.round(fontSize))}
            onFocus={() => setFontSizeDraft(String(Math.round(fontSize)))}
            onChange={(e) => setFontSizeDraft(e.target.value)}
            onBlur={() => commitFontSizeDraft()}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                ;(e.target as HTMLInputElement).blur()
              }
            }}
            aria-valuemin={FONT_SIZE_MIN}
            aria-valuemax={FONT_SIZE_MAX}
            aria-label="Font size in pixels"
          />
          <button
            type="button"
            title="Larger"
            aria-label="Increase font size"
            disabled={fontSize >= FONT_SIZE_MAX}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-r border-l border-zinc-700 text-zinc-300 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"
            onClick={() => nudgeFontSize(FONT_SIZE_STEP)}
          >
            <Plus className="size-3.5" aria-hidden />
          </button>
        </div>
      </div>

      <label className="flex items-center gap-1.5 text-xs text-zinc-400">
        <span className="hidden sm:inline">Color</span>
        <input
          type="color"
          className="h-8 w-10 cursor-pointer rounded border border-zinc-700 bg-zinc-900 p-0.5"
          value={fill.startsWith('#') && fill.length >= 7 ? fill.slice(0, 7) : '#f4f4f5'}
          onChange={(e) => patchActiveText({ fill: e.target.value })}
        />
      </label>

      <div className="flex items-center gap-0.5 rounded border border-zinc-700 bg-zinc-900 p-0.5" role="group" aria-label="Text alignment">
        {(
          [
            { value: 'left' as const, Icon: AlignLeft, label: 'Align left' },
            { value: 'center' as const, Icon: AlignCenter, label: 'Align center' },
            { value: 'right' as const, Icon: AlignRight, label: 'Align right' },
          ] as const
        ).map(({ value, Icon, label }) => (
          <button
            key={value}
            type="button"
            title={label}
            aria-label={label}
            aria-pressed={align === value}
            className={`rounded p-1.5 ${align === value ? 'bg-zinc-700 text-zinc-100' : 'text-zinc-400 hover:bg-zinc-800'}`}
            onClick={() => patchActiveText({ textAlign: value })}
          >
            <Icon className="size-4" aria-hidden />
          </button>
        ))}
      </div>
    </div>
  )
}
