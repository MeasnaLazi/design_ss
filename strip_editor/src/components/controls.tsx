import { useEffect, useState } from 'react'

/** Shared form primitives for the inspector's editing sections. */

export function Section({ title, right, children }: { title: string; right?: React.ReactNode; children: React.ReactNode }): React.ReactElement {
  return (
    <section className="border-b border-zinc-800 px-3 py-2.5">
      <div className="mb-1.5 flex items-center justify-between">
        <h3 className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">{title}</h3>
        {right}
      </div>
      {children}
    </section>
  )
}

export function Row({ label, children }: { label: string; children: React.ReactNode }): React.ReactElement {
  return (
    <div className="flex items-center gap-2 py-0.5 text-xs">
      <span className="w-24 shrink-0 text-zinc-500">{label}</span>
      <div className="flex min-w-0 flex-1 items-center gap-1">{children}</div>
    </div>
  )
}

export const inputClass =
  'min-w-0 flex-1 rounded border border-zinc-700 bg-zinc-900 px-1.5 py-0.5 font-mono text-[11px] text-zinc-100 focus:border-sky-500 focus:outline-none'

/**
 * Free-text CSS field. Commits on Enter or blur, reverts on Escape — never per
 * keystroke, so a half-typed value never reaches the document or the edit log.
 * An empty value means *remove the declaration* and inherit again.
 */
export function CssField({
  value,
  placeholder,
  onCommit,
}: {
  value: string
  placeholder?: string
  onCommit: (next: string) => void
}): React.ReactElement {
  const [draft, setDraft] = useState(value)
  const [editing, setEditing] = useState(false)
  useEffect(() => {
    if (!editing) setDraft(value)
  }, [value, editing])

  return (
    <input
      value={draft}
      placeholder={placeholder}
      spellCheck={false}
      onFocus={() => setEditing(true)}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        setEditing(false)
        if (draft !== value) onCommit(draft)
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
        else if (e.key === 'Escape') {
          setDraft(value)
          setEditing(false)
          e.currentTarget.blur()
        }
      }}
      className={inputClass}
    />
  )
}

/**
 * Colour field pairing a native swatch with the text form.
 *
 * The text box is authoritative: strips use `var(--gold)`, `rgba(…)` and
 * gradients, none of which a colour input can represent. The swatch is a
 * convenience that only shows a value when it happens to be a plain hex.
 */
export function ColorField({
  value,
  placeholder,
  onCommit,
}: {
  value: string
  placeholder?: string
  onCommit: (next: string) => void
}): React.ReactElement {
  const hex = /^#[0-9a-f]{6}$/i.test(value.trim()) ? value.trim() : null
  return (
    <>
      <input
        type="color"
        value={hex ?? '#000000'}
        onChange={(e) => onCommit(e.target.value)}
        title={hex ? value : 'Not a plain hex colour — edit as text'}
        className="h-6 w-7 shrink-0 cursor-pointer rounded border border-zinc-700 bg-zinc-900 p-0.5"
      />
      <CssField value={value} placeholder={placeholder} onCommit={onCommit} />
    </>
  )
}

export function Hint({ children }: { children: React.ReactNode }): React.ReactElement {
  return <p className="mt-1.5 text-[11px] leading-snug text-zinc-500">{children}</p>
}

export function Chip({
  active,
  onClick,
  children,
  title,
}: {
  active?: boolean
  onClick: () => void
  children: React.ReactNode
  title?: string
}): React.ReactElement {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`rounded px-1.5 py-1 text-[10px] transition-colors ${
        active ? 'bg-sky-500/20 text-sky-300 ring-1 ring-inset ring-sky-500/40' : 'text-zinc-400 hover:bg-zinc-800'
      }`}
    >
      {children}
    </button>
  )
}
