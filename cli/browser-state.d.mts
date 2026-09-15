/**
 * Hand-written types for `browser-state.mjs`, so the editor's TypeScript can
 * import it directly. The module is the authority; this file only describes it.
 */
export interface BrowserState {
  /** Is playwright reachable from the toolkit at all. */
  playwright: boolean
  /** Headed binary path as playwright names it, or null. */
  exe: string | null
  /** Chromium revision this playwright pins, e.g. "1243". */
  rev: string | null
  /** Directory the revisions live in (PLAYWRIGHT_BROWSERS_PATH or the platform default). */
  registry: string | null
  /** Every `chromium*` directory actually present there. */
  present: string[]
  headed: boolean
  shell: boolean
  /** A root package-lock.json is here, so this is a working copy rather than an install. */
  clone: boolean
  /** The system Google Chrome playwright would launch for `channel: 'chrome'`, or null. */
  chrome: string | null
}

/** Go ahead (`code: null`) with `browser`, or refuse with `code` and say why in `lines`. */
export interface BrowserPreflight {
  code: number | null
  lines: string[]
  /** `'chrome'` is the fallback when the pinned Chromium is incomplete; `lines` then say why. */
  browser?: 'chromium' | 'chrome'
  chrome?: string
}

export const WORKS_WITHOUT: string

export function parseExecutablePath(exe: string | null | undefined): { registry: string; rev: string } | null
export function browserState(opts?: { toolkitRoot?: string }): Promise<BrowserState>
export function chromeCandidates(opts?: { platform?: string; env?: Record<string, string | undefined> }): string[]
export function chromePath(opts?: { platform?: string; env?: Record<string, string | undefined>; exists?: (p: string) => boolean }): string | null
export function browserPreflight(state: BrowserState | null | undefined): BrowserPreflight
export function browserAdvice(output: unknown, state?: BrowserState | null): string[]
