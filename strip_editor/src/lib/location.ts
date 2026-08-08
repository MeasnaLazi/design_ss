/**
 * The open strip, reflected in the URL.
 *
 * Without this a refresh drops you back on the file picker, which is the wrong
 * answer to "I just reloaded to see a change": the document you were editing is
 * the thing you wanted back. `?strip=<repo-relative path>` makes the address bar
 * describe the editor's state, so reload, bookmark, Back and Forward all behave
 * the way a browser is expected to.
 *
 * The path is the same repo-relative form the API takes (`strips/x/strip.html`),
 * so what is in the URL is exactly what gets opened — no second encoding to keep
 * in step.
 */

const PARAM = 'strip'

/**
 * The strip named by the current URL, or `null`.
 *
 * Only shape is checked here. Whether the path is *allowed* is the server's
 * call — it restricts reads to the strip directories — so a hand-edited URL
 * fails the same way a bad file would, in the editor's error surface, rather
 * than being quietly trusted.
 */
export function stripFromLocation(): string | null {
  const raw = new URLSearchParams(window.location.search).get(PARAM)
  if (!raw) return null
  const path = raw.replace(/^\/+/, '')
  if (!path.toLowerCase().endsWith('.html')) return null
  // A traversal would be rejected server-side anyway; refusing it here keeps it
  // out of the address bar and out of the picker's "recent" affordances.
  if (path.includes('..')) return null
  return path
}

/** The URL that would represent `path`, leaving every other parameter alone. */
function urlFor(path: string | null): string {
  const url = new URL(window.location.href)
  if (path) url.searchParams.set(PARAM, path)
  else url.searchParams.delete(PARAM)
  return `${url.pathname}${url.search}${url.hash}`
}

/**
 * Point the URL at `path`.
 *
 * Idempotent by design: if the address bar already says this, nothing is
 * written. That is what stops a feedback loop — a Back press updates the store,
 * the store's subscriber calls this, and without the equality check it would
 * push a fresh entry and make Back appear not to work.
 */
export function syncLocation(path: string | null, mode: 'push' | 'replace' = 'push'): void {
  const next = urlFor(path)
  const current = `${window.location.pathname}${window.location.search}${window.location.hash}`
  if (next === current) return
  if (mode === 'replace') window.history.replaceState(null, '', next)
  else window.history.pushState(null, '', next)
}
