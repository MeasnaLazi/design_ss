import { useEffect, useRef, useState } from 'react'
import { ChevronsDown, ChevronsUp, Copy, Image, Plus, Smartphone, Square, Trash2, Type } from 'lucide-react'

import { addBlock, deleteSelection, duplicateSelection, moveSelection } from '../editor/structureActions'
import { useEditorStore } from '../store/useEditorStore'

/**
 * Add / delete / duplicate / z-order controls.
 *
 * New blocks land in the panel of the current selection (the first panel when
 * nothing is selected), so building a design means selecting a panel and adding
 * to it rather than dropping blocks into an ambiguous "somewhere".
 */

const ADDABLE = [
  { label: 'Title', kind: 'text' as const, role: 'title' as const, Icon: Type },
  { label: 'Subtitle', kind: 'text' as const, role: 'subtitle' as const, Icon: Type },
  { label: 'Caption', kind: 'text' as const, role: 'caption' as const, Icon: Type },
  { label: 'Device', kind: 'device' as const, role: undefined, Icon: Smartphone },
  { label: 'Image', kind: 'image' as const, role: undefined, Icon: Image },
  { label: 'Decor', kind: 'decor' as const, role: undefined, Icon: Square },
]

function ToolButton({
  onClick,
  title,
  disabled,
  children,
}: {
  onClick: () => void
  title: string
  disabled?: boolean
  children: React.ReactNode
}): React.ReactElement {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      disabled={disabled}
      className="rounded p-1.5 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-100 disabled:cursor-default disabled:opacity-30 disabled:hover:bg-transparent"
    >
      {children}
    </button>
  )
}

export function AddMenu(): React.ReactElement {
  const [open, setOpen] = useState(false)
  const nodes = useEditorStore((s) => s.nodes)
  const selectedId = useEditorStore((s) => s.selectedId)
  const status = useEditorStore((s) => s.status)
  const menuRef = useRef<HTMLDivElement>(null)

  const selected = nodes.find((n) => n.id === selectedId)
  const hasBlock = selected !== undefined && selected.kind !== 'panel'
  const ready = status === 'ready'

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent): void => {
      if (!menuRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  // Delete and ⌘D, ignored while a field or a text session has focus.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      if (useEditorStore.getState().editingId) return

      if ((e.key === 'Delete' || e.key === 'Backspace') && useEditorStore.getState().selectedId) {
        e.preventDefault()
        deleteSelection()
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'd') {
        e.preventDefault()
        void duplicateSelection()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="flex items-center gap-0.5">
      <div ref={menuRef} className="relative">
        <button
          type="button"
          disabled={!ready}
          onClick={() => setOpen((v) => !v)}
          title="Add a block"
          className="flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-zinc-100 disabled:opacity-30"
        >
          <Plus size={14} /> Add
        </button>
        {open && (
          <div className="absolute left-0 top-full z-20 mt-1 w-44 rounded-md border border-zinc-700 bg-zinc-900 p-1 shadow-xl">
            <p className="px-2 py-1 text-[10px] uppercase tracking-wide text-zinc-600">
              into panel {selected?.panelIndex ?? 0}
            </p>
            {ADDABLE.map(({ label, kind, role, Icon }) => (
              <button
                key={label}
                type="button"
                onClick={() => {
                  setOpen(false)
                  void addBlock(kind, role)
                }}
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-zinc-300 hover:bg-zinc-800"
              >
                <Icon size={13} className="opacity-70" /> {label}
              </button>
            ))}
          </div>
        )}
      </div>

      <ToolButton onClick={() => void duplicateSelection()} title="Duplicate (⌘D)" disabled={!hasBlock}>
        <Copy size={15} />
      </ToolButton>
      <ToolButton onClick={deleteSelection} title="Delete (⌫)" disabled={!hasBlock}>
        <Trash2 size={15} />
      </ToolButton>
      <ToolButton onClick={() => moveSelection('front')} title="Bring to front" disabled={!hasBlock}>
        <ChevronsUp size={15} />
      </ToolButton>
      <ToolButton onClick={() => moveSelection('back')} title="Send to back" disabled={!hasBlock}>
        <ChevronsDown size={15} />
      </ToolButton>
    </div>
  )
}
