/**
 * Printing a panel's children back to strip-schema markup.
 *
 * Used only when a panel's *structure* changed. Every other edit still goes
 * through precise source splices, so this is the one place where the editor
 * chooses its own formatting over the author's — and it is scoped to the single
 * panel that was restructured.
 *
 * The hard part is not printing, it is knowing what *not* to print. By the time
 * the editor sees a device block, `composer/device-frames.mjs` has filled it
 * with a `.composer-device-stage` subtree (warped screenshot, clip path, an
 * inlined frame SVG — often thousands of nodes) and written derived inline
 * styles onto it. None of that belongs in the file: the runtime recomputes it
 * on every load, and persisting one pose's `aspect-ratio` would freeze it there.
 */

/** Inline properties the composer runtime derived rather than the author writing. */
type DerivedMarker = HTMLElement & { __composerDerivedProps?: string[] }

/** Elements that never get a closing tag. */
const VOID_TAGS = new Set(['img', 'br', 'hr', 'input', 'source'])

/**
 * Deep clone of a block with every trace of the device runtime removed, so what
 * is printed is the declarative element the schema describes.
 */
export function cleanClone(el: HTMLElement): HTMLElement {
  const clone = el.cloneNode(true) as HTMLElement

  const devices: HTMLElement[] = []
  if (clone.hasAttribute('data-device')) devices.push(clone)
  devices.push(...Array.from(clone.querySelectorAll<HTMLElement>('[data-device]')))

  // Walk the originals in step with the clones: the derived-property list lives
  // on the live element, not on the copy.
  const liveDevices: HTMLElement[] = []
  if (el.hasAttribute('data-device')) liveDevices.push(el)
  liveDevices.push(...Array.from(el.querySelectorAll<HTMLElement>('[data-device]')))

  devices.forEach((device, i) => {
    device.replaceChildren()
    const derived = (liveDevices[i] as DerivedMarker | undefined)?.__composerDerivedProps ?? [
      // Fallback for a block that never built (missing screenshot): the runtime
      // sets these three, and none of them is ever authored on a device block.
      'aspect-ratio',
      'overflow',
      'position',
    ]
    for (const prop of derived) device.style.removeProperty(prop)
    device.style.removeProperty('outline') // error marker from a failed build
    if (device.getAttribute('style')?.trim() === '') device.removeAttribute('style')
  })

  // contentEditable is a live-session artifact; it can only be present if a text
  // session is open while something else triggers a save.
  clone.removeAttribute('contenteditable')
  for (const nested of Array.from(clone.querySelectorAll('[contenteditable]'))) {
    nested.removeAttribute('contenteditable')
  }

  return clone
}

/** Serialize one block at the given indentation. */
function printBlock(el: HTMLElement, indent: string): string {
  const clone = cleanClone(el)
  const html = clone.outerHTML
  // A device block prints as one empty element; anything else keeps whatever
  // inner markup it has (text runs, decor children).
  return indent + html
}

export type EmitOptions = {
  /** Indentation for each child, e.g. four spaces. */
  indent?: string
  /** Line ending plus indentation placed before the panel's closing tag. */
  closingIndent?: string
}

/**
 * Element test that works across realms.
 *
 * `c instanceof HTMLElement` compares against the **parent window's**
 * constructor, but the strip lives in an iframe and its elements are instances
 * of the *iframe's* `HTMLElement`. Cross-realm `instanceof` is always false, so
 * that test silently rejected every child of every panel — and a restructured
 * panel would have been saved empty. `nodeType` is realm-independent.
 */
function isElement(node: Node): node is HTMLElement {
  return node.nodeType === 1
}

/**
 * Inner markup for a panel, as it should appear in the file.
 *
 * Only element children are printed. Comments between blocks are dropped — a
 * real loss, and the reason structural editing re-emits one panel rather than
 * the document.
 */
export function emitPanelContent(panel: HTMLElement, options: EmitOptions = {}): string {
  const indent = options.indent ?? '    '
  const closingIndent = options.closingIndent ?? '  '
  const children = Array.from(panel.children).filter(isElement)
  if (children.length === 0) return `\n${closingIndent}`
  const body = children.map((c) => printBlock(c, indent)).join('\n')
  return `\n${body}\n${closingIndent}`
}

/**
 * Indentation the file already uses inside this panel, so re-emitted markup
 * lines up with its neighbours instead of imposing a house style.
 */
export function detectIndent(sourceContent: string): EmitOptions {
  const lines = sourceContent.split('\n').filter((l) => l.trim() !== '')
  const first = lines[0]?.match(/^[ \t]*/)?.[0]
  const last = sourceContent.match(/\n([ \t]*)$/)?.[1]
  return { indent: first || '    ', closingIndent: last ?? '  ' }
}

export { VOID_TAGS }
