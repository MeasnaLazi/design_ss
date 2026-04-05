import { IText } from 'fabric'
import { AlignCenter, AlignLeft, AlignRight } from 'lucide-react'
import { useCallback, useReducer } from 'react'
import { useDesignStore } from '../../store/useDesignStore'

const FONT_CHOICES = [
  'system-ui, -apple-system, sans-serif',
  'Georgia, serif',
  '"Times New Roman", Times, serif',
  'Arial, Helvetica, sans-serif',
  '"Helvetica Neue", Helvetica, sans-serif',
  '"Courier New", monospace',
] as const

function textFillToHex(obj: IText): string {
  const fill = obj.fill
  if (typeof fill === 'string') return fill
  return '#f4f4f5'
}

export function ContextualTextToolbar() {
  const canvas = useDesignStore((s) => s.fabricCanvas)
  /** Subscribe so we re-render when Fabric updates selection via the store */
  useDesignStore((s) => s.selectedObject)
  const [, bump] = useReducer((n: number) => n + 1, 0)

  const patchActiveText = useCallback((patch: Record<string, unknown>) => {
    const c = useDesignStore.getState().fabricCanvas
    const obj = c?.getActiveObject()
    if (!c || !(obj instanceof IText)) return
    obj.set(patch)
    obj.set('dirty', true)
    c.requestRenderAll()
    bump()
    console.log('[ContextualTextToolbar] applied', patch)
  }, [])

  const active = canvas?.getActiveObject()
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

      <label className="flex items-center gap-1.5 text-xs text-zinc-400">
        <span className="hidden sm:inline">Size</span>
        <input
          type="number"
          min={8}
          max={400}
          className="w-16 rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-100"
          value={Math.round(fontSize)}
          onChange={(e) => {
            const n = Number(e.target.value)
            if (Number.isFinite(n)) patchActiveText({ fontSize: n })
          }}
        />
      </label>

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
