/**
 * Same-origin iframe bridge: load a strip document, wait until it is truthfully
 * measurable, and read geometry out of it.
 *
 * Why the wait matters: `composer/device-frames.mjs` builds device blocks
 * asynchronously (fetch frame.json → fetch pose SVG → decode screenshot →
 * homography warp) and only then sets `window.__composerReady`. Fonts settle
 * separately via `document.fonts.ready`. Reading geometry before both are done
 * yields wrong numbers, and a wrong number read once propagates into every
 * edit made after it. Nothing in the editor may measure or mutate until
 * {@link waitForStripReady} resolves.
 */

/** Geometry in the strip document's own (unscaled) layout pixels. */
export type PanelRect = {
  index: number
  left: number
  top: number
  width: number
  height: number
}

export type StripGeometry = {
  /** Natural size of the whole strip, i.e. the size the iframe is set to. */
  width: number
  height: number
  panels: PanelRect[]
  /** Gap bands between consecutive panels (rendered as hatch, never exported). */
  gaps: Array<{ left: number; top: number; width: number; height: number }>
}

export type StripReady = {
  geometry: StripGeometry
  /** Errors device-frames.mjs collected while building blocks (red-outlined devices). */
  composerErrors: string[]
}

const READY_TIMEOUT_MS = 30_000
const READY_POLL_MS = 50

/** The strip root element (`div.strip`), or the document body as a fallback. */
function stripRoot(doc: Document): HTMLElement {
  return (doc.querySelector<HTMLElement>('.strip') ??
    doc.querySelector<HTMLElement>('[data-panel]')?.parentElement ??
    doc.body) as HTMLElement
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

/** Resolve once the iframe has fired `load` (or immediately if already loaded). */
export function waitForIframeLoad(iframe: HTMLIFrameElement): Promise<void> {
  return new Promise((resolve, reject) => {
    const done = (): void => {
      iframe.removeEventListener('load', done)
      iframe.removeEventListener('error', fail)
      resolve()
    }
    const fail = (): void => {
      iframe.removeEventListener('load', done)
      iframe.removeEventListener('error', fail)
      reject(new Error('iframe failed to load the strip document'))
    }
    iframe.addEventListener('load', done)
    iframe.addEventListener('error', fail)
  })
}

type ComposerWindow = Window & {
  __composerReady?: boolean
  __composerErrors?: string[]
}

/**
 * Block until the strip is safe to measure: device blocks built (when the
 * document uses the composer runtime) and fonts loaded.
 */
export async function waitForStripReady(iframe: HTMLIFrameElement, timeoutMs = READY_TIMEOUT_MS): Promise<string[]> {
  const win = iframe.contentWindow as ComposerWindow | null
  const doc = iframe.contentDocument
  if (!win || !doc) throw new Error('iframe document unavailable (cross-origin?)')

  const usesComposer = doc.querySelector('[data-device]') !== null
  if (usesComposer) {
    const deadline = Date.now() + timeoutMs
    while (win.__composerReady !== true) {
      if (Date.now() > deadline) {
        throw new Error('timed out waiting for window.__composerReady (device blocks never finished building)')
      }
      await sleep(READY_POLL_MS)
    }
  }

  // `document.fonts.ready` resolves once pending font loads settle. Strips use
  // system fonts today, but this keeps text metrics honest if that changes.
  try {
    await doc.fonts.ready
  } catch {
    /* fonts API unavailable — proceed */
  }

  return win.__composerErrors ?? []
}

/**
 * Measure the strip. All coordinates are relative to the strip root's top-left,
 * which is also the iframe's origin — so parent-space screen coordinates are
 * just `value * zoom`.
 */
export function readGeometry(iframe: HTMLIFrameElement): StripGeometry {
  const doc = iframe.contentDocument
  if (!doc) throw new Error('iframe document unavailable')

  const root = stripRoot(doc)
  const rootRect = root.getBoundingClientRect()
  const originX = rootRect.left + doc.documentElement.scrollLeft
  const originY = rootRect.top + doc.documentElement.scrollTop

  const panels: PanelRect[] = [...doc.querySelectorAll<HTMLElement>('[data-panel]')]
    .map((el, i) => {
      const r = el.getBoundingClientRect()
      const parsed = Number(el.dataset.panel)
      return {
        index: Number.isFinite(parsed) ? parsed : i,
        left: r.left + doc.documentElement.scrollLeft - originX,
        top: r.top + doc.documentElement.scrollTop - originY,
        width: r.width,
        height: r.height,
      }
    })
    .sort((a, b) => a.left - b.left)

  // Natural strip size: prefer the root's own box, fall back to scroll extent
  // for documents that do not use the `.strip` wrapper.
  const width = Math.max(
    Math.ceil(rootRect.width),
    ...panels.map((p) => Math.ceil(p.left + p.width)),
    doc.documentElement.scrollWidth,
  )
  const height = Math.max(
    Math.ceil(rootRect.height),
    ...panels.map((p) => Math.ceil(p.top + p.height)),
    doc.documentElement.scrollHeight,
  )

  const gaps: StripGeometry['gaps'] = []
  for (let i = 1; i < panels.length; i++) {
    const prev = panels[i - 1]
    const cur = panels[i]
    const gapLeft = prev.left + prev.width
    const gapWidth = cur.left - gapLeft
    if (gapWidth > 0.5) {
      gaps.push({ left: gapLeft, top: Math.min(prev.top, cur.top), width: gapWidth, height: Math.max(prev.height, cur.height) })
    }
  }

  return { width, height, panels, gaps }
}

/**
 * Point the iframe at `url` and return once the document is ready and measured.
 * Sizing is two-pass: the iframe starts small, we measure the natural strip
 * size, then the caller sizes the iframe to it (see `StripStage`). Content
 * layout does not depend on the iframe viewport — panels are fixed-pixel and
 * the strip is `width: max-content` — so measuring at any viewport is safe.
 */
export async function loadStrip(iframe: HTMLIFrameElement, url: string): Promise<StripReady> {
  const loaded = waitForIframeLoad(iframe)
  iframe.src = url
  await loaded
  const composerErrors = await waitForStripReady(iframe)
  return { geometry: readGeometry(iframe), composerErrors }
}
