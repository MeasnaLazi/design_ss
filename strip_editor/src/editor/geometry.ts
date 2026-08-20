/**
 * Pure geometry for moving and resizing blocks. No DOM writes, no React — every
 * function here takes numbers and returns the CSS declarations to apply, so the
 * tricky parts (anchor inversion, per-kind constraints) are testable in
 * isolation.
 *
 * ## Anchor awareness
 *
 * Strips position blocks from whichever edge the design reasons about:
 * `left: 110px` for a headline, `right: -130px` for a device that bleeds off the
 * panel. If the editor always wrote `left`, dragging a right-anchored block
 * would leave both declarations present and the design would jump the next time
 * the panel size changed. So the authored anchor is preserved: a right-anchored
 * block stays right-anchored, and drag deltas are inverted for it.
 *
 * ## What is deliberately not done
 *
 * No clamping to the panel. Blocks are *meant* to overhang — `overflow: hidden`
 * crops them, which is how the cropped-device look is built. The only clamp here
 * is a minimum extent, so a handle drag cannot annihilate a block into
 * unselectability; that is a interaction guard, not a layout opinion.
 */
import type { LayerKind, NodeKind } from './schema'
import type { Rect } from './blockRegistry'

export type HandleId = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'

export type Anchors = { x: 'left' | 'right'; y: 'top' | 'bottom' }

export type Declaration = { prop: string; value: string }

/** Smallest extent a resize gesture may produce, in layout px. */
export const MIN_EXTENT = 4

/**
 * Which edges the block is positioned from, read from the **inline** style.
 *
 * Computed style is useless here: for an absolutely positioned element the
 * browser resolves `left` to a used pixel value even when the author only wrote
 * `right`, so `getComputedStyle` can never tell us the author's intent. When
 * neither is inline, default to left/top — the value written will be the
 * measured position, so the block does not move.
 */
export function resolveAnchors(el: HTMLElement): Anchors {
  const hasLeft = el.style.left !== ''
  const hasRight = el.style.right !== ''
  const hasTop = el.style.top !== ''
  const hasBottom = el.style.bottom !== ''
  return {
    x: !hasLeft && hasRight ? 'right' : 'left',
    y: !hasTop && hasBottom ? 'bottom' : 'top',
  }
}

/** Whether the editor may write `width` / `height` for this kind of block. */
export function resizePolicy(kind: NodeKind): { width: boolean; height: boolean; reason?: string } {
  switch (kind) {
    case 'device':
      // strip-schema.md: width sets the scale, height follows the pose aspect.
      return { width: true, height: false, reason: 'Device height follows the pose aspect ratio — never set it.' }
    case 'text':
      // Width controls wrap; height is content-driven and would clip or gap.
      return { width: true, height: false, reason: 'Text height follows its content. Change the font size instead.' }
    case 'image':
    case 'decor':
      return { width: true, height: true }
    case 'group':
      // Both axes, like decor — but a group has two sizing modes and only one of
      // them is draggable. *Hug* (no authored width/height) derives the box from
      // the children, their gap and the padding; the browser recomputes it, so
      // there is nothing for a handle to hold on to. *Fixed* authors the box and
      // lays the children out inside it.
      //
      // Dragging a hugging group therefore converts it to fixed, by writing the
      // measured box it already had. That is what every design tool does, and it
      // is the honest reading of the gesture: you cannot drag an edge that is
      // defined by its contents without first deciding the edge is yours.
      return { width: true, height: true }
    default:
      return { width: false, height: false, reason: 'Panels are sized by the export preset.' }
  }
}

/**
 * Handles worth showing: only those that would actually change something.
 *
 * `positioned: false` means the block is `position: static` — a group's child in
 * flow, typically. Such a block is **resizable but not movable**: `width` and
 * `height` apply normally, `left`/`top` do nothing. That rules out exactly the
 * handles that work by moving the block's origin. Dragging the west edge is
 * "keep the right edge, move the left one", which needs a `left` the browser
 * would ignore — so the block would appear to resize from the wrong side. Only
 * the handles that grow away from the origin survive.
 */
export function handlesFor(kind: NodeKind, options?: { positioned?: boolean }): HandleId[] {
  const policy = resizePolicy(kind)
  if (!policy.width && !policy.height) return []
  const positioned = options?.positioned ?? true
  if (policy.width && !policy.height) return positioned ? ['w', 'e'] : ['e']
  if (!positioned) return ['e', 'se', 's']
  return ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']
}

