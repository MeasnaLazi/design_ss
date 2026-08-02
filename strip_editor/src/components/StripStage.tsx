import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { AlertTriangle, Loader2 } from 'lucide-react'

import { HoverOutline, SelectionOverlay } from './SelectionOverlay'
import {
  SNAP_THRESHOLD_SCREEN_PX,
  boxToDeclarations,
  moveBox,
  placementDeclarations,
  resizeBox,
  resolveAnchors,
  snapToPanel,
} from '../editor/geometry'
import { docRectOf, getElement, hitTest, indexStrip, isPanelNodeId, panelAtDocPoint, readBlock } from '../editor/blockRegistry'
import { applyGeometry } from '../editor/mutate'
import { beginTextEditing, endTextEditing } from '../editor/textEditing'
import { moveBlockToPanel } from '../editor/structure'
import { loadStrip } from '../editor/iframeBridge'
import { readStrip, stripDocumentUrl } from '../lib/api'
import { setStageIframe, setStageScroller } from '../editor/stageRef'
import { useEditorStore } from '../store/useEditorStore'
import { useHistoryStore } from '../store/useHistoryStore'
import type { GestureContext, Guide, HandleId } from '../editor/geometry'
import type { Rect } from '../editor/blockRegistry'

/** Breathing room around the strip inside the scroll container, in screen px. */
const STAGE_PADDING = 48
/** Pointer travel (screen px) before a press becomes a drag rather than a click. */
const DRAG_THRESHOLD = 3

type Gesture = {
  ctx: GestureContext
  nodeId: string
  handle: HandleId | null
  /** Pointer position in document coordinates when the gesture began. */
  originX: number
  originY: number
  label: string
  moved: boolean
  /** Panel origin in strip-document coordinates, for drawing snap guides. */
  panelOrigin: { x: number; y: number }
  /**
   * Registry id of the panel the block currently belongs to. Mutable: a drag
   * that carries the block's centre into a neighbour reparents it mid-gesture,
   * and everything downstream measures against the new panel from then on.
   */
  panelId: string
}

/**
 * The editing surface: the strip document in a same-origin iframe, laid out at
 * natural size and shown through a single CSS `scale`. One transform, one
 * coordinate mapping (`screen = doc * zoom`) — selection chrome and drag maths
 * both depend on that, so resist adding nested transforms here.
 */
