/**
 * Index of selectable nodes in the open strip, plus the readouts the inspector
 * shows.
 *
 * Design note — **no editor artifacts in the strip DOM.** Blocks are identified
 * by ids held in a module-level registry that maps id → live element reference,
 * rebuilt on every document load. Nothing is written into the strip document to
 * make selection work, so there is nothing to strip at save time and no way for
 * an editor id to leak into a committed file. (The plan reserves `data-se-*`
 * for cases that truly need marker attributes; selection is not one.)
 *
 * Ids are positional and stable for the lifetime of one loaded document:
 *   `panel:0`        — the panel itself
 *   `layer:0:3`      — 4th top-level layer block in panel 0, in DOM order
 */
import { isLayerKind, isTextRole } from './schema'
import type { LayerKind, NodeKind, TextRole } from './schema'

/** Serializable metadata for the tree and store. */
export type BlockNode = {
  id: string
  kind: NodeKind
  panelIndex: number
  /** DOM-order index among the panel's top-level layers; -1 for panels. */
  order: number
  role?: TextRole
  /** Short human label for the tree row. */
  label: string
  tagName: string
  className: string
  /** Effective paint order within the panel (higher = in front). */
  zIndex: number | null
}

export type Rect = { left: number; top: number; width: number; height: number }

export type BlockReadout = {
  node: BlockNode
  /** Panel-relative measured box, layout px. */
  rect: Rect
  /** Distance from the panel's right / bottom edge (negative = overhangs). */
  insetRight: number
  insetBottom: number
  /** Which panel edges the block crosses. Overhang is legal — `overflow:hidden` crops it. */
  overhang: { left: boolean; top: boolean; right: boolean; bottom: boolean }
  /** Strip-root-relative box, for drawing the overlay. */
  docRect: Rect
  /** Size of the owning panel — the reference frame for right/bottom anchors. */
  panelSize: { width: number; height: number }
  /** False when `position: static`: inline left/top would have no effect. */
  movable: boolean
  /** Geometry properties as *authored* in the inline style attribute. */
  inline: Array<{ prop: string; value: string }>
  computed: {
    position: string
    zIndex: string
    opacity: string
    transform: string
    filter: string
    visibility: string
  }
  text?: {
    content: string
    fontFamily: string
    fontSize: string
    fontWeight: string
    lineHeight: string
    letterSpacing: string
    color: string
    textAlign: string
    lineCount: number
  }
  device?: {
    pack: string | null
    pose: string | null
    screenshot: string | null
    fit: string
    screenFallback: string | null
    /** Set by device-frames.mjs from the pose SVG viewBox. */
    aspectRatio: string
    built: boolean
  }
  image?: { src: string; naturalWidth: number; naturalHeight: number }
  decor?: { background: string; borderRadius: string; border: string; childCount: number }
  panel?: { background: string; layerCount: number }
}

/** id → live element. Cleared and rebuilt on each document load. */
let registry = new Map<string, HTMLElement>()
/** element → id, so hit-testing resolves without scanning the registry. */
let reverse = new WeakMap<HTMLElement, string>()

/**
 * Identity that survives re-indexing.
 *
 * Ids are *positional* when first assigned (`layer:0:3`), which is what lets a
 * live block resolve to the same block in a clean parse of the file. But once
 * the editor can insert and delete blocks, position stops being identity:
 * deleting the second block would renumber every one after it, and pending
 * edits keyed by id would silently retarget. So an element keeps the id it was
 * given for as long as the document stays loaded, and blocks the editor creates
 * get ids from a namespace that cannot collide with a file position.
 */
let liveIds = new WeakMap<HTMLElement, string>()
let newIdCounter = 0

/** Id for a block the editor created; never present in the file on disk. */
export function freshNodeId(): string {
  newIdCounter += 1
  return `new:${newIdCounter}`
}

export function isNewNodeId(id: string): boolean {
  return id.startsWith('new:')
}

/**
 * Whether an id names a panel.
 *
 * Panel ids are positional and stable, so a prefix test is safe *here* — but
 * only here. Layer ids are opaque (`layer:0:3` for blocks from the file,
 * `new:1` for blocks the editor created), so never infer a layer from its id.
 */
export function isPanelNodeId(id: string): boolean {
  return id.startsWith('panel:')
}

/** Register an element the editor just inserted so it is selectable at once. */
export function adoptElement(el: HTMLElement, id: string): void {
  liveIds.set(el, id)
}

export function getElement(id: string | null): HTMLElement | null {
  return id ? (registry.get(id) ?? null) : null
}

