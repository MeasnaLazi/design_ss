/**
 * Undo and redo.
 *
 * Every command already carries both sides of its change — `before`/`after` for
 * properties, `beforeIndex`/`afterIndex` for structure — so undo and redo are
 * the *same* function pointed at different sides. That symmetry is the whole
 * design: there is no separate "inverse command" type to keep in step.
 *
 * These writes must not be recorded. Going through `mutate` would append a new
 * command for every step undone, and the log would grow instead of rewinding —
 * so the DOM is written directly here, and only the cursor moves in the store.
 */
import { getElement } from './blockRegistry'
import { refitDevice } from './mutate'
import { reindexLive } from './reindex'
import { useEditorStore } from '../store/useEditorStore'
import { appliedCommands, canRedo, canUndo, useHistoryStore } from '../store/useHistoryStore'
import type { EditCommand, StructureCommand } from '../store/useHistoryStore'

type ComposerWindow = Window & {
  __composerDevices?: { rebuildDevice: (el: HTMLElement) => Promise<void> }
}

/** Device attributes whose value the runtime turns into geometry. */
const DEVICE_ATTRIBUTES = new Set(['data-pack', 'data-pose', 'data-screenshot', 'data-fit', 'data-screen-fallback'])

async function rebuildIfNeeded(el: HTMLElement): Promise<void> {
  if (!el.hasAttribute('data-device')) return
  const runtime = (el.ownerDocument.defaultView as ComposerWindow | null)?.__composerDevices
  if (!runtime) return
  try {
    await runtime.rebuildDevice(el)
  } catch {
    /* reported by the block's own "did not build" state */
  }
}

/**
 * Put an element at `index` among its panel's element children, or detach it
 * when `index` is null.
 */
function placeAt(panel: HTMLElement, el: HTMLElement, index: number | null): void {
  if (index === null) {
    el.remove()
    return
  }
  const siblings = Array.from(panel.children).filter((c) => c !== el)
  const reference = siblings[index] ?? null
  panel.insertBefore(el, reference)
}

async function applyStructure(cmd: StructureCommand, direction: 'undo' | 'redo'): Promise<void> {
  // A move is the one op whose two sides live in different panels; undoing it
  // must put the element back in the panel it came from, not the one it is in.
  const panelId = direction === 'undo' ? (cmd.fromPanelId ?? cmd.panelId) : cmd.panelId
  const panel = getElement(panelId)
  if (!panel) return
  placeAt(panel, cmd.element, direction === 'undo' ? cmd.beforeIndex : cmd.afterIndex)

  // A block re-inserted after having been deleted may never have been built —
  // or may carry a stage from before. Rebuild when it is a device and empty.
  if (cmd.element.isConnected && cmd.element.querySelector('.composer-device-stage') === null) {
    await rebuildIfNeeded(cmd.element)
  }
}

/** Apply one command in the given direction, writing the DOM without recording. */
async function applyCommand(cmd: EditCommand, direction: 'undo' | 'redo'): Promise<void> {
  if (cmd.type === 'structure') {
    await applyStructure(cmd, direction)
    return
  }

  const el = getElement(cmd.nodeId)
  if (!el) return
  const target = direction === 'undo' ? cmd.before : cmd.after

  if (cmd.type === 'style') {
    if (target === null || target === '') el.style.removeProperty(cmd.prop)
    else el.style.setProperty(cmd.prop, target)
    if (el.getAttribute('style')?.trim() === '') el.removeAttribute('style')
    // Undoing a device resize has the same stale-scale problem as making one.
    refitDevice(el)
    return
  }

  if (cmd.type === 'attribute') {
    if (target === null) el.removeAttribute(cmd.name)
    else el.setAttribute(cmd.name, target)
    if (DEVICE_ATTRIBUTES.has(cmd.name)) await rebuildIfNeeded(el)
    return
  }

  // content
  el.innerHTML = target as string
}

/** Keep the selection meaningful after the document moves under it. */
function settleSelection(): void {
  reindexLive()
  const { selectedId, nodes, select } = useEditorStore.getState()
  if (selectedId && !nodes.some((n) => n.id === selectedId)) select(null)
}

/**
 * One undo step is one *gesture*, not one command.
 *
 * A single drag emits a command per property — `left` and `top` are separate,
 * and a cross-panel drag adds a structure command on top. Stepping one command
 * at a time would make a diagonal drag take two presses, and would expose a
 * half-undone cross-panel move: the element back in its old panel while still
 * carrying coordinates measured against the new one, which puts it somewhere it
 * never was. Commands recorded without a gesture stand alone.
 */
function spanBefore(log: EditCommand[], end: number): number {
  const gesture = log[end - 1]?.gesture
  if (!gesture) return end - 1
  let start = end - 1
  while (start > 0 && log[start - 1].gesture === gesture) start--
  return start
}

function spanAfter(log: EditCommand[], start: number): number {
  const gesture = log[start]?.gesture
  if (!gesture) return start + 1
  let end = start + 1
  while (end < log.length && log[end].gesture === gesture) end++
  return end
}

export async function undo(): Promise<void> {
  const history = useHistoryStore.getState()
  if (!canUndo(history)) return
  const end = history.cursor
  const start = spanBefore(history.log, end)
  // Reverse order: the log records what happened forwards, so unwinding it runs
  // backwards. For a move that restores the coordinates before the element.
  for (let i = end - 1; i >= start; i--) await applyCommand(history.log[i], 'undo')
  useHistoryStore.getState().setCursor(start)
  settleSelection()
}

export async function redo(): Promise<void> {
  const history = useHistoryStore.getState()
  if (!canRedo(history)) return
  const start = history.cursor
  const end = spanAfter(history.log, start)
  for (let i = start; i < end; i++) await applyCommand(history.log[i], 'redo')
  useHistoryStore.getState().setCursor(end)
  settleSelection()
}

/**
 * Label a whole gesture, not just one of its commands.
 *
 * A cross-panel drag ends with a `top` command, so describing the last one alone
 * would call it "change top" when what the user did was move a block to another
 * panel. A structural command in the span always names the gesture better than a
 * property write does.
 */
function describeSpan(log: EditCommand[], start: number, end: number): string | null {
  if (start >= end) return null
  const structural = log.slice(start, end).find((c) => c.type === 'structure')
  return describe(structural ?? log[end - 1])
}

/** Human-readable label for the next undo step, for the button tooltip. */
export function undoLabel(): string | null {
  const { log, cursor } = useHistoryStore.getState()
  if (cursor === 0) return null
  return describeSpan(log, spanBefore(log, cursor), cursor)
}

export function redoLabel(): string | null {
  const { log, cursor } = useHistoryStore.getState()
  if (cursor >= log.length) return null
  return describeSpan(log, cursor, spanAfter(log, cursor))
}

function describe(cmd: EditCommand): string {
  switch (cmd.type) {
    case 'style':
      return `change ${cmd.prop}`
    case 'attribute':
      return `change ${cmd.name.replace(/^data-/, '')}`
    case 'content':
      return 'edit text'
    case 'structure':
      return cmd.op === 'move' ? 'move to another panel' : cmd.op
  }
}

export { appliedCommands }
