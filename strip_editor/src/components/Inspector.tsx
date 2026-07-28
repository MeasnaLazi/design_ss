import { useEffect, useState } from 'react'

import { KIND_LABEL } from '../editor/schema'
import { applyGeometry } from '../editor/mutate'
import { boxToDeclarations, resizePolicy, resolveAnchors } from '../editor/geometry'
import { DecorControls, ImageControls, PanelControls } from './SurfaceControls'
import { DeviceControls } from './DeviceControls'
import { TextControls } from './TextControls'
import { getElement } from '../editor/blockRegistry'
import { useEditorStore } from '../store/useEditorStore'
import type { BlockReadout, Rect } from '../editor/blockRegistry'

/**
 * Property panel for the selected node.
 *
 * Two distinct columns of truth, deliberately shown side by side:
 *   • **Geometry** — what the browser laid out, panel-relative, in layout px.
 *     This is what `render.mjs` will export, and where edits are made.
 *   • **Authored inline style** — the raw declarations on the element.
 * They diverge whenever geometry comes from a stylesheet rule, a class, or the
 * device runtime's `aspect-ratio`. Seeing both is how you tell "the file says
 * this" from "the browser did that" — the confusion that made canvas/HTML
 * disagreements so expensive to debug.
 *
 * Blank style inputs mean *inherit*: the editor writes an inline override only
 * when a value is typed, and clearing one hands the property back to the
 * strip's stylesheet rather than freezing today's computed value into the file.
 */

function Section({ title, children }: { title: string; children: React.ReactNode }): React.ReactElement {
  return (
    <section className="border-b border-zinc-800 px-3 py-2.5">
      <h3 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">{title}</h3>
      {children}
    </section>
  )
}

function Field({
  label,
  value,
  mono = true,
  title,
}: {
  label: string
  value: string | number | null | undefined
  mono?: boolean
  title?: string
}): React.ReactElement {
  const shown = value === null || value === undefined || value === '' ? '—' : String(value)
  return (
    <div className="flex items-baseline gap-2 py-0.5 text-xs">
      <span className="w-24 shrink-0 text-zinc-500">{label}</span>
      <span
        className={`min-w-0 flex-1 truncate text-zinc-200 ${mono ? 'font-mono text-[11px]' : ''}`}
        title={title ?? shown}
      >
        {shown}
      </span>
    </div>
  )
}

function px(n: number): string {
  // Sub-pixel values are real (fractional font metrics, warped devices); round
  // for display but keep one decimal when it matters.
  return Number.isInteger(n) ? `${n}px` : `${n.toFixed(1)}px`
}

/**
 * Editable pixel field. Commits on Enter or blur, reverts on Escape — never on
 * every keystroke, so typing "1" on the way to "120" cannot fling a block across
 * the panel and pollute the edit log.
 */
function NumberField({
  label,
  value,
  disabled,
  hint,
  onCommit,
}: {
  label: string
  value: number
  disabled?: boolean
  hint?: string
  onCommit: (next: number) => void
}): React.ReactElement {
  const [draft, setDraft] = useState(String(Math.round(value)))
  const [editing, setEditing] = useState(false)

  // Follow the document while not being typed into (drag, nudge, reload).
  useEffect(() => {
    if (!editing) setDraft(String(Math.round(value)))
  }, [value, editing])

  const commit = (): void => {
    setEditing(false)
    const next = Number(draft)
    if (!Number.isFinite(next)) {
      setDraft(String(Math.round(value)))
      return
    }
    if (Math.round(next) !== Math.round(value)) onCommit(next)
  }

  return (
    <div className="flex items-baseline gap-2 py-0.5 text-xs">
      <span className="w-24 shrink-0 text-zinc-500">{label}</span>
      {disabled ? (
        <span className="min-w-0 flex-1 font-mono text-[11px] text-zinc-500" title={hint}>
          {px(value)} <span className="text-zinc-600">· fixed</span>
        </span>
      ) : (
        <input
          value={draft}
          onFocus={() => setEditing(true)}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.currentTarget.blur()
            } else if (e.key === 'Escape') {
              setDraft(String(Math.round(value)))
              setEditing(false)
              e.currentTarget.blur()
            }
          }}
          inputMode="numeric"
          className="min-w-0 flex-1 rounded border border-zinc-700 bg-zinc-900 px-1.5 py-0.5 font-mono text-[11px] text-zinc-100 focus:border-sky-500 focus:outline-none"
        />
      )}
    </div>
  )
}

/**
 * Geometry, editable. Fields are labelled by the block's *own* anchor — a
 * right-anchored device shows "right", not "left" — so the numbers here match
 * the declarations that will land in the file.
 */
