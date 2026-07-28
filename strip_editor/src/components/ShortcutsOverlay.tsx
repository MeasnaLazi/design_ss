import { useEffect } from 'react'
import { X } from 'lucide-react'

/**
 * The keyboard map, opened with `?`.
 *
 * Kept as data rather than prose so it stays in step with the handlers: every
 * row here corresponds to a real binding in `StripStage` or `TopBar`, and a
 * shortcut that stops working should be deleted from this list in the same
 * change.
 */
const GROUPS: Array<{ title: string; rows: Array<[string, string]> }> = [
  {
    title: 'Selection',
    rows: [
      ['Click', 'Select a block; empty panel space selects the panel'],
      ['Double-click', 'Edit a text block in place'],
      ['Esc', 'Deselect, or cancel a text edit and revert it'],
    ],
  },
  {
    title: 'Moving',
    rows: [
      ['Drag', 'Move the block under the pointer'],
      ['⌥ + drag', 'Move without snapping to panel edges or centres'],
      ['← ↑ → ↓', 'Nudge 1px — never snaps'],
      ['⇧ + arrows', 'Nudge 10px'],
      ['Drag a handle', 'Resize. Devices and text are width-only'],
    ],
  },
  {
    title: 'Text',
    rows: [
      ['Enter', 'Line break'],
      ['⇧⏎ / ⌘⏎', 'Commit and leave the block'],
      ['Esc', 'Revert to the text the session started with'],
      ['Paste', 'Arrives as plain text — formatting is discarded'],
    ],
  },
  {
    title: 'Structure',
    rows: [
      ['⌘D', 'Duplicate the selection'],
      ['⌫ / Delete', 'Delete the selection (panels are never deletable)'],
    ],
  },
  {
    title: 'History and file',
    rows: [
      ['⌘Z', 'Undo — one gesture at a time, not one pixel'],
      ['⇧⌘Z / ⌘Y', 'Redo'],
      ['⌘S', 'Save'],
    ],
  },
  {
    title: 'View',
    rows: [
      ['⌘ / Ctrl + wheel', 'Zoom'],
      ['Wheel / trackpad', 'Pan'],
      ['?', 'This list'],
    ],
  },
]

export function ShortcutsOverlay({ open, onClose }: { open: boolean; onClose: () => void }): React.ReactElement | null {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      onClick={onClose}
      className="absolute inset-0 z-30 flex items-center justify-center bg-zinc-950/70 p-8 backdrop-blur-sm"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="max-h-full w-full max-w-2xl overflow-y-auto rounded-lg border border-zinc-700 bg-zinc-900 p-5 shadow-2xl"
      >
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h2 className="text-sm font-semibold text-zinc-100">Keyboard</h2>
            <p className="text-xs text-zinc-500">Shortcuts are ignored while a field or a text block has focus.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
          >
            <X size={15} />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-x-6 gap-y-4">
          {GROUPS.map((group) => (
            <section key={group.title}>
              <h3 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">{group.title}</h3>
              <dl className="space-y-1">
                {group.rows.map(([keys, what]) => (
                  <div key={keys} className="flex items-baseline gap-2 text-xs">
                    <dt className="w-28 shrink-0 font-mono text-[11px] text-sky-300">{keys}</dt>
                    <dd className="min-w-0 flex-1 text-zinc-400">{what}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </div>
    </div>
  )
}
