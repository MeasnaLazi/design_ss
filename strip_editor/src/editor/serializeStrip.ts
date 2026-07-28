/**
 * Turn the editor's changes back into a strip HTML file.
 *
 * ## Two things this deliberately does not do
 *
 * **It never serializes the live DOM.** By the time the editor can measure
 * anything, `composer/device-frames.mjs` has mutated every device block: it
 * appends a `.composer-device-stage` subtree (warped screenshot, clip path,
 * inlined frame SVG) and writes `aspect-ratio`, `overflow`, and sometimes
 * `position` onto the block's inline style. Serializing that would bake
 * thousands of lines of derived markup into the file and break the declarative
 * device contract in `composer/strip-schema.md`.
 *
 * **It never re-serializes the parsed document either.** `outerHTML` normalises
 * markup: the strips spread element attributes across several lines for
 * legibility, and a round trip through the parser collapses every one of them
 * onto a single line. Moving one headline would produce a diff touching most of
 * the file — useless for review, and hostile to an agent that re-reads the file
 * between turns.
 *
 * ## What it does instead
 *
 * Parse the pristine file only to *locate* things (ids are structural, so they
 * resolve identically in the parsed copy — see `blockRegistry.indexDocument`),
 * then splice changed regions into the original text. Every byte the human did
 * not touch survives untouched, including `<head>`, comments, and attribute line
 * breaks. If a target cannot be located unambiguously, the save is refused
 * rather than guessed at.
 */
import { anchorOffsetFor, attributeSplice, contentRange, findAttribute, readOpeningTag } from './htmlTags'
import { escapeAttributeValue } from './htmlTags'
import { indexDocument, isNewNodeId } from './blockRegistry'
import { detectIndent, emitPanelContent } from './emitMarkup'
import { patchStyleText } from './styleText'
import type { FoldedEdits } from '../store/useHistoryStore'
import type { Splice } from './htmlTags'

export type SerializeResult = {
  html: string
  /** Edited node ids absent from the file on disk — structure drifted. */
  missing: string[]
  /** Edited nodes that could not be patched, with the reason. */
  unlocatable: string[]
  /** Number of changes written. */
  applied: number
}

/**
 * @param originalHtml the file exactly as read from disk
 * @param edits        folded patch from `foldEdits(history.log)`
 * @param liveDoc      the live strip document, needed only when a panel's
 *                     structure changed and its markup must be re-emitted
 */
