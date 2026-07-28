/**
 * Text-block content handling.
 *
 * A text block's markup is deliberately tiny: text nodes and `<br>`, nothing
 * else. `contentEditable` does not respect that on its own — browsers insert
 * `<div>` and `<span style="...">` wrappers on Enter, and a paste drops in
 * whatever markup was on the clipboard, fonts and colours included. So every
 * commit goes through {@link sanitizeContent}, which rebuilds the markup from
 * scratch rather than trying to strip the bad parts out of it.
 *
 * This is also why the strip stays clean without a "remove editor artifacts"
 * pass: saves splice sanitized content into the file, so a stray
 * `contenteditable` attribute or a browser-inserted wrapper in the live DOM is
 * structurally incapable of reaching disk.
 */

const VOID_BREAK = '<br>'

/** Escape a text run for HTML. `&` first, or the other escapes get double-encoded. */
function escapeText(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/**
 * Rebuild an element's inner markup as text nodes and `<br>` only.
 * Block-level elements the browser may have inserted become line breaks, which
 * is what the author meant by pressing Enter.
 */
export function sanitizeContent(el: HTMLElement): string {
  const parts: string[] = []
  const BLOCK = new Set(['DIV', 'P', 'LI', 'TR', 'SECTION', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6'])

  // A block boundary is a line break only when there is content on both sides of
  // it, so `<div>a</div><div>b</div>` yields `a<br>b` rather than a stray
  // leading or trailing break. The break is therefore *pending* until the next
  // real content arrives.
  const state = { emitted: false, pendingBreak: false }

  const push = (text: string): void => {
    if (text === '') return
    if (state.pendingBreak) {
      parts.push(VOID_BREAK)
      state.pendingBreak = false
    }
    parts.push(text)
    state.emitted = true
  }

  const walk = (node: Node): void => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === 3) {
        push(escapeText(child.nodeValue ?? ''))
        continue
      }
      if (child.nodeType !== 1) continue
      const element = child as HTMLElement

      if (element.tagName === 'BR') {
        state.pendingBreak = false // an explicit break supersedes a pending one
        parts.push(VOID_BREAK)
        state.emitted = true
        continue
      }

      if (BLOCK.has(element.tagName)) {
        if (state.emitted) state.pendingBreak = true
        walk(element)
        if (state.emitted) state.pendingBreak = true
        continue
      }

      // Inline wrapper (span, b, i, font…): keep the words, drop the element.
      walk(element)
    }
  }

  walk(el)

  return (
    parts
      .join('')
      // Non-breaking spaces are a contentEditable artifact, not authorial intent.
      .replace(/\u00a0/g, ' ')
  )
}

/** Inner markup → plain text for a textarea, `<br>` becoming a newline. */
export function contentToPlainText(innerHtml: string): string {
  return innerHtml
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
}

/** Plain text → inner markup, newlines becoming `<br>`. */
export function plainTextToContent(text: string): string {
  return text.split('\n').map(escapeText).join(VOID_BREAK)
}

/**
 * Whether two content strings differ once incidental whitespace is set aside.
 * `contentEditable` reflows indentation constantly; without this, merely
 * focusing a block would mark the document dirty.
 */
export function contentEquivalent(a: string, b: string): boolean {
  const norm = (s: string): string =>
    s
      .replace(/<br\s*\/?>/gi, '<br>')
      .replace(/\s+/g, ' ')
      .trim()
  return norm(a) === norm(b)
}
