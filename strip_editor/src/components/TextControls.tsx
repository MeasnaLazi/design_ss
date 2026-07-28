import { useEffect, useMemo, useState } from 'react'
import { AlignCenter, AlignLeft, AlignRight, Pencil } from 'lucide-react'

import { applyContent, applyDeclarations } from '../editor/mutate'
import { beginTextEditing } from '../editor/textEditing'
import { contentToPlainText, plainTextToContent } from '../editor/textContent'
import { getElement } from '../editor/blockRegistry'
import { getStageIframe } from '../editor/stageRef'
import { useEditorStore } from '../store/useEditorStore'
import type { BlockReadout } from '../editor/blockRegistry'

/**
 * Text controls. Everything writes an inline declaration through the same
 * `mutate` path the canvas uses, so a font change and a drag are the same kind
 * of recorded command and land in the file the same way.
 */

/**
 * Font choices offered to the author.
 *
 * The strips define their type stack as CSS custom properties on `:root`
 * (`--serif`, `--sans`), and blocks reference them as `var(--serif)`. Those come
 * first, because picking the design's own stack is almost always what is wanted
 * and it keeps the file consistent when the stack is later retuned in one place.
 * The literal families below are all system fonts — strips must not load network
 * assets (`composer/strip-schema.md`), so a web font would render in the editor
 * and then silently fall back during export.
 */
const SYSTEM_FONTS: Array<{ label: string; value: string }> = [
  { label: 'System sans', value: "-apple-system, 'Helvetica Neue', system-ui, sans-serif" },
  { label: 'Georgia (serif)', value: "Georgia, 'Times New Roman', serif" },
  { label: 'Iowan Old Style', value: "'Iowan Old Style', Georgia, serif" },
  { label: 'Palatino', value: "Palatino, 'Palatino Linotype', serif" },
  { label: 'Helvetica Neue', value: "'Helvetica Neue', Helvetica, Arial, sans-serif" },
  { label: 'Avenir Next', value: "'Avenir Next', Avenir, sans-serif" },
  { label: 'Menlo (mono)', value: "Menlo, Consolas, monospace" },
]

const WEIGHTS = ['300', '400', '500', '600', '700', '800'] as const

/** Font-family custom properties declared on the document's `:root`. */
function useStripFontVars(): Array<{ label: string; value: string }> {
  const revision = useEditorStore((s) => s.nodes)
  return useMemo(() => {
    const iframe = getStageIframe()
    const doc = iframe?.contentDocument
    if (!doc) return []
    const out: Array<{ label: string; value: string }> = []
    for (const sheet of Array.from(doc.styleSheets)) {
      let rules: CSSRuleList
      try {
        rules = sheet.cssRules
      } catch {
        continue // cross-origin sheet; strips have none, but be safe
      }
      for (const rule of Array.from(rules)) {
        if (!(rule instanceof doc.defaultView!.CSSStyleRule)) continue
        if (!rule.selectorText.includes(':root')) continue
        for (let i = 0; i < rule.style.length; i++) {
          const prop = rule.style.item(i)
          if (!prop.startsWith('--')) continue
          const value = rule.style.getPropertyValue(prop).trim()
          // Heuristic: a font stack, not a colour or a length.
          if (!/serif|sans|mono|system-ui|Georgia|Helvetica/i.test(value)) continue
          out.push({ label: `${prop} (strip)`, value: `var(${prop})` })
        }
      }
    }
    return out
    // `nodes` changes identity on every document load, which is exactly when
    // the stylesheet set changes.
  }, [revision])
}

function Row({ label, children }: { label: string; children: React.ReactNode }): React.ReactElement {
  return (
    <div className="flex items-center gap-2 py-0.5 text-xs">
      <span className="w-24 shrink-0 text-zinc-500">{label}</span>
      <div className="flex min-w-0 flex-1 items-center gap-1">{children}</div>
    </div>
  )
}

const inputClass =
  'min-w-0 flex-1 rounded border border-zinc-700 bg-zinc-900 px-1.5 py-0.5 font-mono text-[11px] text-zinc-100 focus:border-sky-500 focus:outline-none'

