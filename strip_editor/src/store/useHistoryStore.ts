import { create } from 'zustand'

/**
 * Every mutation the editor makes, as a flat log of reversible commands.
 *
 * Two consumers:
 *   • **Save** folds the log into per-node patches and splices them into the
 *     file on disk (see `editor/serializeStrip.ts`).
 *   • **Undo/redo** (P5) walks the log; `before` is already recorded, so that
 *     phase adds a cursor and replay, not new bookkeeping.
 */

/** A single inline-style declaration. `null` after means *remove it*. */
export type StyleCommand = {
  type: 'style'
  nodeId: string
  prop: string
  before: string | null
  after: string | null
  gesture?: string
}

/** The inner HTML of a text block — sanitized to text nodes and `<br>` only. */
export type ContentCommand = {
  type: 'content'
  nodeId: string
  before: string
  after: string
  gesture?: string
}

/**
 * An authoring attribute — `data-pose`, `data-screenshot`, `data-fit`,
 * `data-screen-fallback`, `src`. `null` means the attribute is absent, both as a
 * before state and as an instruction to remove it.
 */
export type AttributeCommand = {
  type: 'attribute'
  nodeId: string
  name: string
  before: string | null
  after: string | null
  gesture?: string
}

/**
 * A change to a panel's *child structure* — insert, delete, duplicate, reorder.
 *
 * Two things are unusual here.
 *
 * It names the panel, not just the block: once a panel's children change, the
 * file's markup for that whole panel is rewritten from the live DOM at save
 * time, because there is no honest way to express "insert this element between
 * these two" as a source-offset splice without reimplementing an HTML printer
 * for someone else's formatting.
 *
 * And it holds the **element itself** rather than a markup snapshot. Undoing a
 * delete by re-parsing saved markup would produce a *different* element object,
 * losing the node's identity and with it any pending edits keyed to it. Keeping
 * the reference means the very same element goes back into the panel — a
 * removed element is detached, not destroyed. Positions are child indices:
 * `null` means the element was not in the panel at that point.
 */
export type StructureCommand = {
  type: 'structure'
  /**
   * The panel the block ends up in. For a `move` this is the destination, and
   * {@link StructureCommand.fromPanelId} holds the origin.
   */
  panelId: string
  /** What happened, for the undo label. */
  op: 'insert' | 'remove' | 'duplicate' | 'reorder' | 'move'
  nodeId: string
  /** Live element reference — deliberately not serializable. */
  element: HTMLElement
  beforeIndex: number | null
  afterIndex: number | null
  /**
   * Origin panel of a cross-panel `move`; absent for every other op.
   *
   * A move is the one structural change that touches *two* panels, so both have
   * to be re-emitted at save — leaving the origin out would write the block into
   * its new panel while the old panel's markup still contained it, duplicating
   * it in the file.
   */
  fromPanelId?: string
  gesture?: string
}

export type EditCommand = StyleCommand | ContentCommand | AttributeCommand | StructureCommand

export type FoldedEdits = {
  styles: Map<string, Map<string, string | null>>
  attributes: Map<string, Map<string, string | null>>
  contents: Map<string, string>
  /** Panels whose markup must be re-emitted wholesale. */
  structuralPanels: Set<string>
}

type HistoryState = {
  log: EditCommand[]
  /**
   * How many commands are currently applied. `log[0…cursor)` is the document's
   * state; `log[cursor…]` has been undone and can be redone until a new edit
   * truncates it.
   */
  cursor: number
  /** Cursor position at the last successful save; -1 once unreachable. */
  savedAt: number
  /** Bumped on every mutation so views re-measure without diffing the log. */
  revision: number

  record: (cmd: EditCommand) => void
  /**
   * Announce that the DOM settled, without recording anything.
   *
   * Some edits finish asynchronously — a device rebuild fetches a pose SVG and
   * decodes a screenshot. The command is recorded when the edit *starts*, so
   * views re-measure while the block is mid-rebuild and see a half-torn-down
   * element. Without a second signal when the work completes, that transient
   * reading is the last one anybody takes.
   */
  touch: () => void
  /** Move the cursor after the DOM has been changed by `editor/undoRedo.ts`. */
  setCursor: (cursor: number) => void
  markSaved: () => void
  /** Discard all history — on document open, close, or reload. */
  reset: () => void
}