export function StripStage(): React.ReactElement {
  const filePath = useEditorStore((s) => s.filePath)
  const loadToken = useEditorStore((s) => s.loadToken)
  const status = useEditorStore((s) => s.status)
  const error = useEditorStore((s) => s.error)
  const geometry = useEditorStore((s) => s.geometry)
  const composerErrors = useEditorStore((s) => s.composerErrors)
  const nodes = useEditorStore((s) => s.nodes)
  const selectedId = useEditorStore((s) => s.selectedId)
  const hoveredId = useEditorStore((s) => s.hoveredId)
  const editingId = useEditorStore((s) => s.editingId)
  const readOnly = useEditorStore((s) => s.mode === 'agent')
  const readout = useEditorStore((s) => s.readout)
  const zoom = useEditorStore((s) => s.zoom)
  const zoomMode = useEditorStore((s) => s.zoomMode)
  const showPanelOutlines = useEditorStore((s) => s.showPanelOutlines)
  const setReady = useEditorStore((s) => s.setReady)
  const setError = useEditorStore((s) => s.setError)
  const setSource = useEditorStore((s) => s.setSource)
  const setFitZoom = useEditorStore((s) => s.setFitZoom)
  const select = useEditorStore((s) => s.select)
  const setHovered = useEditorStore((s) => s.setHovered)
  const setReadout = useEditorStore((s) => s.setReadout)
  const setEditing = useEditorStore((s) => s.setEditing)
  const revision = useHistoryStore((s) => s.revision)

  const scrollRef = useRef<HTMLDivElement>(null)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const surfaceRef = useRef<HTMLDivElement>(null)
  const gestureRef = useRef<Gesture | null>(null)
  const [viewportWidth, setViewportWidth] = useState(0)
  const [hoverRect, setHoverRect] = useState<Rect | null>(null)
  const [guides, setGuides] = useState<Array<Guide & { origin: { x: number; y: number }; panel: { width: number; height: number } }>>([])

  useEffect(() => {
    setStageIframe(iframeRef.current)
    setStageScroller(scrollRef.current)
    return () => {
      setStageIframe(null)
      setStageScroller(null)
    }
  }, [])

  // Track the scroll container width so 'fit' can follow window resizes.
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => setViewportWidth(entry.contentRect.width))
    ro.observe(el)
    setViewportWidth(el.clientWidth)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    if (zoomMode !== 'fit' || !geometry || viewportWidth <= 0) return
    setFitZoom((viewportWidth - STAGE_PADDING * 2) / geometry.width)
  }, [zoomMode, geometry, viewportWidth, setFitZoom])

  // Load / reload the document. `loadToken` changes on open and on reload.
  useEffect(() => {
    const iframe = iframeRef.current
    if (!iframe || !filePath) return
    let cancelled = false
    useHistoryStore.getState().reset()

    // The pristine file text is fetched alongside the render: it is the baseline
    // every save patches, so it must be the bytes on disk, not the mutated DOM.
    Promise.all([loadStrip(iframe, stripDocumentUrl(filePath, loadToken)), readStrip(filePath)])
      .then(([{ geometry: g, composerErrors: errs }, source]) => {
        if (cancelled) return
        // Size the iframe to the measured strip so the scaled box matches the
        // content exactly (no scrollbars inside, no clipped overhang).
        iframe.style.width = `${g.width}px`
        iframe.style.height = `${g.height}px`
        setSource(source.html, source.mtime)
        // Index only after the ready gate — device attributes and text metrics
        // are not trustworthy before it.
        // `fresh` resets block identity: this is a new document, not a re-index
        // after a structural edit.
        setReady(g, indexStrip(iframe, { fresh: true }), errs)
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      })

    return () => {
      cancelled = true
    }
  }, [filePath, loadToken, setReady, setError, setSource])

  // A text session belongs to one block; moving the selection ends it.
  useEffect(() => {
    const { editingId: open } = useEditorStore.getState()
    if (open && open !== selectedId) endTextEditing()
  }, [selectedId])

  useEffect(() => endTextEditing, [loadToken])

  // Re-measure the selection whenever it changes or the document is mutated.
  useEffect(() => {
    const iframe = iframeRef.current
    if (!iframe || !selectedId || status !== 'ready') {
      setReadout(null)
      return
    }
    const node = nodes.find((n) => n.id === selectedId)
    setReadout(node ? readBlock(iframe, node) : null)
  }, [selectedId, nodes, status, revision, setReadout])

  useEffect(() => {
    const iframe = iframeRef.current
    if (!iframe || !hoveredId) {
      setHoverRect(null)
      return
    }
    setHoverRect(docRectOf(iframe, hoveredId))
  }, [hoveredId, revision])

  /** Pointer position in strip-document coordinates. */
  const toDocPoint = useCallback(
    (clientX: number, clientY: number): { x: number; y: number } | null => {
      const surface = surfaceRef.current
      if (!surface) return null
      const box = surface.getBoundingClientRect()
      return { x: (clientX - box.left) / zoom, y: (clientY - box.top) / zoom }
    },
    [zoom],
  )

  /** Snapshot the geometry a gesture will be computed from. */
  const beginGesture = useCallback(
    (nodeId: string, handle: HandleId | null, docX: number, docY: number): boolean => {
      const iframe = iframeRef.current
      const el = getElement(nodeId)
      const node = nodes.find((n) => n.id === nodeId)
      if (!iframe || !el || !node) return false
      const r = readBlock(iframe, node)
      if (!r || !r.movable) return false

      gestureRef.current = {
        nodeId,
        handle,
        ctx: { kind: node.kind, anchors: resolveAnchors(el), rect: r.rect, panel: r.panelSize },
        originX: docX,
        originY: docY,
        label: `${handle ? 'resize' : 'move'}:${nodeId}:${Date.now()}`,
        moved: false,
        // docRect and rect measure the same box in two frames; their difference
        // is where the panel starts.
        panelOrigin: { x: r.docRect.left - r.rect.left, y: r.docRect.top - r.rect.top },
        panelId: `panel:${node.panelIndex}`,
      }
      return true
    },
    [nodes],
  )

  /**
   * Enter a text session at whatever zoom the user is on. Editing works fine at
   * any scale; zoom stays entirely under their control.
   */
  const startTextEditing = useCallback(
    (nodeId: string) => {
      const iframe = iframeRef.current
      if (!iframe) return
      // Drop any parent-document selection left over from the double-click.
      window.getSelection()?.removeAllRanges()
      const session = beginTextEditing({
        iframe,
        nodeId,
        onEnd: () => setEditing(null),
      })
      if (session) setEditing(nodeId)
    },
    [setEditing],
  )

  const onDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      const iframe = iframeRef.current
      const p = toDocPoint(e.clientX, e.clientY)
      if (!iframe || !p || status !== 'ready') return
      if (useEditorStore.getState().mode === 'agent') return
      const id = hitTest(iframe, p.x, p.y)
      const node = id ? nodes.find((n) => n.id === id) : null
      if (!id || node?.kind !== 'text') return
      select(id)
      startTextEditing(id)
    },
    [toDocPoint, status, nodes, select, startTextEditing],
  )

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      const iframe = iframeRef.current
      const p = toDocPoint(e.clientX, e.clientY)
      if (!iframe || !p || status !== 'ready') return
      // While a text session owns the iframe, the surface is inert.
      if (useEditorStore.getState().editingId) return
      // Selection stays available in read-only mode — inspecting is harmless;
      // only the gesture that would mutate is withheld.
      if (readOnly) {
        const id = hitTest(iframe, p.x, p.y)
        if (id !== selectedId) select(id)
        return
      }

      const id = hitTest(iframe, p.x, p.y)
      if (id !== selectedId) select(id)
      if (!id || isPanelNodeId(id)) return

      // Select-and-drag in one gesture, as in every design tool. The gesture is
      // armed here but only applied past DRAG_THRESHOLD, so a plain click that
      // wobbles a pixel does not nudge the design.
      if (beginGesture(id, null, p.x, p.y)) {
        surfaceRef.current?.setPointerCapture(e.pointerId)
      }
    },
    [toDocPoint, status, selectedId, select, beginGesture, readOnly],
  )

  const onHandleDown = useCallback(
    (handle: HandleId, e: React.PointerEvent) => {
      e.stopPropagation()
      const p = toDocPoint(e.clientX, e.clientY)
      if (!p || !selectedId) return
      if (beginGesture(selectedId, handle, p.x, p.y)) {
        surfaceRef.current?.setPointerCapture(e.pointerId)
      }
    },
    [toDocPoint, selectedId, beginGesture],
  )

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const iframe = iframeRef.current
      const p = toDocPoint(e.clientX, e.clientY)
      if (!iframe || !p || status !== 'ready') return

      const g = gestureRef.current
      if (!g) {
        const id = hitTest(iframe, p.x, p.y)
        if (id !== useEditorStore.getState().hoveredId) setHovered(id)
        return
      }

      const dx = p.x - g.originX
      const dy = p.y - g.originY
      if (!g.moved && Math.hypot(dx, dy) * zoom < DRAG_THRESHOLD) return
      g.moved = true

      let box = g.handle ? resizeBox(g.ctx, g.handle, dx, dy) : moveBox(g.ctx.rect, dx, dy)

      // Snap on move only. Resizing is usually a deliberate dimension, and Alt
      // suppresses snapping entirely for the times the design wants an
      // off-alignment position.
      if (!g.handle && !e.altKey) {
        const snapped = snapToPanel(g.ctx.panel, box, SNAP_THRESHOLD_SCREEN_PX / zoom)
        box = snapped.box
        setGuides(snapped.guides.map((guide) => ({ ...guide, origin: g.panelOrigin, panel: g.ctx.panel })))
      } else {
        setGuides([])
      }

      // Cross-panel move: the block changes panel when its *centre* crosses,
      // not when it merely overlaps. Overlap is normal and intentional here —
      // blocks are meant to overhang so `overflow: hidden` can crop them — so an
      // overlap rule would reparent every deliberately cropped device. The
      // centre only leaves once the block genuinely belongs next door.
      if (!g.handle) {
        const centre = {
          x: g.panelOrigin.x + box.left + box.width / 2,
          y: g.panelOrigin.y + box.top + box.height / 2,
        }
        const over = panelAtDocPoint(iframe, centre.x, centre.y)
        if (over && over.id !== g.panelId) {
          const to = over.el.getBoundingClientRect()
          // Re-express the box against the panel it is landing in, so the block
          // does not jump on drop.
          const moved: GestureContext = {
            ...g.ctx,
            panel: { width: to.width, height: to.height },
          }
          const local = {
            ...box,
            left: g.panelOrigin.x + box.left - to.left,
            top: g.panelOrigin.y + box.top - to.top,
          }
          const result = moveBlockToPanel(g.nodeId, over.id, placementDeclarations(moved, local), g.label)
          if (!result.error) {
            // The gesture now measures against the new panel: rebase its frame
            // and its origin, and re-anchor the pointer so the next move event
            // computes a delta from where the block actually is.
            g.ctx = moved
            g.ctx.rect = local
            g.panelOrigin = { x: to.left, y: to.top }
            g.panelId = over.id
            g.originX = p.x
            g.originY = p.y
            setGuides([])
            return
          }
        }
      }

      applyGeometry(g.nodeId, boxToDeclarations(g.ctx, box), g.label)
    },
    [toDocPoint, status, zoom, setHovered],
  )

  const endGesture = useCallback((e: React.PointerEvent) => {
    if (gestureRef.current) {
      surfaceRef.current?.releasePointerCapture(e.pointerId)
      gestureRef.current = null
    }
    setGuides([])
  }, [])

  // Ctrl/⌘ + wheel zooms, matching every design tool. Plain wheel scrolls.
  const onWheel = useCallback((e: React.WheelEvent) => {
    if (!e.ctrlKey && !e.metaKey) return
    e.preventDefault()
    const { zoom: z, setZoom } = useEditorStore.getState()
    setZoom(z * Math.exp(-e.deltaY / 400))
  }, [])

  // Arrow-key nudge: 1px, or 10px with Shift.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        select(null)
        return
      }
      const target = e.target as HTMLElement | null
      // Never steal arrows from a focused input (inspector number fields).
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return

      const deltas: Record<string, [number, number]> = {
        ArrowLeft: [-1, 0],
        ArrowRight: [1, 0],
        ArrowUp: [0, -1],
        ArrowDown: [0, 1],
      }
      const d = deltas[e.key]
      if (!d) return

      const iframe = iframeRef.current
      const { selectedId: id, nodes: ns, mode } = useEditorStore.getState()
      if (mode === 'agent') return
      const node = id ? ns.find((n) => n.id === id) : null
      const el = id ? getElement(id) : null
      if (!iframe || !id || !node || !el || node.kind === 'panel') return
      const r = readBlock(iframe, node)
      if (!r?.movable) return

      e.preventDefault()
      const step = e.shiftKey ? 10 : 1
      const ctx: GestureContext = {
        kind: node.kind,
        anchors: resolveAnchors(el),
        rect: r.rect,
        panel: r.panelSize,
      }
      applyGeometry(id, boxToDeclarations(ctx, moveBox(r.rect, d[0] * step, d[1] * step)), `nudge:${id}`)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [select])

  const selectedNode = nodes.find((n) => n.id === selectedId) ?? null
  const stageWidth = geometry ? geometry.width * zoom : 0
  const stageHeight = geometry ? geometry.height * zoom : 0
  const showHover = hoverRect && hoveredId !== selectedId && !gestureRef.current

  return (
    // `select-none`: the stage is a canvas, not prose. Without it a double-click
    // in the parent document extends the selection over the <iframe> element,
    // and Chrome paints a translucent grey wash across the whole strip until the
    // next click collapses it. The strip's own document selects normally — it is
    // a separate document and unaffected by this.
    <div
      ref={scrollRef}
      onWheel={onWheel}
      className="stage-backdrop relative h-full w-full select-none overflow-auto"
    >
      <div className="min-h-full min-w-full" style={{ padding: STAGE_PADDING, width: 'max-content' }}>
        <div
          ref={surfaceRef}
          onDoubleClick={onDoubleClick}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endGesture}
          onPointerCancel={endGesture}
          onMouseLeave={() => setHovered(null)}
          className="relative"
          style={{ width: stageWidth || undefined, height: stageHeight || undefined, touchAction: 'none' }}
        >
          <iframe
            ref={iframeRef}
            title="strip"
            // `origin 0 0` keeps doc→screen mapping a pure multiply by zoom.
            // `pointer-events: none` routes every pointer event to the parent
            // surface so hit-testing goes through one code path
            // (elementFromPoint), and the strip's own links can never steal a
            // selection click.
            style={{
              width: 1024,
              height: 1024,
              transform: `scale(${zoom})`,
              transformOrigin: '0 0',
              border: 'none',
              display: 'block',
              background: '#fff',
              pointerEvents: 'none',
              visibility: status === 'ready' ? 'visible' : 'hidden',
            }}
          />

          {showPanelOutlines && geometry && status === 'ready' && (
            <div className="pointer-events-none absolute inset-0">
              {geometry.gaps.map((g, i) => (
                <div
                  key={`gap-${i}`}
                  className="gap-hatch absolute"
                  style={{ left: g.left * zoom, top: g.top * zoom, width: g.width * zoom, height: g.height * zoom }}
                />
              ))}
              {geometry.panels.map((p) => (
                <div
                  key={p.index}
                  className="absolute border border-sky-400/45"
                  style={{ left: p.left * zoom, top: p.top * zoom, width: p.width * zoom, height: p.height * zoom }}
                >
                  <span className="absolute -top-5 left-0 rounded bg-sky-500/80 px-1.5 text-[10px] font-medium text-zinc-950">
                    {p.index} · {Math.round(p.width)}×{Math.round(p.height)}
                  </span>
                </div>
              ))}
            </div>
          )}

          {status === 'ready' && (
            <div className="pointer-events-none absolute inset-0">
              {guides.map((guide, i) =>
                guide.axis === 'x' ? (
                  <div
                    key={`gx-${i}`}
                    className={`absolute w-px ${guide.kind === 'center' ? 'bg-fuchsia-400' : 'bg-fuchsia-400/70'}`}
                    style={{
                      left: (guide.origin.x + guide.position) * zoom,
                      top: guide.origin.y * zoom,
                      height: guide.panel.height * zoom,
                    }}
                  />
                ) : (
                  <div
                    key={`gy-${i}`}
                    className={`absolute h-px ${guide.kind === 'center' ? 'bg-fuchsia-400' : 'bg-fuchsia-400/70'}`}
                    style={{
                      top: (guide.origin.y + guide.position) * zoom,
                      left: guide.origin.x * zoom,
                      width: guide.panel.width * zoom,
                    }}
                  />
                ),
              )}
              {showHover && <HoverOutline rect={hoverRect} zoom={zoom} />}
              {selectedNode && readout && (
                <SelectionOverlay
                  node={selectedNode}
                  rect={readout.docRect}
                  zoom={zoom}
                  overhangs={Object.values(readout.overhang).some(Boolean)}
                  movable={readout.movable && !readOnly}
                  editing={editingId === selectedNode.id}
                  onHandleDown={onHandleDown}
                />
              )}
            </div>
          )}
        </div>
      </div>

      {status === 'loading' && (
        <div className="absolute inset-0 flex items-center justify-center gap-2 text-sm text-zinc-400">
          <Loader2 size={16} className="animate-spin" />
          Building devices and loading fonts…
        </div>
      )}

      {status === 'error' && (
        <div className="absolute inset-0 flex items-center justify-center p-8">
          <div className="max-w-lg rounded-lg border border-rose-800 bg-rose-950/60 p-4 text-sm text-rose-200">
            <div className="mb-1 flex items-center gap-2 font-medium">
              <AlertTriangle size={15} /> Could not load the strip
            </div>
            <p className="text-rose-300/90">{error}</p>
          </div>
        </div>
      )}

      {status === 'ready' && composerErrors.length > 0 && (
        <div className="pointer-events-none absolute bottom-3 left-3 max-w-md rounded-md border border-amber-700 bg-amber-950/85 p-3 text-xs text-amber-200">
          <div className="mb-1 flex items-center gap-1.5 font-medium">
            <AlertTriangle size={13} /> {composerErrors.length} device block(s) failed to build
          </div>
          <ul className="list-inside list-disc space-y-0.5 text-amber-300/90">
            {composerErrors.slice(0, 4).map((m, i) => (
              <li key={i} className="truncate">
                {m}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