/** Per-handle edge deltas: how a drag of (dx, dy) moves each edge of the box. */
const EDGE_DELTAS: Record<HandleId, { l: number; t: number; r: number; b: number }> = {
  nw: { l: 1, t: 1, r: 0, b: 0 },
  n: { l: 0, t: 1, r: 0, b: 0 },
  ne: { l: 0, t: 1, r: 1, b: 0 },
  e: { l: 0, t: 0, r: 1, b: 0 },
  se: { l: 0, t: 0, r: 1, b: 1 },
  s: { l: 0, t: 0, r: 0, b: 1 },
  sw: { l: 1, t: 0, r: 0, b: 1 },
  w: { l: 1, t: 0, r: 0, b: 0 },
}

export type GestureContext = {
  kind: NodeKind
  anchors: Anchors
  /** Panel-relative box when the gesture began. */
  rect: Rect
  panel: { width: number; height: number }
}

/** New panel-relative box for a move of (dx, dy). */
export function moveBox(rect: Rect, dx: number, dy: number): Rect {
  return { left: rect.left + dx, top: rect.top + dy, width: rect.width, height: rect.height }
}

/**
 * New panel-relative box for dragging `handle` by (dx, dy), honouring the
 * kind's resize policy: a handle that may not change height leaves the vertical
 * edges alone, so a corner drag on a device is width-only rather than silently
 * breaking the pose aspect.
 */
export function resizeBox(ctx: GestureContext, handle: HandleId, dx: number, dy: number): Rect {
  const policy = resizePolicy(ctx.kind)
  const d = EDGE_DELTAS[handle]
  const { rect } = ctx

  let l = rect.left
  let r = rect.left + rect.width
  let t = rect.top
  let b = rect.top + rect.height

  if (policy.width) {
    l += d.l * dx
    r += d.r * dx
    if (r - l < MIN_EXTENT) {
      if (d.l) l = r - MIN_EXTENT
      else r = l + MIN_EXTENT
    }
  }
  if (policy.height) {
    t += d.t * dy
    b += d.b * dy
    if (b - t < MIN_EXTENT) {
      if (d.t) t = b - MIN_EXTENT
      else b = t + MIN_EXTENT
    }
  }

  return { left: l, top: t, width: r - l, height: b - t }
}

export function px(n: number): string {
  return `${Math.round(n)}px`
}

/**
 * Express a target box as CSS declarations, in the block's own anchor terms,
 * emitting **only what changed**. Suppressing no-op declarations is what keeps a
 * move from also rewriting `width`, and therefore what keeps the saved diff to
 * the single property the human actually altered.
 */
export function boxToDeclarations(ctx: GestureContext, box: Rect): Declaration[] {
  const policy = resizePolicy(ctx.kind)
  const out: Declaration[] = []
  const { rect, panel, anchors } = ctx

  if (anchors.x === 'left') {
    if (Math.round(box.left) !== Math.round(rect.left)) out.push({ prop: 'left', value: px(box.left) })
  } else {
    const startRight = panel.width - (rect.left + rect.width)
    const nextRight = panel.width - (box.left + box.width)
    if (Math.round(nextRight) !== Math.round(startRight)) out.push({ prop: 'right', value: px(nextRight) })
  }

  if (anchors.y === 'top') {
    if (Math.round(box.top) !== Math.round(rect.top)) out.push({ prop: 'top', value: px(box.top) })
  } else {
    const startBottom = panel.height - (rect.top + rect.height)
    const nextBottom = panel.height - (box.top + box.height)
    if (Math.round(nextBottom) !== Math.round(startBottom)) out.push({ prop: 'bottom', value: px(nextBottom) })
  }

  if (policy.width && Math.round(box.width) !== Math.round(rect.width)) {
    out.push({ prop: 'width', value: px(box.width) })
  }
  if (policy.height && Math.round(box.height) !== Math.round(rect.height)) {
    out.push({ prop: 'height', value: px(box.height) })
  }

  return out
}

/**
 * Snapping, while dragging, to the panel's own edges and centre lines.
 *
 * ## Why the threshold is in screen pixels
 *
 * The plan said "6px", but document pixels are the wrong unit: at fit-width zoom
 * (~15% for a five-panel strip) six document pixels is under one screen pixel —
 * unhittable — while at 200% it is a twelve-pixel magnet. What should stay
 * constant is the *felt* distance, so the threshold is screen pixels and the
 * caller divides by zoom to get the document-space tolerance.
 *
 * ## Why this does not contradict "never auto-correct layout"
 *
 * That rule is about the editor quietly moving a legal position behind the
 * author's back. Snapping is the opposite:
 * it happens only inside a gesture the human is actively making, shows a guide
 * for exactly what it did, and is suppressed by holding a modifier. It also
 * cannot reach a deliberately cropped block bleeding off the panel, because that
 * sits far outside any sane threshold.
 */
