/**
 * Structural edits: adding, deleting, duplicating and reordering blocks.
 *
 * These are the only operations that change a panel's child list, and each one
 * records a `structure` command naming the panel. That flag is what tells the
 * serializer to re-emit that panel's markup from the live DOM instead of
 * splicing individual properties — see `serializeStrip.ts`.
 *
 * Every operation that introduces or reveals a device block must let the
 * composer runtime build it, so these are async and resolve once the canvas is
 * correct and safe to measure.
 */
import { adoptElement, freshNodeId, getElement } from './blockRegistry'
import { blockTemplate } from './schema'
import { cleanClone, emitPanelContent } from './emitMarkup'
import { useHistoryStore } from '../store/useHistoryStore'
import type { InsertSpec } from './schema'

type ComposerWindow = Window & {
  __composerDevices?: { rebuildDevice: (el: HTMLElement) => Promise<void> }
}

async function buildDevicesIn(root: HTMLElement): Promise<string | undefined> {
  const runtime = (root.ownerDocument.defaultView as ComposerWindow | null)?.__composerDevices
  const devices: HTMLElement[] = []
  if (root.hasAttribute?.('data-device')) devices.push(root)
  devices.push(...Array.from(root.querySelectorAll<HTMLElement>('[data-device]')))
  if (devices.length === 0) return undefined
  if (!runtime) return 'the composer device runtime is not loaded in this document'

  const errors: string[] = []
  for (const device of devices) {
    try {
      await runtime.rebuildDevice(device)
    } catch (e: unknown) {
      errors.push(e instanceof Error ? e.message : String(e))
    }
  }
  return errors.length ? errors.join('; ') : undefined
}

/** The panel a block belongs to, and the panel's registry id. */
function panelOf(el: HTMLElement): { panel: HTMLElement; panelId: string } | null {
  const panel = el.closest<HTMLElement>('[data-panel]')
  if (!panel) return null
  const index = Number(panel.dataset.panel)
  return { panel, panelId: `panel:${Number.isFinite(index) ? index : 0}` }
}

function recordStructure(
  panelId: string,
  op: 'insert' | 'remove' | 'duplicate' | 'reorder',
  nodeId: string,
  before: string,
): void {
  useHistoryStore.getState().record({ type: 'structure', panelId, op, nodeId, before, gesture: `${op}:${nodeId}` })
}

/** Panel markup as it would be written to the file right now — the undo baseline. */
function snapshot(panel: HTMLElement): string {
  return emitPanelContent(panel)
}

export type StructureResult = { nodeId: string | null; error?: string }

/**
 * Insert a new block into a panel, positioned in its visible middle so it does
 * not land under existing content at the origin.
 */
export async function insertBlock(
  panelId: string,
  kind: InsertSpec['kind'],
  options: { role?: InsertSpec['role']; screenshot?: string } = {},
): Promise<StructureResult> {
  const panel = getElement(panelId)
  if (!panel) return { nodeId: null, error: 'panel not found' }

  const before = snapshot(panel)
  const rect = panel.getBoundingClientRect()
  const spec: InsertSpec = {
    kind,
    role: options.role,
    screenshot: options.screenshot,
    left: Math.round(rect.width * 0.12),
    top: Math.round(rect.height * 0.4),
  }

  const doc = panel.ownerDocument
  const holder = doc.createElement('div')
  holder.innerHTML = blockTemplate(spec)
  const el = holder.firstElementChild as HTMLElement | null
  if (!el) return { nodeId: null, error: 'template produced no element' }

  panel.appendChild(el)
  const nodeId = freshNodeId()
  adoptElement(el, nodeId)
  recordStructure(panelId, 'insert', nodeId, before)

  const error = await buildDevicesIn(el)
  return { nodeId, error }
}

/** Remove a block. Panels themselves are never removable. */
export function removeBlock(nodeId: string): StructureResult {
  const el = getElement(nodeId)
  if (!el) return { nodeId: null, error: 'block not found' }
  const owner = panelOf(el)
  if (!owner) return { nodeId: null, error: 'block is not inside a panel' }

  const before = snapshot(owner.panel)
  el.remove()
  recordStructure(owner.panelId, 'remove', nodeId, before)
  return { nodeId: null }
}

/**
 * Duplicate a block, offset slightly so the copy is visibly distinct rather than
 * exactly hidden behind the original.
 */
export async function duplicateBlock(nodeId: string): Promise<StructureResult> {
  const el = getElement(nodeId)
  if (!el) return { nodeId: null, error: 'block not found' }
  const owner = panelOf(el)
  if (!owner) return { nodeId: null, error: 'block is not inside a panel' }

  const before = snapshot(owner.panel)
  // Clone the *declarative* element, not the runtime-populated one: a copied
  // device must rebuild from its attributes, not inherit a stale warped stage.
  const copy = cleanClone(el)

  const nudge = (prop: 'left' | 'top' | 'right' | 'bottom'): void => {
    const raw = copy.style.getPropertyValue(prop)
    const n = Number.parseFloat(raw)
    if (raw !== '' && Number.isFinite(n)) copy.style.setProperty(prop, `${Math.round(n + 40)}px`)
  }
  nudge(copy.style.left !== '' ? 'left' : 'right')
  nudge(copy.style.top !== '' ? 'top' : 'bottom')

  el.after(copy)
  const newId = freshNodeId()
  adoptElement(copy, newId)
  recordStructure(owner.panelId, 'duplicate', newId, before)

  const error = await buildDevicesIn(copy)
  return { nodeId: newId, error }
}

export type ZMove = 'front' | 'back' | 'forward' | 'backward'

/**
 * Reorder a block among its siblings.
 *
 * Paint order is DOM order unless a block sets `z-index`, so reordering means
 * moving the element — not writing a z-index, which would fight any explicit
 * ones already in the file. Blocks carrying an explicit `z-index` are reported
 * so the UI can say why moving them may not appear to do anything.
 */
export function reorderBlock(nodeId: string, move: ZMove): StructureResult {
  const el = getElement(nodeId)
  if (!el) return { nodeId: null, error: 'block not found' }
  const owner = panelOf(el)
  if (!owner) return { nodeId: null, error: 'block is not inside a panel' }

  const siblings = Array.from(owner.panel.children)
  const at = siblings.indexOf(el)
  if (at === -1) return { nodeId: null, error: 'block is not a direct child of its panel' }

  const before = snapshot(owner.panel)
  switch (move) {
    case 'front':
      owner.panel.appendChild(el)
      break
    case 'back':
      owner.panel.insertBefore(el, siblings[0] ?? null)
      break
    case 'forward':
      if (at < siblings.length - 1) siblings[at + 1].after(el)
      break
    case 'backward':
      if (at > 0) siblings[at - 1].before(el)
      break
  }

  // Already at the end it was asked to move to: nothing happened, so record
  // nothing. Compare positions, not markup — two blocks can serialize
  // identically while occupying different slots.
  if (Array.from(owner.panel.children).indexOf(el) === at) return { nodeId }

  recordStructure(owner.panelId, 'reorder', nodeId, before)

  const explicitZ = el.ownerDocument.defaultView?.getComputedStyle(el).zIndex
  if (explicitZ && explicitZ !== 'auto') {
    return { nodeId, error: `This block has an explicit z-index (${explicitZ}), which overrides DOM order.` }
  }
  return { nodeId }
}
