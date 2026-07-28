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
 * Unlike the other commands this records the panel, not the block: once a
 * panel's children change, the file's markup for that whole panel is rewritten
 * from the live DOM at save time, because there is no honest way to express
 * "insert this element between these two" as a source-offset splice without
 * reimplementing an HTML printer for someone else's formatting.
 *
 * `before` is the panel's cleaned inner markup prior to the change, kept for
 * undo. There is no `after`: the current state is always read from the live DOM,
 * so a structural change followed by ten style tweaks still saves correctly.
 */
export type StructureCommand = {
  type: 'structure'
  panelId: string
  /** What happened, for the undo label. */
  op: 'insert' | 'remove' | 'duplicate' | 'reorder'
  nodeId: string
  before: string
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
  /** Log length at the last successful save; anything beyond it is unsaved. */
  savedAt: number
  /** Bumped on every mutation so views re-measure without diffing the log. */
  revision: number

  record: (cmd: EditCommand) => void
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
  savedAt: 0,
  revision: 0,
  record: (cmd) =>
    set((s) => {
      const at = coalesceIndex(s.log, cmd, s.savedAt)
      if (at === -1) return { log: [...s.log, cmd], revision: s.revision + 1 }

      const previous = s.log[at]
      // Keep the original `before`; take the new `after`.
      const merged = { ...cmd, before: previous.before } as EditCommand
      const log = s.log.slice()
      log[at] = merged
      return { log, revision: s.revision + 1 }
    }),
  markSaved: () => set((s) => ({ savedAt: s.log.length })),
  reset: () => set({ log: [], savedAt: 0, revision: 0 }),
}))

export function isDirty(state: { log: unknown[]; savedAt: number }): boolean {
  return state.log.length !== state.savedAt
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
    else if (cmd.type === 'structure') structuralPanels.add(cmd.panelId)
    else into(styles, cmd.nodeId, cmd.prop, cmd.after)
  }
  return { styles, attributes, contents, structuralPanels }
}
