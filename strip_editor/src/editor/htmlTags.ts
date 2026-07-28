/**
 * Locating things inside an element's **opening tag** in the source text.
 *
 * P2 and P3 only ever rewrote one attribute (`style`) and one text range, both
 * findable by searching for their exact current value. P4 has to change
 * `data-pose`, add a `data-screenshot` where none exists, and remove a
 * `data-fit` — operations on the tag's structure, which need real offsets.
 *
 * This is a scanner over the source, not a parser: it takes an offset already
 * known to sit inside an opening tag (from an anchor attribute whose value we
 * matched) and reads the tag's attribute list from there. That keeps it small
 * and avoids reimplementing HTML parsing, at the cost of needing an anchor —
 * see `anchorOffsetFor` for how one is found.
 */

export type Range = { start: number; end: number }

export type AttributeSpan = {
  name: string
  /** Whole `name="value"` (or bare `name`) span. */
  full: Range
  /** The value text between the quotes; null for a valueless attribute. */
  value: Range | null
  quote: '"' | "'" | null
}

export type OpeningTag = {
  /** Offset of `<`. */
  start: number
  /** Offset just past `>`. */
  end: number
  name: string
  attributes: AttributeSpan[]
  /** Offset of the `>` (or of `/` in `<x />`) — where new attributes go. */
  insertAt: number
}

/** Index just past the `>` that closes the opening tag starting at `from`. */
export function endOfOpeningTag(html: string, from: number): number | null {
  let quote: string | null = null
  for (let i = from; i < html.length; i++) {
    const c = html[i]
    if (quote) {
      if (c === quote) quote = null
      continue
    }
    if (c === '"' || c === "'") quote = c
    else if (c === '>') return i + 1
  }
  return null
}

/** Walk back from an offset inside a tag to its `<`. */
function startOfOpeningTag(html: string, insideOffset: number): number | null {
  for (let i = insideOffset; i >= 0; i--) {
    if (html[i] === '<') return i
  }
  return null
}