export function panelIdFor(panelIndex: number): string {
  return `panel:${panelIndex}`
}

/**
 * Selector for block elements. `data-device` without `data-layer` is tolerated
 * because `render.mjs` tolerates it (`kind === 'device' || el.hasAttribute(
 * 'data-device')`) — e.g. `composer/test/pose-test.html`. Matching the exporter
 * matters more than enforcing the schema on read; the schema is enforced when
 * the editor *writes*.
 */
const BLOCK_SELECTOR = '[data-layer], [data-device]'

/**
 * Top-level blocks of a panel: elements matching {@link BLOCK_SELECTOR} whose
 * nearest block ancestor lies outside the panel. Nested blocks (rare, but decor
 * can wrap them) are not separately selectable — they belong to their parent.
 */
function topLevelLayers(panel: HTMLElement): HTMLElement[] {
  return [...panel.querySelectorAll<HTMLElement>(BLOCK_SELECTOR)].filter((el) => {
    const parentLayer = el.parentElement?.closest<HTMLElement>(BLOCK_SELECTOR)
    return parentLayer === null || parentLayer === undefined || !panel.contains(parentLayer)
  })
}

function firstLine(s: string, max = 32): string {
  const line = s.replace(/\s+/g, ' ').trim()
  return line.length > max ? `${line.slice(0, max - 1)}…` : line
}

function labelFor(el: HTMLElement, kind: LayerKind): string {
  if (kind === 'text') {
    const role = el.dataset.role
    const copy = firstLine(el.textContent ?? '')
    return copy ? `${role ?? 'text'} · ${copy}` : (role ?? 'text')
  }
  if (kind === 'device') return `${el.dataset.pack ?? '?'} · ${el.dataset.pose ?? '?'}`
  if (kind === 'image') {
    const src = el.getAttribute('src') ?? ''
    return firstLine(src.split('/').pop() ?? 'image')
  }
  const cls = el.className.trim().split(/\s+/)[0]
  return cls ? `decor · ${cls}` : 'decor'
}

/**
 * Index any strip document — the live iframe one, or a freshly parsed copy of
 * the file on disk.
 *
 * Ids are derived purely from structure (panel index + DOM order among
 * top-level blocks), so **the same id resolves to the same block in both
 * documents**. That equivalence is what lets the serializer apply the editor's
 * changes to a clean parse of the original file instead of re-serializing the
 * live DOM, which the device runtime has already mutated.
 */