/** Text field that commits on Enter or blur and reverts on Escape. */
function CssField({
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

export function TextControls({ r }: { r: BlockReadout }): React.ReactElement | null {
  const editingId = useEditorStore((s) => s.editingId)
  const setEditing = useEditorStore((s) => s.setEditing)
  const stripFonts = useStripFontVars()
  const el = getElement(r.node.id)
  const [draftCopy, setDraftCopy] = useState('')
  const [copyFocused, setCopyFocused] = useState(false)

  const liveContent = el?.innerHTML ?? ''
  useEffect(() => {
    if (!copyFocused) setDraftCopy(contentToPlainText(liveContent))
  }, [liveContent, copyFocused])

  if (!r.text || !el) return null

  const set = (prop: string, value: string | null): void => {
    applyDeclarations(r.node.id, [{ prop, value }], `text-style:${r.node.id}`)
  }

  /** Inline value if the author set one; otherwise the cascade's computed value. */
  const inline = (prop: string): string => el.style.getPropertyValue(prop)

  const currentFamily = inline('font-family')
  const familyOptions = [...stripFonts, ...SYSTEM_FONTS]
  const familyMatch = familyOptions.find((f) => f.value === currentFamily)

  return (
    <>
      <section className="border-b border-zinc-800 px-3 py-2.5">
        <div className="mb-1.5 flex items-center justify-between">
          <h3 className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Copy</h3>
          <span className="text-[10px] text-zinc-600">Enter = line break</span>
        </div>
        <textarea
          value={draftCopy}
          rows={3}
          onFocus={() => setCopyFocused(true)}
          onChange={(e) => setDraftCopy(e.target.value)}
          onBlur={() => {
            setCopyFocused(false)
            const next = plainTextToContent(draftCopy)
            if (next !== liveContent) applyContent(r.node.id, next, `text:${r.node.id}`)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setDraftCopy(contentToPlainText(liveContent))
              setCopyFocused(false)
              e.currentTarget.blur()
            }
          }}
          className="w-full resize-y rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-[11px] leading-snug text-zinc-100 focus:border-sky-500 focus:outline-none"
        />
        <button
          type="button"
          disabled={editingId === r.node.id}
          onClick={() => {
            const iframe = getStageIframe()
            if (!iframe) return
            if (beginTextEditing({ iframe, nodeId: r.node.id, onEnd: () => setEditing(null) })) {
              setEditing(r.node.id)
            }
          }}
          className="mt-1.5 flex items-center gap-1.5 rounded px-1.5 py-1 text-[11px] text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 disabled:opacity-50"
        >
          <Pencil size={11} /> {editingId === r.node.id ? 'Editing on canvas…' : 'Edit on canvas (or double-click it)'}
        </button>
      </section>

      <section className="border-b border-zinc-800 px-3 py-2.5">
        <h3 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Type</h3>

        <Row label="family">
          <select
            value={familyMatch ? familyMatch.value : currentFamily === '' ? '__inherit' : '__custom'}
            onChange={(e) => {
              if (e.target.value === '__inherit') set('font-family', null)
              else if (e.target.value !== '__custom') set('font-family', e.target.value)
            }}
            className={inputClass}
          >
            <option value="__inherit">From stylesheet · {r.text.fontFamily.split(',')[0]}</option>
            {familyOptions.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
            {!familyMatch && currentFamily !== '' && <option value="__custom">Custom · {currentFamily}</option>}
          </select>
        </Row>

        <Row label="size">
          <CssField value={inline('font-size')} placeholder={r.text.fontSize} onCommit={(v) => set('font-size', v || null)} />
        </Row>

        <Row label="weight">
          <select
            value={inline('font-weight') || '__inherit'}
            onChange={(e) => set('font-weight', e.target.value === '__inherit' ? null : e.target.value)}
            className={inputClass}
          >
            <option value="__inherit">From stylesheet · {r.text.fontWeight}</option>
            {WEIGHTS.map((w) => (
              <option key={w} value={w}>
                {w}
              </option>
            ))}
          </select>
        </Row>

        <Row label="line-height">
          <CssField
            value={inline('line-height')}
            placeholder={r.text.lineHeight}
            onCommit={(v) => set('line-height', v || null)}
          />
        </Row>

        <Row label="letter-spacing">
          <CssField
            value={inline('letter-spacing')}
            placeholder={r.text.letterSpacing}
            onCommit={(v) => set('letter-spacing', v || null)}
          />
        </Row>

        <Row label="colour">
          <CssField value={inline('color')} placeholder={r.text.color} onCommit={(v) => set('color', v || null)} />
        </Row>

        <Row label="align">
          {(
            [
              ['left', AlignLeft],
              ['center', AlignCenter],
              ['right', AlignRight],
            ] as const
          ).map(([value, Icon]) => {
            const active = r.text!.textAlign === value || (value === 'left' && r.text!.textAlign === 'start')
            return (
              <button
                key={value}
                type="button"
                title={value}
                onClick={() => set('text-align', value)}
                className={`rounded p-1 ${active ? 'bg-sky-500/20 text-sky-300' : 'text-zinc-400 hover:bg-zinc-800'}`}
              >
                <Icon size={13} />
              </button>
            )
          })}
          <button
            type="button"
            onClick={() => set('text-align', null)}
            className="ml-1 rounded px-1.5 py-1 text-[10px] text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
          >
            clear
          </button>
        </Row>

        <p className="mt-1.5 text-[11px] leading-snug text-zinc-600">
          Blank fields inherit from the strip&rsquo;s stylesheet. Typing a value writes an inline override on this block
          only; clearing it hands the property back.
        </p>
      </section>
    </>
  )
}
