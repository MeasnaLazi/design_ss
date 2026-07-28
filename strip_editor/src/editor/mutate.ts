/**
 * The single write path into the strip document.
 *
 * Everything that changes the design goes through this module, so that (a) each
 * change is recorded as a reversible command, and (b) there is exactly one place
 * to audit when asking "what can this editor write?". Inline styles and text
 * content are the only write targets; author stylesheets are never rewritten.
 */
import { contentEquivalent } from './textContent'
import { getElement } from './blockRegistry'
import { useHistoryStore } from '../store/useHistoryStore'
import type { Declaration } from './geometry'

/**
 * Write declarations to a block's inline style and record them.
 * A `null` value removes the declaration.
 *
 * Returns false when the node is gone (document reloaded mid-gesture).
 */
export function applyDeclarations(
  nodeId: string,
  decls: Array<{ prop: string; value: string | null }>,
  gesture?: string,
): boolean {
  const el = getElement(nodeId)
  if (!el) return false

  const { record } = useHistoryStore.getState()
  for (const { prop, value } of decls) {
    const before = el.style.getPropertyValue(prop) || null
    if (before === value) continue
    if (value === null) el.style.removeProperty(prop)
    else el.style.setProperty(prop, value)
    record({ type: 'style', nodeId, prop, before, after: value, gesture })
  }
  return true
}

/** Convenience for {@link Declaration} lists coming out of `geometry.ts`. */
export function applyGeometry(nodeId: string, decls: Declaration[], gesture?: string): boolean {
  return applyDeclarations(nodeId, decls, gesture)
}

/** Authoring attributes that changing requires a device rebuild. */
const DEVICE_ATTRIBUTES = new Set(['data-pack', 'data-pose', 'data-screenshot', 'data-fit', 'data-screen-fallback'])

/**
 * Set or remove an authoring attribute (`null` removes it).
 *
 * For a device block this also re-runs `composer/device-frames.mjs` on that one
 * element, because pose and screenshot are inputs to a homography the runtime
 * computed at load time — the DOM will not update on its own. The rebuild is
 * asynchronous (it fetches the pose SVG and decodes the screenshot), so the
 * returned promise resolves only once the block is visually correct and safe to
 * measure again.
 */
export async function applyAttribute(
  nodeId: string,
  name: string,
  value: string | null,
  gesture?: string,
): Promise<{ changed: boolean; error?: string }> {
  const el = getElement(nodeId)
  if (!el) return { changed: false }

  const before = el.getAttribute(name)
  if (before === value) return { changed: false }

  if (value === null) el.removeAttribute(name)
  else el.setAttribute(name, value)
  useHistoryStore.getState().record({ type: 'attribute', nodeId, name, before, after: value, gesture })

  if (!el.hasAttribute('data-device') || !DEVICE_ATTRIBUTES.has(name)) return { changed: true }

  const runtime = (el.ownerDocument.defaultView as ComposerWindow | null)?.__composerDevices
  if (!runtime) {
    return { changed: true, error: 'the composer device runtime is not loaded in this document' }
  }
  try {
    await runtime.rebuildDevice(el)
    return { changed: true }
  } catch (e: unknown) {
    return { changed: true, error: e instanceof Error ? e.message : String(e) }
  }
}

type ComposerWindow = Window & {
  __composerDevices?: { rebuildDevice: (el: HTMLElement) => Promise<void> }
}

/**
 * Replace a text block's inner markup with already-sanitized content.
 *
 * `knownBefore` matters more than it looks. Callers that compute new content
 * *without* touching the DOM (the inspector's copy box) can let this read the
 * current `innerHTML` as the baseline. A `contentEditable` session cannot: the
 * user typed straight into the element, so by commit time `innerHTML` is already
 * the new text, and comparing it against itself would conclude nothing changed
 * — no command recorded, no dirty state, Save greyed out over a visibly edited
 * design. Such callers must pass the content the session opened with.
 *
 * Whitespace-only differences are still ignored: `contentEditable` reflows the
 * author's indentation the moment a block is focused, and treating that as an
 * edit would mark the document dirty for merely looking at it.
 */
export function applyContent(
  nodeId: string,
  sanitized: string,
  gesture?: string,
  knownBefore?: string,
): boolean {
  const el = getElement(nodeId)
  if (!el) return false
  const before = knownBefore ?? el.innerHTML

  if (before === sanitized || contentEquivalent(before, sanitized)) {
    // No real change — put the authored markup back so the live DOM keeps
    // matching the file rather than the browser's reflowed version of it.
    if (el.innerHTML !== before) el.innerHTML = before
    return false
  }

  el.innerHTML = sanitized
  useHistoryStore.getState().record({ type: 'content', nodeId, before, after: sanitized, gesture })
  return true
}
