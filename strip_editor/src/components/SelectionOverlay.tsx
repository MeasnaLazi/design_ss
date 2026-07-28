import { HANDLE_OFFSET, cursorFor, handlesFor } from '../editor/geometry'
import { KIND_LABEL } from '../editor/schema'
import type { BlockNode, Rect } from '../editor/blockRegistry'
import type { HandleId } from '../editor/geometry'

/**
 * Selection chrome, drawn in the **parent** document above the scaled iframe.
 *
 * Document coordinates map to screen with a single `× zoom`, while every chrome
 * dimension (border width, handle size, label) stays in unscaled screen pixels
 * so it remains legible at 15% zoom. That is the whole reason selection lives in
 * the parent rather than as injected DOM inside the strip: no editor artifacts
 * in the file, and no chrome that shrinks with the design.
 */

const HANDLE_PX = 9

function screenBox(rect: Rect, zoom: number): { left: number; top: number; width: number; height: number } {
  return { left: rect.left * zoom, top: rect.top * zoom, width: rect.width * zoom, height: rect.height * zoom }
}

export function HoverOutline({ rect, zoom }: { rect: Rect; zoom: number }): React.ReactElement {
  const b = screenBox(rect, zoom)
  return (
    <div
      className="pointer-events-none absolute border border-sky-300/70"
      style={{ left: b.left, top: b.top, width: b.width, height: b.height }}
    />
  )
}

export function SelectionOverlay({
  node,
  rect,
  zoom,
  overhangs,
  movable,
  editing,
  onHandleDown,
}: {
  node: BlockNode
  /** Strip-root-relative box of the selected element. */
  rect: Rect
  zoom: number
  overhangs: boolean
  movable: boolean
  /** A text session is open: hide handles so they cannot swallow caret clicks. */
  editing: boolean
  onHandleDown: (handle: HandleId, e: React.PointerEvent) => void
}): React.ReactElement {
  const b = screenBox(rect, zoom)
  const handles = movable && !editing ? handlesFor(node.kind) : []

  return (
    <div className="absolute" style={{ left: b.left, top: b.top, width: b.width, height: b.height }}>
      <div
        className={`pointer-events-none absolute inset-0 outline-2 outline-offset-0 ${
          editing ? 'outline-emerald-400' : 'outline-sky-400'
        }`}
      />

      <span
        className={`pointer-events-none absolute -top-[19px] left-0 flex items-center gap-1 whitespace-nowrap rounded-t px-1.5 py-0.5 text-[10px] font-medium leading-none text-zinc-950 ${
          editing ? 'bg-emerald-400' : 'bg-sky-400'
        }`}
      >
        {editing && <span className="uppercase tracking-wide">editing</span>}
        {KIND_LABEL[node.kind]}
        {node.role ? ` · ${node.role}` : ''}
        <span className="opacity-70">
          {Math.round(rect.width)}×{Math.round(rect.height)}
        </span>
        {overhangs && (
          // Overhang is intentional design (panels crop with overflow:hidden),
          // so this is an affordance, never a warning.
          <span className="rounded bg-zinc-950/25 px-1 text-[9px] uppercase tracking-wide">crops</span>
        )}
        {!movable && node.kind !== 'panel' && (
          <span className="rounded bg-zinc-950/25 px-1 text-[9px] uppercase tracking-wide">static</span>
        )}
      </span>

      {handles.map((h) => {
        const off = HANDLE_OFFSET[h]
        return (
          <span
            key={h}
            onPointerDown={(e) => onHandleDown(h, e)}
            // `pointer-events` is inherited, and the overlay wrapper disables it
            // so the canvas stays clickable through the chrome. Handles must opt
            // back in explicitly or they are decorative.
            className="pointer-events-auto absolute rounded-[1px] border border-sky-500 bg-zinc-50 hover:bg-sky-200"
            style={{
              width: HANDLE_PX,
              height: HANDLE_PX,
              left: `calc(${off.x * 100}% - ${HANDLE_PX / 2}px)`,
              top: `calc(${off.y * 100}% - ${HANDLE_PX / 2}px)`,
              cursor: cursorFor(h),
              touchAction: 'none',
            }}
          />
        )
      })}
    </div>
  )
}