/**
 * Position declarations for a block that has just changed panel.
 *
 * Deliberately *not* diffed, unlike {@link boxToDeclarations}. That function
 * skips a property whose value has not moved since the gesture began, which is
 * right for a drag inside one panel — but after a reparent the inline style
 * still describes the block's place in the panel it left, so "unchanged" says
 * nothing about whether the file is correct. Every value has to be restated in
 * the destination's frame or the block keeps a coordinate that means something
 * else now.
 *
 * Size is untouched: changing panel moves a block, it does not resize it.
 */
export function placementDeclarations(ctx: GestureContext, box: Rect): Declaration[] {
  const { panel, anchors } = ctx
  return [
    anchors.x === 'left'
      ? { prop: 'left', value: px(box.left) }
      : { prop: 'right', value: px(panel.width - (box.left + box.width)) },
    anchors.y === 'top'
      ? { prop: 'top', value: px(box.top) }
      : { prop: 'bottom', value: px(panel.height - (box.top + box.height)) },
  ]
}

export const SNAP_THRESHOLD_SCREEN_PX = 6

export type Guide = {
  axis: 'x' | 'y'
  /** Panel-relative position of the line. */
  position: number
  kind: 'edge' | 'center'
}

type SnapLine = { position: number; kind: 'edge' | 'center' }

/** Nearest line to any of the block's own alignment points, within tolerance. */
function nearestSnap(points: number[], lines: SnapLine[], tolerance: number): { delta: number; line: SnapLine } | null {
  let best: { delta: number; line: SnapLine } | null = null
  for (const point of points) {
    for (const line of lines) {
      const delta = line.position - point
      if (Math.abs(delta) > tolerance) continue
      if (!best || Math.abs(delta) < Math.abs(best.delta)) best = { delta, line }
    }
  }
  return best
}

/**
 * Nudge a moved box onto a panel edge or centre if it is close enough.
 *
 * The block's own left/centre/right (and top/middle/bottom) are all candidates,
 * so a block can align by any of its edges — whichever is nearest wins, and each
 * axis is decided independently.
 */
export function snapToPanel(
  panel: { width: number; height: number },
  box: Rect,
  tolerance: number,
): { box: Rect; guides: Guide[] } {
  if (tolerance <= 0) return { box, guides: [] }

  const xLines: SnapLine[] = [
    { position: 0, kind: 'edge' },
    { position: panel.width / 2, kind: 'center' },
    { position: panel.width, kind: 'edge' },
  ]
  const yLines: SnapLine[] = [
    { position: 0, kind: 'edge' },
    { position: panel.height / 2, kind: 'center' },
    { position: panel.height, kind: 'edge' },
  ]

  const x = nearestSnap([box.left, box.left + box.width / 2, box.left + box.width], xLines, tolerance)
  const y = nearestSnap([box.top, box.top + box.height / 2, box.top + box.height], yLines, tolerance)

  const guides: Guide[] = []
  if (x) guides.push({ axis: 'x', position: x.line.position, kind: x.line.kind })
  if (y) guides.push({ axis: 'y', position: y.line.position, kind: y.line.kind })

  return {
    box: {
      left: box.left + (x?.delta ?? 0),
      top: box.top + (y?.delta ?? 0),
      width: box.width,
      height: box.height,
    },
    guides,
  }
}

export function cursorFor(handle: HandleId): string {
  if (handle === 'n' || handle === 's') return 'ns-resize'
  if (handle === 'e' || handle === 'w') return 'ew-resize'
  if (handle === 'nw' || handle === 'se') return 'nwse-resize'
  return 'nesw-resize'
}

/** Fractional handle offsets, for positioning chrome. */
export const HANDLE_OFFSET: Record<HandleId, { x: number; y: number }> = {
  nw: { x: 0, y: 0 },
  n: { x: 0.5, y: 0 },
  ne: { x: 1, y: 0 },
  e: { x: 1, y: 0.5 },
  se: { x: 1, y: 1 },
  s: { x: 0.5, y: 1 },
  sw: { x: 0, y: 1 },
  w: { x: 0, y: 0.5 },
}

export type { LayerKind }