const NAME_CHAR = /[^\s"'>/=]/

/**
 * Read the opening tag containing `insideOffset`.
 *
 * `insideOffset` must land in the attribute region of the tag, not inside an
 * attribute value that itself contains `<` — the backward walk would stop
 * there. Anchors are chosen to make that safe.
 */
export function readOpeningTag(html: string, insideOffset: number): OpeningTag | null {
  const start = startOfOpeningTag(html, insideOffset)
  if (start === null) return null
  const end = endOfOpeningTag(html, start)
  if (end === null) return null

  let i = start + 1
  let name = ''
  while (i < end && NAME_CHAR.test(html[i])) name += html[i++]
  if (name === '') return null

  const attributes: AttributeSpan[] = []
  // `end - 1` is the `>`; a self-closing `/` sits just before it.
  const limit = end - 1

  while (i < limit) {
    while (i < limit && /\s/.test(html[i])) i++
    if (i >= limit || html[i] === '/') break

    const nameStart = i
    let attrName = ''
    while (i < limit && NAME_CHAR.test(html[i])) attrName += html[i++]
    if (attrName === '') {
      i++ // unexpected character; skip rather than spin
      continue
    }

    let j = i
    while (j < limit && /\s/.test(html[j])) j++

    if (html[j] !== '=') {
      // Valueless attribute, e.g. `data-device`.
      attributes.push({ name: attrName, full: { start: nameStart, end: i }, value: null, quote: null })
      continue
    }

    j++ // past '='
    while (j < limit && /\s/.test(html[j])) j++

    const q = html[j]
    if (q === '"' || q === "'") {
      const valueStart = j + 1
      const valueEnd = html.indexOf(q, valueStart)
      if (valueEnd === -1 || valueEnd > limit) return null
      attributes.push({
        name: attrName,
        full: { start: nameStart, end: valueEnd + 1 },
        value: { start: valueStart, end: valueEnd },
        quote: q,
      })
      i = valueEnd + 1
      continue
    }

    // Unquoted value.
    const valueStart = j
    while (j < limit && !/[\s>]/.test(html[j])) j++
    attributes.push({
      name: attrName,
      full: { start: nameStart, end: j },
      value: { start: valueStart, end: j },
      quote: null,
    })
    i = j
  }

  // Insert before a self-closing slash if present, otherwise before `>`.
  let insertAt = end - 1
  while (insertAt > start && /[\s/]/.test(html[insertAt - 1])) insertAt--

  return { start, end, name: name.toLowerCase(), attributes, insertAt }
}

/**
 * An offset inside the source opening tag of `el`, found by matching one of its
 * attributes verbatim.
 *
 * The attribute has to be *uniquely* findable, which is why `style` is tried
 * first: on a strip it is long and effectively a fingerprint. Short shared
 * values (`class="rule"`, repeated on four blocks) are skipped automatically
 * because they match more than once. Returning null means the save refuses
 * rather than patching the wrong element.
 */
export function anchorOffsetFor(html: string, el: Element): number | null {
  const preferred = ['style', 'data-screenshot', 'src', 'id', 'data-pose', 'class']
  const names = [
    ...preferred.filter((n) => el.hasAttribute(n)),
    ...el.getAttributeNames().filter((n) => !preferred.includes(n)),
  ]

  for (const name of names) {
    const value = el.getAttribute(name)
    if (!value) continue
    for (const quote of ['"', "'"]) {
      const needle = `${name}=${quote}${value}${quote}`
      const first = html.indexOf(needle)
      if (first === -1) continue
      if (html.indexOf(needle, first + 1) !== -1) continue // matches elsewhere too
      return first
    }
  }
  return null
}

/**
 * Range of an element's inner content, given its opening tag. Same-name nesting
 * is handled by depth counting; void elements inside (`<br>`) never open a
 * level.
 */
export function contentRange(html: string, tag: OpeningTag): Range | null {
  const start = tag.end
  const open = new RegExp(`<${tag.name}(?=[\\s/>])`, 'gi')
  const close = new RegExp(`</${tag.name}\\s*>`, 'gi')
  let depth = 0
  let cursor = start

  for (;;) {
    open.lastIndex = cursor
    close.lastIndex = cursor
    const nextOpen = open.exec(html)
    const nextClose = close.exec(html)
    if (!nextClose) return null

    if (nextOpen && nextOpen.index < nextClose.index) {
      depth++
      cursor = nextOpen.index + nextOpen[0].length
      continue
    }
    if (depth === 0) return { start, end: nextClose.index }
    depth--
    cursor = nextClose.index + nextClose[0].length
  }
}

export function findAttribute(tag: OpeningTag, name: string): AttributeSpan | undefined {
  const lower = name.toLowerCase()
  return tag.attributes.find((a) => a.name.toLowerCase() === lower)
}

export type Splice = { start: number; end: number; text: string }

/** Minimal escaping for a double-quoted attribute value. */
export function escapeAttributeValue(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
}

/**
 * Splice that sets, adds or removes one attribute on an opening tag.
 *
 * Setting an existing attribute rewrites only its value, so the rest of the tag
 * — including the author's line breaks between attributes — is untouched.
 * Adding one appends it just before `>`. Removing one takes the preceding
 * whitespace with it so no double space is left behind.
 */
export function attributeSplice(
  html: string,
  tag: OpeningTag,
  name: string,
  value: string | null,
): Splice | null {
  const existing = findAttribute(tag, name)

  if (value === null) {
    if (!existing) return null
    let from = existing.full.start
    while (from > tag.start + 1 && /\s/.test(html[from - 1])) from--
    return { start: from, end: existing.full.end, text: '' }
  }

  if (existing?.value) {
    return { start: existing.value.start, end: existing.value.end, text: escapeAttributeValue(value) }
  }
  if (existing) {
    // Valueless attribute gaining a value.
    return { start: existing.full.start, end: existing.full.end, text: `${name}="${escapeAttributeValue(value)}"` }
  }
  return { start: tag.insertAt, end: tag.insertAt, text: ` ${name}="${escapeAttributeValue(value)}"` }
}
