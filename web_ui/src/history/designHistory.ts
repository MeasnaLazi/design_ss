import { create } from 'zustand'

import { loadDisplayDocumentIntoCanvas } from '../canvas/loadDisplayDocument'
import { buildDisplayDocumentFromCanvas } from '../canvas/serializeDisplayDocument'
import { useDesignStore } from '../store/useDesignStore'
import type { DisplayDocumentV1 } from '../types/displayDocument'

import { isDocumentApplyActive } from './documentApplyDepth'

const MAX_SNAPSHOTS = 50

let snapshots: DisplayDocumentV1[] = []
let index = -1
let lastFingerprint: string | null = null

function cloneDoc(doc: DisplayDocumentV1): DisplayDocumentV1 {
  return JSON.parse(JSON.stringify(doc)) as DisplayDocumentV1
}

function fingerprint(doc: DisplayDocumentV1): string {
  return JSON.stringify({
    design: doc.design,
    fabricObjects: doc.fabricObjects,
  })
}

/** Bumps when undo stack, redo availability, or pointer moves so toolbar can re-render. */
export const useDesignHistoryStore = create<{ rev: number }>(() => ({ rev: 0 }))

function touch(): void {
  useDesignHistoryStore.setState((s) => ({ rev: s.rev + 1 }))
}

export function canUndoDesignHistory(): boolean {
  return index > 0
}

export function canRedoDesignHistory(): boolean {
  return index >= 0 && index < snapshots.length - 1
}

/** Replace history with the current canvas + store state (e.g. after load from datasource or template). */
export function resetDesignHistoryFromCurrentCanvas(): void {
  const canvas = useDesignStore.getState().fabricCanvas
  if (!canvas) return
  const doc = buildDisplayDocumentFromCanvas(canvas)
  snapshots = [cloneDoc(doc)]
  index = 0
  lastFingerprint = fingerprint(doc)
  touch()
}

/**
 * Record a new undo step from the live canvas. Skipped while a document apply is in progress
 * or when the design is unchanged from the last recorded step.
 */
export function pushDesignHistoryCommit(): void {
  if (isDocumentApplyActive()) return
  const canvas = useDesignStore.getState().fabricCanvas
  if (!canvas) return

  if (index < 0) {
    resetDesignHistoryFromCurrentCanvas()
    return
  }

  const doc = buildDisplayDocumentFromCanvas(canvas)
  const fp = fingerprint(doc)
  if (fp === lastFingerprint) return

  snapshots = snapshots.slice(0, index + 1)
  snapshots.push(cloneDoc(doc))
  index = snapshots.length - 1
  while (snapshots.length > MAX_SNAPSHOTS) {
    snapshots.shift()
    index--
  }
  lastFingerprint = fp
  touch()
}

export async function undoDesignHistory(): Promise<void> {
  if (index <= 0) return
  index--
  const doc = cloneDoc(snapshots[index]!)
  lastFingerprint = fingerprint(doc)
  await loadDisplayDocumentIntoCanvas(doc, { skipPresetDatasourceSync: true })
  touch()
}

export async function redoDesignHistory(): Promise<void> {
  if (index < 0 || index >= snapshots.length - 1) return
  index++
  const doc = cloneDoc(snapshots[index]!)
  lastFingerprint = fingerprint(doc)
  await loadDisplayDocumentIntoCanvas(doc, { skipPresetDatasourceSync: true })
  touch()
}
