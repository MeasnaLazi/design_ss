/** Hand-written types for `zip-store.mjs`, for the editor's TypeScript. */
export function crc32(buf: Uint8Array): number
export function dosDateTime(date: Date): { time: number; date: number }
export function zipStore(
  entries: Array<{ name: string; data: Uint8Array | string }>,
  opts?: { date?: Date },
): Buffer
