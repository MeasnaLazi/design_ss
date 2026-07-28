import { ChevronDown, ChevronUp, Image, Layers, Smartphone, Square, Type } from 'lucide-react'

import { KIND_COLOR } from '../editor/schema'
import { moveSelection } from '../editor/structureActions'
import { useEditorStore } from '../store/useEditorStore'
import type { BlockNode } from '../editor/blockRegistry'
import type { NodeKind } from '../editor/schema'

const KIND_ICON: Record<NodeKind, typeof Type> = {
  panel: Layers,
  text: Type,
  device: Smartphone,
  image: Image,
  decor: Square,
}

/**
 * Per-panel layer list.
 *
 * **Order convention:** rows are shown front-to-back — the first row is the
 * topmost layer — which is the reverse of DOM order. Painting order in a strip
 * is DOM order (unless a block sets `z-index`), so reversing here matches what
 * the eye sees on the canvas and what every other design tool does. P5's
 * drag-to-reorder must remember to invert back when it writes DOM order.
 */
export function LayerTree(): React.ReactElement {
  const nodes = useEditorStore((s) => s.nodes)
  const selectedId = useEditorStore((s) => s.selectedId)
  const hoveredId = useEditorStore((s) => s.hoveredId)
  const status = useEditorStore((s) => s.status)
  const select = useEditorStore((s) => s.select)
  const setHovered = useEditorStore((s) => s.setHovered)

  /** Reorder acts on the selection, so select the row first. */
  const nudgeOrder = (id: string, direction: 'forward' | 'backward'): void => {
    select(id)
    // The store update is synchronous, so the action sees the new selection.
    moveSelection(direction)
  }

  const panels = nodes.filter((n) => n.kind === 'panel')

  const row = (node: BlockNode, depth: number): React.ReactElement => {
    const Icon = KIND_ICON[node.kind]
    const active = node.id === selectedId
    const hovered = node.id === hoveredId
    return (
      <button
        key={node.id}
        type="button"
        onClick={() => select(node.id)}
        onMouseEnter={() => setHovered(node.id)}
        onMouseLeave={() => setHovered(null)}
        className={`group flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-left text-xs transition-colors ${
          active
            ? 'bg-sky-500/20 text-sky-100 ring-1 ring-inset ring-sky-500/50'
            : hovered
              ? 'bg-zinc-800 text-zinc-200'
              : 'text-zinc-400 hover:bg-zinc-800/70'
        }`}
        style={{ paddingLeft: 6 + depth * 14 }}
      >
        <Icon size={12} className={`shrink-0 ${active ? 'text-sky-200' : KIND_COLOR[node.kind]}`} />
        <span className="min-w-0 flex-1 truncate">{node.label}</span>
        {node.zIndex !== null && (
          <span className="shrink-0 rounded bg-zinc-800 px-1 text-[9px] tabular-nums text-zinc-400" title="explicit z-index">
            z{node.zIndex}
          </span>
        )}
        {node.kind !== 'panel' && (
          <span className="flex shrink-0 items-center opacity-0 group-hover:opacity-100">
            <span
              role="button"
              tabIndex={-1}
              title="Bring forward"
              onClick={(e) => {
                e.stopPropagation()
                nudgeOrder(node.id, 'forward')
              }}
              className="rounded p-0.5 text-zinc-500 hover:bg-zinc-700 hover:text-zinc-200"
            >
              <ChevronUp size={11} />
            </span>
            <span
              role="button"
              tabIndex={-1}
              title="Send backward"
              onClick={(e) => {
                e.stopPropagation()
                nudgeOrder(node.id, 'backward')
              }}
              className="rounded p-0.5 text-zinc-500 hover:bg-zinc-700 hover:text-zinc-200"
            >
              <ChevronDown size={11} />
            </span>
          </span>
        )}
      </button>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-zinc-800 px-3 py-2">
        <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">Layers</span>
        <span className="text-[10px] text-zinc-600">front → back</span>
      </div>
      <div className="flex-1 overflow-y-auto p-1.5">
        {status !== 'ready' && <p className="px-2 py-4 text-xs text-zinc-600">Waiting for the strip to load…</p>}
        {status === 'ready' &&
          panels.map((panel) => {
            const layers = nodes.filter((n) => n.kind !== 'panel' && n.panelIndex === panel.panelIndex)
            return (
              <div key={panel.id} className="mb-1">
                {row(panel, 0)}
                {/* Reversed: topmost layer first. */}
                {[...layers].reverse().map((n) => row(n, 1))}
              </div>
            )
          })}
      </div>
    </div>
  )
}
