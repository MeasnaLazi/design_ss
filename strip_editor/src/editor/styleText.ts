/**
 * Declaration-level editing of a raw `style` attribute **string**.
 *
 * Why not CSSOM: `el.style.setProperty()` rewrites the entire attribute in
 * CSSOM's normal form, so touching one declaration reformats every other one
 * (`width:1500px` → `width: 1500px`, trailing semicolons dropped). The file is
 * shared with an agent and with git; a one-property change should read as a
 * one-property change. So untouched declarations are preserved byte-for-byte and
 * only the target value is swapped in place.
 */

/**
 * Split on top-level `;` only — semicolons inside `url(…)`, quoted strings, or
 * nested functions are part of a value, not separators.
 */
function splitDeclarations(styleText: string): string[] {
  const out: string[] = []
  let depth = 0
  let quote: string | null = null
  let start = 0

  for (let i = 0; i < styleText.length; i++) {
    const c = styleText[i]
    if (quote) {
      if (c === quote && styleText[i - 1] !== '\\') quote = null
      continue
    }
    if (c === '"' || c === "'") {
      quote = c
      continue
    }
    if (c === '(') depth++
    else if (c === ')') depth = Math.max(0, depth - 1)
    else if (c === ';' && depth === 0) {
      out.push(styleText.slice(start, i))
      start = i + 1
    }
  }
  out.push(styleText.slice(start))
  return out
}

/** Property name of a declaration, normalised; null if the segment is blank. */
function propertyOf(declaration: string): string | null {
  const colon = declaration.indexOf(':')
  if (colon === -1) return null
  const name = declaration.slice(0, colon).trim().toLowerCase()
  return name === '' ? null : name
}

/**
 * Infer the file's spacing habit so appended declarations match their
 * neighbours: `left: 10px` in a file that spaces after colons, `left:10px` in
 * one that does not.
 */
function separatorStyle(declarations: string[]): string {
  for (const d of declarations) {
    const colon = d.indexOf(':')
    if (colon === -1) continue
    return /^\s/.test(d.slice(colon + 1)) ? ': ' : ':'
  }
  return ': '
}

/**
 * Apply `patch` (prop → value, `null` to remove) to a style attribute string.
 * Existing declarations are edited in place; new ones are appended; removals
 * drop the whole segment. Returns the original string unchanged if nothing
 * differs.
 */
export function patchStyleText(styleText: string, patch: Map<string, string | null>): string {
  const segments = splitDeclarations(styleText)
  const sep = separatorStyle(segments)
  const handled = new Set<string>()

  // A trailing `;` produces a final empty segment; remember it so the rebuilt
  // string keeps the author's trailing semicolon (or absence of one).
  const lastIsBlank = segments.length > 1 && segments[segments.length - 1].trim() === ''
  const body = lastIsBlank ? segments.slice(0, -1) : segments
  const tail = lastIsBlank ? segments[segments.length - 1] : null

  const rebuilt: string[] = []
  for (const segment of body) {
    const prop = propertyOf(segment)
    if (prop === null || !patch.has(prop)) {
      rebuilt.push(segment)
      continue
    }
    handled.add(prop)
    const value = patch.get(prop)
    if (value === null || value === '') continue // removal: drop the declaration

    // Preserve the author's leading whitespace and their colon spacing.
    const colon = segment.indexOf(':')
    const leading = segment.slice(0, colon).match(/^\s*/)?.[0] ?? ''
    const afterColon = segment.slice(colon + 1).match(/^\s*/)?.[0] ?? ''
    rebuilt.push(`${leading}${prop}:${afterColon}${value}`)
  }

  for (const [prop, value] of patch) {
    if (handled.has(prop) || value === null || value === '') continue
    rebuilt.push(`${rebuilt.length > 0 ? ' ' : ''}${prop}${sep}${value}`)
  }

  if (rebuilt.length === 0) return ''
  return tail === null ? rebuilt.join(';') : `${rebuilt.join(';')};${tail}`
}
