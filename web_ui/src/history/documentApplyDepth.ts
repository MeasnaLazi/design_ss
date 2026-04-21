let depth = 0

/** Begin a full-document apply (e.g. load from JSON). Canvas events during this window must not push undo steps. */
export function beginDocumentApply(): void {
  depth++
}

export function endDocumentApply(): void {
  depth = Math.max(0, depth - 1)
}

export function isDocumentApplyActive(): boolean {
  return depth > 0
}
