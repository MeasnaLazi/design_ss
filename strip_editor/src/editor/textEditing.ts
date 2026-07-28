/**
 * `contentEditable` session on a text block inside the strip iframe.
 *
 * The stage normally sets `pointer-events: none` on the iframe so every click
 * routes through one hit-testing path. Typing needs the opposite, so a session
 * temporarily hands pointer and keyboard control to the iframe and takes it back
 * on commit. Exactly one session can be open at a time; `current` is the guard.
 *
 * Keys, chosen to match what a designer expects rather than what the browser
 * does by default:
 *   Enter      → `<br>` (browsers would insert a `<div>` wrapper)
 *   ⇧/⌘+Enter  → commit and leave
 *   Escape     → revert to the content the session started with
 *   blur       → commit
 */
import { applyContent } from './mutate'
import { getElement } from './blockRegistry'
import { sanitizeContent } from './textContent'

export type TextSession = {
  nodeId: string
  el: HTMLElement
  /** Content when the session opened, for Escape. */
  original: string
  detach: () => void
}

/** Caret anchor after a `<br>`; stripped before every commit. */
const ZERO_WIDTH = '\u200b'

let current: TextSession | null = null

export function activeTextSession(): TextSession | null {
  return current
}

/** Insert a line break at the caret without letting the browser improvise. */
function insertBreak(doc: Document): void {
  const sel = doc.defaultView?.getSelection()
  if (!sel || sel.rangeCount === 0) return
  const range = sel.getRangeAt(0)
  range.deleteContents()

  const br = doc.createElement('br')
  range.insertNode(br)

  // A trailing <br> is not rendered unless something follows it, so the caret
  // would appear not to have moved. A zero-width space gives it a landing spot.
  const marker = doc.createTextNode(ZERO_WIDTH)
  br.after(marker)
  range.setStartAfter(marker)
  range.setEndAfter(marker)
  sel.removeAllRanges()
  sel.addRange(range)
}

/** Put the caret at the end of the block, as a click-to-type would. */
function placeCaretAtEnd(doc: Document, el: HTMLElement): void {
  const range = doc.createRange()
  range.selectNodeContents(el)
  range.collapse(false)
  const sel = doc.defaultView?.getSelection()
  sel?.removeAllRanges()
  sel?.addRange(range)
}

export type BeginOptions = {
  iframe: HTMLIFrameElement
  nodeId: string
  /** Called after the session ends, whether committed or reverted. */
  onEnd: (committed: boolean) => void
}

/**
 * Open an editing session. Returns null if the node is missing or a session is
 * already open.
 */
export function beginTextEditing({ iframe, nodeId, onEnd }: BeginOptions): TextSession | null {
  if (current) return null
  const doc = iframe.contentDocument
  const el = getElement(nodeId)
  if (!doc || !el) return null

  const original = el.innerHTML
  let reverted = false

  const onKeyDown = (e: KeyboardEvent): void => {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (e.shiftKey || e.metaKey || e.ctrlKey) {
        el.blur()
        return
      }
      insertBreak(doc)
      return
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      reverted = true
      el.innerHTML = original
      el.blur()
    }
  }

  // Paste as plain text: the clipboard's markup would bring fonts and colours
  // that have nothing to do with this design, and sanitizing after the fact is
  // strictly worse than never inserting it.
  const onPaste = (e: ClipboardEvent): void => {
    e.preventDefault()
    const text = e.clipboardData?.getData('text/plain') ?? ''
    doc.defaultView?.getSelection()?.getRangeAt(0).insertNode(doc.createTextNode(text))
    doc.defaultView?.getSelection()?.collapseToEnd()
  }

  const onBlur = (): void => {
    end()
  }

  const end = (): void => {
    if (current?.el !== el) return
    detach()
    current = null

    if (reverted) {
      el.innerHTML = original
      onEnd(false)
      return
    }
    // Strip the zero-width spaces used as caret anchors before committing.
    el.innerHTML = el.innerHTML.replaceAll(ZERO_WIDTH, '')
    // `original` is the baseline: the element already holds the typed text, so
    // letting applyContent read it back would compare the edit against itself.
    const committed = applyContent(nodeId, sanitizeContent(el), `text:${nodeId}`, original)
    onEnd(committed)
  }

  const detach = (): void => {
    el.removeEventListener('keydown', onKeyDown)
    el.removeEventListener('paste', onPaste)
    el.removeEventListener('blur', onBlur)
    el.removeAttribute('contenteditable')
    el.style.removeProperty('cursor')
    iframe.style.pointerEvents = 'none'
  }

  el.setAttribute('contenteditable', 'plaintext-only')
  // Safari and older Chromium ignore plaintext-only; fall back to true, which
  // the sanitizer cleans up on commit anyway.
  if (el.contentEditable !== 'plaintext-only') el.setAttribute('contenteditable', 'true')
  el.style.setProperty('cursor', 'text')
  el.addEventListener('keydown', onKeyDown)
  el.addEventListener('paste', onPaste)
  el.addEventListener('blur', onBlur)

  iframe.style.pointerEvents = 'auto'
  el.focus({ preventScroll: true })
  placeCaretAtEnd(doc, el)

  current = { nodeId, el, original, detach }
  return current
}

/** Force the open session to finish (selection change, save, reload). */
export function endTextEditing(): void {
  current?.el.blur()
}