export function serializeWithEdits(
  originalHtml: string,
  edits: FoldedEdits,
  liveDoc?: Document | null,
): SerializeResult {
  const doc = new DOMParser().parseFromString(originalHtml, 'text/html')
  const { byId } = indexDocument(doc)

  const missing: string[] = []
  const unlocatable: string[] = []
  const splices: Splice[] = []
  let applied = 0

  /**
   * Blocks inside a restructured panel are covered by that panel's re-emission,
   * which reads their *current* state from the live DOM. Splicing them
   * individually as well would write the same region twice.
   */
  const coveredByPanel = (nodeId: string): boolean => {
    if (edits.structuralPanels.size === 0) return false
    const el = byId.get(nodeId)
    if (!el) return isNewNodeId(nodeId) // a block the editor created lives only in the live DOM
    const panel = el.closest<HTMLElement>('[data-panel]')
    if (!panel) return false
    const index = Number(panel.dataset.panel)
    return edits.structuralPanels.has(`panel:${Number.isFinite(index) ? index : 0}`)
  }

  /** Read the source opening tag for a node id, or record why we cannot. */
  const tagFor = (nodeId: string): ReturnType<typeof readOpeningTag> => {
    const el = byId.get(nodeId)
    if (!el) {
      missing.push(nodeId)
      return null
    }
    const anchor = anchorOffsetFor(originalHtml, el)
    if (anchor === null) {
      unlocatable.push(`${nodeId}: no attribute on this block is unique enough to locate it in the source`)
      return null
    }
    const tag = readOpeningTag(originalHtml, anchor)
    if (!tag) unlocatable.push(`${nodeId}: could not read its opening tag`)
    return tag
  }

  // --- inline style declarations ------------------------------------------
  for (const [nodeId, props] of edits.styles) {
    if (coveredByPanel(nodeId)) continue
    const tag = tagFor(nodeId)
    if (!tag) continue

    const attr = findAttribute(tag, 'style')
    // Patch the *source* text of the attribute, not the parsed value, so
    // entities and the author's spacing survive. New values are escaped before
    // they go in, so the result can be spliced verbatim.
    const escaped = new Map<string, string | null>()
    for (const [prop, value] of props) escaped.set(prop, value === null ? null : escapeAttributeValue(value))

    if (attr?.value) {
      const current = originalHtml.slice(attr.value.start, attr.value.end)
      const next = patchStyleText(current, escaped)
      if (next === current) continue
      splices.push({ start: attr.value.start, end: attr.value.end, text: next })
    } else {
      // No style attribute yet — build one from the patch alone.
      const next = patchStyleText('', escaped)
      if (next === '') continue
      splices.push({ start: tag.insertAt, end: tag.insertAt, text: ` style="${next}"` })
    }
    applied += props.size
  }

  // --- authoring attributes (data-pose, data-screenshot, data-fit, …) ------
  for (const [nodeId, attrs] of edits.attributes) {
    if (coveredByPanel(nodeId)) continue
    const tag = tagFor(nodeId)
    if (!tag) continue
    for (const [name, value] of attrs) {
      const splice = attributeSplice(originalHtml, tag, name, value)
      if (!splice) continue // removing something that was never there
      splices.push(splice)
      applied++
    }
  }

  // --- text content --------------------------------------------------------
  for (const [nodeId, content] of edits.contents) {
    if (coveredByPanel(nodeId)) continue
    const el = byId.get(nodeId)
    if (!el) {
      missing.push(nodeId)
      continue
    }
    if (el.innerHTML === content) continue
    const tag = tagFor(nodeId)
    if (!tag) continue
    const range = contentRange(originalHtml, tag)
    if (!range) {
      unlocatable.push(`${nodeId}: could not find the end of its element in the source`)
      continue
    }
    splices.push({ start: range.start, end: range.end, text: content })
    applied++
  }

  // --- restructured panels: re-emit their markup wholesale -----------------
  for (const panelId of edits.structuralPanels) {
    const target = byId.get(panelId)
    if (!target) {
      missing.push(panelId)
      continue
    }
    const livePanel = liveDoc?.querySelector<HTMLElement>(`[data-panel="${target.getAttribute('data-panel')}"]`)
    if (!livePanel) {
      unlocatable.push(`${panelId}: the live panel is unavailable, so its new markup cannot be read`)
      continue
    }
    const tag = tagFor(panelId)
    if (!tag) continue
    const range = contentRange(originalHtml, tag)
    if (!range) {
      unlocatable.push(`${panelId}: could not find the end of the panel in the source`)
      continue
    }
    // Match the indentation already used inside this panel rather than imposing
    // a house style on someone else's file.
    const next = emitPanelContent(livePanel, detectIndent(originalHtml.slice(range.start, range.end)))
    if (next === originalHtml.slice(range.start, range.end)) continue
    splices.push({ start: range.start, end: range.end, text: next })
    applied++
  }

  // Right-to-left so earlier offsets stay valid as we rewrite. Splices on one
  // element never overlap: attribute values sit inside the opening tag, content
  // after it, and each attribute occupies its own span.
  splices.sort((a, b) => b.start - a.start || b.end - a.end)
  let html = originalHtml
  for (const s of splices) html = html.slice(0, s.start) + s.text + html.slice(s.end)

  return { html, missing, unlocatable, applied }
}