/** Do these two commands write the same thing on the same block? */
function sameTarget(a: EditCommand, b: EditCommand): boolean {
  if (a.type !== b.type) return false
  if (a.type === 'structure' || b.type === 'structure') return false // each is distinct
  if (a.nodeId !== b.nodeId) return false
  if (a.type === 'style' && b.type === 'style') return a.prop === b.prop
  if (a.type === 'attribute' && b.type === 'attribute') return a.name === b.name
  return a.type === 'content' && b.type === 'content'
}

/**
 * Index of a command the incoming one should replace, or -1.
 *
 * A drag emits a command per pointer move — hundreds for one gesture. Left
 * unmerged that inflates the unsaved counter into nonsense and would make undo
 * step back a pixel at a time. Commands sharing a `gesture` label and a target
 * are therefore folded into one, keeping the *earliest* `before` so undoing
 * reverts the whole gesture.
 *
 * The scan stops at the first command from a different gesture, so an edit made
 * between two nudges keeps them separate, and it never reaches behind `savedAt`,
 * so a saved command is never rewritten.
 */
function coalesceIndex(log: EditCommand[], cmd: EditCommand, savedAt: number): number {
  if (!cmd.gesture) return -1
  for (let i = log.length - 1; i >= savedAt; i--) {
    if (log[i].gesture !== cmd.gesture) return -1
    if (sameTarget(log[i], cmd)) return i
  }
  return -1
}

export const useHistoryStore = create<HistoryState>((set) => ({
  log: [],
  cursor: 0,
  savedAt: 0,
  revision: 0,
  record: (cmd) =>
    set((s) => {
      // A new edit after undoing discards the redo branch. If the save point
      // lived in the branch just dropped, it is gone for good — mark it
      // unreachable so the document reads as dirty rather than falsely clean.
      const log = s.cursor < s.log.length ? s.log.slice(0, s.cursor) : s.log
      const savedAt = s.savedAt > s.cursor ? -1 : s.savedAt

      const at = coalesceIndex(log, cmd, Math.max(savedAt, 0))
      if (at === -1) {
        return { log: [...log, cmd], cursor: log.length + 1, savedAt, revision: s.revision + 1 }
      }

      const previous = log[at]
      // Keep the original `before`; take the new `after`.
      const merged = { ...cmd, before: (previous as { before?: unknown }).before } as EditCommand
      const next = log.slice()
      next[at] = merged
      return { log: next, cursor: next.length, savedAt, revision: s.revision + 1 }
    }),
  setCursor: (cursor) => set((s) => ({ cursor, revision: s.revision + 1 })),
  touch: () => set((s) => ({ revision: s.revision + 1 })),
  markSaved: () => set((s) => ({ savedAt: s.cursor })),
  reset: () => set({ log: [], cursor: 0, savedAt: 0, revision: 0 }),
}))

export function isDirty(state: { cursor: number; savedAt: number }): boolean {
  return state.cursor !== state.savedAt
}

export function canUndo(state: { cursor: number }): boolean {
  return state.cursor > 0
}

export function canRedo(state: { log: unknown[]; cursor: number }): boolean {
  return state.cursor < state.log.length
}

/** Commands currently applied to the document — everything before the cursor. */
export function appliedCommands(state: { log: EditCommand[]; cursor: number }): EditCommand[] {
  return state.log.slice(0, state.cursor)
}

/**
 * Collapse the log to the final value per node and property. Later commands win,
 * so a 200-command drag becomes one declaration and a paragraph typed one
 * keystroke at a time becomes one content patch — which is what keeps the saved
 * diff proportional to the change rather than to the effort.
 */
export function foldEdits(log: EditCommand[]): FoldedEdits {
  const styles = new Map<string, Map<string, string | null>>()
  const attributes = new Map<string, Map<string, string | null>>()
  const contents = new Map<string, string>()

  const into = (
    bucket: Map<string, Map<string, string | null>>,
    nodeId: string,
    key: string,
    value: string | null,
  ): void => {
    let props = bucket.get(nodeId)
    if (!props) {
      props = new Map<string, string | null>()
      bucket.set(nodeId, props)
    }
    props.set(key, value)
  }

  const structuralPanels = new Set<string>()

  for (const cmd of log) {
    if (cmd.type === 'content') contents.set(cmd.nodeId, cmd.after)
    else if (cmd.type === 'attribute') into(attributes, cmd.nodeId, cmd.name, cmd.after)
    else if (cmd.type === 'structure') {
      structuralPanels.add(cmd.panelId)
      // A move leaves the origin panel changed too.
      if (cmd.fromPanelId) structuralPanels.add(cmd.fromPanelId)
    }
    else into(styles, cmd.nodeId, cmd.prop, cmd.after)
  }
  return { styles, attributes, contents, structuralPanels }
}
