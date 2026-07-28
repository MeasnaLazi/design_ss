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
    default:
      return { width: false, height: false, reason: 'Panels are sized by the export preset.' }
  }
}

/** Handles worth showing: only those that would actually change something. */
export function handlesFor(kind: NodeKind): HandleId[] {
  const policy = resizePolicy(kind)
  if (!policy.width && !policy.height) return []
  if (policy.width && !policy.height) return ['w', 'e']
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

function px(n: number): string {
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