export function indexDocument(doc: Document): { nodes: BlockNode[]; byId: Map<string, HTMLElement> } {
  const next = new Map<string, HTMLElement>()
  const nodes: BlockNode[] = []

  const panels = [...doc.querySelectorAll<HTMLElement>('[data-panel]')].sort(
    (a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left,
  )

  panels.forEach((panel, i) => {
    const parsed = Number(panel.dataset.panel)
    const panelIndex = Number.isFinite(parsed) ? parsed : i
    const panelId = panelIdFor(panelIndex)
    next.set(panelId, panel)

    const layers = topLevelLayers(panel)
    // `data-panel` is normally the 0-based index, but harness pages use names
    // (`data-panel="poses"`) — show what the file says, key on the index.
    const panelLabel = panel.dataset.panel && !Number.isFinite(parsed) ? `Panel "${panel.dataset.panel}"` : `Panel ${panelIndex}`
    nodes.push({
      id: panelId,
      kind: 'panel',
      panelIndex,
      order: -1,
      label: panelLabel,
      tagName: panel.tagName.toLowerCase(),
      className: panel.className,
      zIndex: null,
      })

    layers.forEach((el, order) => {
      const raw = el.dataset.layer
      // Unknown kinds are surfaced as decor rather than hidden — an unselectable
      // block is worse than a mislabelled one, and it flags a schema drift.
      // A bare `data-device` block is a device even without `data-layer`.
      const kind: LayerKind = isLayerKind(raw) ? raw : el.hasAttribute('data-device') ? 'device' : 'decor'
      const id = `layer:${panelIndex}:${order}`
      next.set(id, el)
      const zRaw = el.ownerDocument.defaultView?.getComputedStyle(el).zIndex ?? 'auto'
      nodes.push({
        id,
        kind,
        panelIndex,
        order,
        role: isTextRole(el.dataset.role) ? el.dataset.role : undefined,
        label: labelFor(el, kind),
        tagName: el.tagName.toLowerCase(),
        className: el.className,
        zIndex: zRaw === 'auto' ? null : Number(zRaw),
      })
    })
  })

  return { nodes, byId: next }
}

/**
 * Index the live document and install it as the editor's registry. Call after
 * {@link waitForStripReady} — indexing an unbuilt device block would label it
 * before its attributes settle.
 */
export function indexStrip(iframe: HTMLIFrameElement, options?: { fresh?: boolean }): BlockNode[] {
  const doc = iframe.contentDocument
  if (!doc) throw new Error('iframe document unavailable')

  // A fresh document (open or reload) starts identity from scratch; a re-index
  // after a structural edit must preserve it.
  if (options?.fresh) {
    liveIds = new WeakMap<HTMLElement, string>()
    newIdCounter = 0
  }

  const { nodes, byId } = indexDocument(doc)

  registry = new Map<string, HTMLElement>()
  reverse = new WeakMap<HTMLElement, string>()

  for (const node of nodes) {
    const el = byId.get(node.id)
    if (!el) continue
    // Panels keep their positional id — the editor never adds or removes them,
    // and `data-panel` is the file's own identifier for them.
    const stable = node.kind === 'panel' ? node.id : (liveIds.get(el) ?? node.id)
    liveIds.set(el, stable)
    node.id = stable
    registry.set(stable, el)
    reverse.set(el, stable)
  }
  return nodes
}

/** Number of top-level layer blocks currently indexed (excludes panels). */
export function layerCount(nodes: BlockNode[]): number {
  return nodes.filter((n) => n.kind !== 'panel').length
}

/**
 * Hit-test a point given in **strip-document coordinates** and return the id of
 * the node that should be selected: the innermost top-level layer block under
 * the point, else the panel, else null.
 */
export function hitTest(iframe: HTMLIFrameElement, docX: number, docY: number): string | null {
  const doc = iframe.contentDocument
  if (!doc) return null
  // The iframe is sized to the full strip and never scrolls, so document
  // coordinates and client coordinates coincide.
  const hit = doc.elementFromPoint(docX, docY)
  if (!hit) return null

  const panel = hit.closest<HTMLElement>('[data-panel]')
  if (!panel) return null

  // Walk out from the hit element through nesting until we reach an element the
  // registry knows — device blocks are hit on their injected SVG/img children,
  // decor blocks on their inner shapes.
  // Any registered element matched by BLOCK_SELECTOR is a layer: panels carry
  // neither `data-layer` nor `data-device`, so they can never be `cur`.
  //
  // This deliberately does *not* test the id string. It used to check
  // `id.startsWith('layer:')`, which quietly stopped matching the moment
  // editor-created blocks got `new:` ids — every freshly added block hit-tested
  // to its panel instead of itself, so it could not be selected, dragged or
  // deleted from the canvas. Ids are opaque; ask the registry, not the prefix.
  let cur: HTMLElement | null = hit.closest<HTMLElement>(BLOCK_SELECTOR)
  while (cur && panel.contains(cur)) {
    const id = reverse.get(cur)
    if (id !== undefined) return id
    cur = cur.parentElement?.closest<HTMLElement>(BLOCK_SELECTOR) ?? null
  }

  return reverse.get(panel) ?? null
}

/**
 * The panel containing a document point, ignoring whatever is drawn on top.
 *
 * Distinct from {@link hitTest}, which answers "what did the user click" and so
 * returns the topmost block. Here the question is "which panel does this
 * coordinate belong to", which must not be affected by a block happening to
 * cover the point — a dragged block covers its own drop target.
 */
export function panelAtDocPoint(
  iframe: HTMLIFrameElement,
  docX: number,
  docY: number,
): { id: string; el: HTMLElement } | null {
  const doc = iframe.contentDocument
  if (!doc) return null
  for (const panel of doc.querySelectorAll<HTMLElement>('[data-panel]')) {
    const r = panel.getBoundingClientRect()
    if (docX >= r.left && docX < r.right && docY >= r.top && docY < r.bottom) {
      const id = reverse.get(panel)
      if (id !== undefined) return { id, el: panel }
    }
  }
  return null
}

/** Inline geometry declarations, read from the style attribute (not computed). */
function inlineGeometry(el: HTMLElement): Array<{ prop: string; value: string }> {
  const out: Array<{ prop: string; value: string }> = []
  const style = el.style
  for (let i = 0; i < style.length; i++) {
    const prop = style.item(i)
    out.push({ prop, value: style.getPropertyValue(prop).trim() })
  }
  return out
}

function rectOf(el: Element): Rect {
  const r = el.getBoundingClientRect()
  return { left: r.left, top: r.top, width: r.width, height: r.height }
}

/** Strip root, matching `iframeBridge.readGeometry`'s origin. */
function stripOrigin(doc: Document): { x: number; y: number } {
  const root =
    doc.querySelector<HTMLElement>('.strip') ??
    doc.querySelector<HTMLElement>('[data-panel]')?.parentElement ??
    doc.body
  const r = root.getBoundingClientRect()
  return { x: r.left, y: r.top }
}

/**
 * Strip-root-relative box of a node — the cheap measurement used for hover
 * outlines, where computing a full readout on every mousemove would be wasteful.
 */
export function docRectOf(iframe: HTMLIFrameElement, id: string): Rect | null {
  const doc = iframe.contentDocument
  const el = registry.get(id)
  if (!doc || !el) return null
  const r = rectOf(el)
  const origin = stripOrigin(doc)
  return { left: r.left - origin.x, top: r.top - origin.y, width: r.width, height: r.height }
}

/**
 * Measure a node and collect the kind-specific properties the inspector shows.
 * Read-only: this function must never write to the strip document.
 */
export function readBlock(iframe: HTMLIFrameElement, node: BlockNode): BlockReadout | null {
  const doc = iframe.contentDocument
  const el = registry.get(node.id)
  if (!doc || !el) return null
  const view = doc.defaultView
  if (!view) return null

  const panel = el.closest<HTMLElement>('[data-panel]') ?? el
  const panelRect = rectOf(panel)
  const elRect = rectOf(el)
  const origin = stripOrigin(doc)
  const cs = view.getComputedStyle(el)

  const rect: Rect = {
    left: elRect.left - panelRect.left,
    top: elRect.top - panelRect.top,
    width: elRect.width,
    height: elRect.height,
  }
  const insetRight = panelRect.width - (rect.left + rect.width)
  const insetBottom = panelRect.height - (rect.top + rect.height)

  const readout: BlockReadout = {
    node,
    rect,
    insetRight,
    insetBottom,
    overhang: {
      left: rect.left < -0.5,
      top: rect.top < -0.5,
      right: insetRight < -0.5,
      bottom: insetBottom < -0.5,
    },
    docRect: {
      left: elRect.left - origin.x,
      top: elRect.top - origin.y,
      width: elRect.width,
      height: elRect.height,
    },
    panelSize: { width: panelRect.width, height: panelRect.height },
    movable: node.kind !== 'panel' && cs.position !== 'static',
    inline: inlineGeometry(el),
    computed: {
      position: cs.position,
      zIndex: cs.zIndex,
      opacity: cs.opacity,
      transform: cs.transform,
      filter: cs.filter,
      visibility: cs.visibility,
    },
  }

  if (node.kind === 'panel') {
    readout.panel = { background: cs.background || cs.backgroundColor, layerCount: topLevelLayers(el).length }
    return readout
  }

  if (node.kind === 'text') {
    const html = el.innerHTML
    readout.text = {
      content: el.textContent ?? '',
      fontFamily: cs.fontFamily,
      fontSize: cs.fontSize,
      fontWeight: cs.fontWeight,
      lineHeight: cs.lineHeight,
      letterSpacing: cs.letterSpacing,
      color: cs.color,
      textAlign: cs.textAlign,
      // Authored line breaks, i.e. <br> count + 1 — not visual wrap count.
      lineCount: (html.match(/<br\s*\/?>/gi)?.length ?? 0) + 1,
    }
    return readout
  }

  if (node.kind === 'device') {
    readout.device = {
      pack: el.dataset.pack ?? null,
      pose: el.dataset.pose ?? null,
      screenshot: el.dataset.screenshot ?? null,
      fit: el.dataset.fit ?? 'cover',
      screenFallback: el.dataset.screenFallback ?? null,
      aspectRatio: cs.aspectRatio,
      // device-frames.mjs appends exactly one stage element per built block.
      built: el.querySelector('.composer-device-stage') !== null,
    }
    return readout
  }

  if (node.kind === 'image') {
    const img = el as HTMLImageElement
    readout.image = {
      src: img.getAttribute('src') ?? '',
      naturalWidth: img.naturalWidth ?? 0,
      naturalHeight: img.naturalHeight ?? 0,
    }
    return readout
  }

  readout.decor = {
    background: cs.background || cs.backgroundColor,
    borderRadius: cs.borderRadius,
    border: cs.border,
    childCount: el.children.length,
  }
  return readout
}