function GeometrySection({ r }: { r: BlockReadout }): React.ReactElement {
  const anyOverhang = Object.values(r.overhang).some(Boolean)
  const el = getElement(r.node.id)
  const editable = r.movable && el !== null
  const anchors = el ? resolveAnchors(el) : { x: 'left' as const, y: 'top' as const }
  const policy = resizePolicy(r.node.kind)

  /** Rewrite one edge/extent of the box and apply the resulting declarations. */
  const setBox = (patch: Partial<Rect>): void => {
    if (!el) return
    const ctx = { kind: r.node.kind, anchors, rect: r.rect, panel: r.panelSize }
    applyGeometry(r.node.id, boxToDeclarations(ctx, { ...r.rect, ...patch }), `inspector:${r.node.id}`)
  }

  if (!editable) {
    return (
      <Section title="Measured · panel-relative">
        <Field label="left" value={px(r.rect.left)} />
        <Field label="top" value={px(r.rect.top)} />
        <Field label="width" value={px(r.rect.width)} />
        <Field label="height" value={px(r.rect.height)} />
        <Field label="right inset" value={px(r.insetRight)} />
        <Field label="bottom inset" value={px(r.insetBottom)} />
        {r.node.kind !== 'panel' && (
          <p className="mt-1.5 rounded bg-zinc-800/70 px-2 py-1.5 text-[11px] leading-snug text-zinc-400">
            This block is <code className="text-zinc-300">position: static</code>, so inline{' '}
            <code className="text-zinc-300">left</code>/<code className="text-zinc-300">top</code> would have no effect.
            It is laid out by its parent; move it by editing the document.
          </p>
        )}
      </Section>
    )
  }

  return (
    <Section title="Geometry · panel-relative">
      {anchors.x === 'left' ? (
        <NumberField label="left" value={r.rect.left} onCommit={(n) => setBox({ left: n })} />
      ) : (
        <NumberField
          label="right"
          value={r.insetRight}
          hint="This block is anchored from the panel's right edge."
          onCommit={(n) => setBox({ left: r.panelSize.width - n - r.rect.width })}
        />
      )}
      {anchors.y === 'top' ? (
        <NumberField label="top" value={r.rect.top} onCommit={(n) => setBox({ top: n })} />
      ) : (
        <NumberField
          label="bottom"
          value={r.insetBottom}
          hint="This block is anchored from the panel's bottom edge."
          onCommit={(n) => setBox({ top: r.panelSize.height - n - r.rect.height })}
        />
      )}
      <NumberField
        label="width"
        value={r.rect.width}
        disabled={!policy.width}
        onCommit={(n) => setBox({ width: n })}
      />
      <NumberField
        label="height"
        value={r.rect.height}
        disabled={!policy.height}
        hint={policy.reason}
        onCommit={(n) => setBox({ height: n })}
      />
      {!policy.height && policy.reason && (
        <p className="mt-1 text-[11px] leading-snug text-zinc-500">{policy.reason}</p>
      )}
      <p className="mt-1.5 text-[11px] leading-snug text-zinc-600">
        Anchored {anchors.x} / {anchors.y}. Drag on canvas, or nudge with arrows (⇧ = 10px).
      </p>
      {anyOverhang && (
        <p className="mt-1.5 rounded bg-zinc-800/70 px-2 py-1.5 text-[11px] leading-snug text-zinc-400">
          Crosses the panel{' '}
          {Object.entries(r.overhang)
            .filter(([, v]) => v)
            .map(([k]) => k)
            .join(', ')}{' '}
          edge — the panel crops it with <code className="text-zinc-300">overflow:hidden</code>. This is legal and often
          intentional.
        </p>
      )}
    </Section>
  )
}

function InlineSection({ r }: { r: BlockReadout }): React.ReactElement {
  return (
    <Section title={`Authored inline style · ${r.inline.length}`}>
      {r.inline.length === 0 ? (
        <p className="text-[11px] text-zinc-600">No inline styles — geometry comes from a stylesheet rule or class.</p>
      ) : (
        <div className="space-y-0.5 font-mono text-[11px]">
          {r.inline.map(({ prop, value }) => (
            <div key={prop} className="flex gap-1.5">
              <span className="shrink-0 text-sky-300/80">{prop}:</span>
              <span className="min-w-0 flex-1 break-all text-zinc-300">{value}</span>
            </div>
          ))}
        </div>
      )}
    </Section>
  )
}

function KindSection({ r }: { r: BlockReadout }): React.ReactElement | null {
  // Text is rich enough to warrant its own module — copy, canvas-edit entry
  // point, and the type controls all live in TextControls.
  if (r.text) return <TextControls r={r} />

  if (r.device) return <DeviceControls r={r} />
  if (r.image) return <ImageControls r={r} />
  if (r.decor) return <DecorControls r={r} />
  if (r.panel) return <PanelControls r={r} />
  return null
}

export function Inspector(): React.ReactElement {
  const readout = useEditorStore((s) => s.readout)
  const selectedId = useEditorStore((s) => s.selectedId)

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-zinc-800 px-3 py-2">
        <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">Inspector</span>
        {readout && (
          <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-400">
            {KIND_LABEL[readout.node.kind]}
          </span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {!selectedId && (
          <p className="px-3 py-6 text-xs leading-relaxed text-zinc-600">
            Click a block on the canvas or a row in the layer tree. Click empty panel space to select the panel itself.
          </p>
        )}
        {selectedId && !readout && <p className="px-3 py-6 text-xs text-zinc-600">Measuring…</p>}
        {readout && (
          <>
            <Section title="Node">
              <Field label="id" value={readout.node.id} />
              <Field label="element" value={`<${readout.node.tagName}>`} />
              <Field label="panel" value={readout.node.panelIndex} />
              {readout.node.order >= 0 && <Field label="dom order" value={readout.node.order} />}
              <Field label="class" value={readout.node.className} title={readout.node.className} />
            </Section>
            <KindSection r={readout} />
            <GeometrySection r={readout} />
            <InlineSection r={readout} />
            <Section title="Computed">
              <Field label="position" value={readout.computed.position} />
              <Field label="z-index" value={readout.computed.zIndex} />
              <Field label="opacity" value={readout.computed.opacity} />
              <Field label="visibility" value={readout.computed.visibility} />
              <Field label="transform" value={readout.computed.transform} title={readout.computed.transform} />
              <Field label="filter" value={readout.computed.filter} title={readout.computed.filter} />
            </Section>
          </>
        )}
      </div>
    </div>
  )
}
