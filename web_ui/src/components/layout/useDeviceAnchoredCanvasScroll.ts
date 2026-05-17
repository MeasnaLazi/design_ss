import type { RefObject } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Canvas } from 'fabric'

import { deviceGroupFrameUnionBBox } from '../../canvas/deviceFramesUnionBBox'
import { getArtboardDimensionsFromConfig } from '../../constants/artboardPresets'
import { totalContinuousWidth } from '../../constants/appStoreScreens'
import type { DesignObjectRecord } from '../../store/designTypes'
import { useDesignStore } from '../../store/useDesignStore'

/** Matches `p-6` on the scroll viewport — keeps union aligned with the same inset as padding. */
const SCROLL_END_PAD_PX = 24

/** Extra space (CSS px) around the canvas so bezels / edges stay clear of the scroll edge. */
const DEVICE_FRAME_SCROLL_MARGIN_CSS_PX = 50

/** Ignore sub-pixel jitter on `object:moving` before freezing layout (screen px). */
const MOVE_FREEZE_THRESHOLD_PX = 5

function pointerClient(e: unknown): { x: number; y: number } | null {
  if (!e || typeof e !== 'object') return null
  if ('clientX' in e && 'clientY' in e) {
    const cx = (e as { clientX: unknown }).clientX
    const cy = (e as { clientY: unknown }).clientY
    if (typeof cx === 'number' && typeof cy === 'number' && Number.isFinite(cx) && Number.isFinite(cy)) {
      return { x: cx, y: cy }
    }
  }
  if ('touches' in e) {
    const t = (e as TouchEvent).touches?.[0]
    if (t && Number.isFinite(t.clientX) && Number.isFinite(t.clientY)) {
      return { x: t.clientX, y: t.clientY }
    }
  }
  return null
}

export type DeviceAnchoredCanvasLayout = {
  deviceAnchored: boolean
  contentW: number
  canvasLeft: number
  canvasTop: number
  trackHeight: number
  canvasCssW: number
  canvasCssH: number
}

type AnchoredFrameLayout = {
  canvasLeft: number
  canvasTop: number
  contentW: number
  trackHeight: number
  canvasCssW: number
  canvasCssH: number
}

/**
 * Positions the **entire** artboard in the scroll track with a fixed inset so panel 1 starts at a
 * stable offset. We intentionally do **not** shift `canvasLeft` by device position — that made the
 * strip extend mostly left of the scroll origin and hid early panels from horizontal scroll.
 */
function computeAnchoredFrameLayout(
  fabricCanvas: Canvas | null,
  objects: DesignObjectRecord[],
  screens: number,
  gap: number,
  panelWidth: number,
  panelHeight: number,
  canvasZoom: number,
  viewportW: number,
): AnchoredFrameLayout | null {
  if (!fabricCanvas) return null
  if (!deviceGroupFrameUnionBBox(fabricCanvas, objects)) return null

  const artboardW = totalContinuousWidth(screens, gap, panelWidth)
  const artboardH = panelHeight
  const z = canvasZoom
  const canvasCssW = artboardW * z
  const canvasCssH = artboardH * z
  const pad = SCROLL_END_PAD_PX
  const m = DEVICE_FRAME_SCROLL_MARGIN_CSS_PX
  const canvasLeft = pad + m
  const contentW = Math.max(viewportW, canvasLeft + canvasCssW + pad + m)
  const canvasTop = m
  const trackHeight = canvasCssH + 2 * m

  return {
    canvasLeft,
    canvasTop,
    contentW,
    trackHeight,
    canvasCssW,
    canvasCssH,
  }
}

export function useDeviceAnchoredCanvasScroll(
  viewportRef: RefObject<HTMLElement | null>,
): DeviceAnchoredCanvasLayout {
  const fabricCanvas = useDesignStore((s) => s.fabricCanvas)
  const objects = useDesignStore((s) => s.objects)
  const canvasZoom = useDesignStore((s) => s.canvasZoom)
  const screens = useDesignStore((s) => s.config.screens)
  const gap = useDesignStore((s) => s.config.gap)
  const artboardPresetId = useDesignStore((s) => s.config.artboardPresetId)

  const [viewportW, setViewportW] = useState(0)
  const [tick, setTick] = useState(0)

  const rafRef = useRef<number | null>(null)
  const freezeAnchoredLayoutRef = useRef(false)
  /** First `object:moving` screen position — freeze only after real drag distance. */
  const moveScreenStartRef = useRef<{ x: number; y: number } | null>(null)

  const bump = useCallback(() => {
    if (freezeAnchoredLayoutRef.current) return
    if (rafRef.current != null) return
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null
      if (freezeAnchoredLayoutRef.current) return
      setTick((t) => t + 1)
      useDesignStore.getState().fabricCanvas?.calcOffset()
    })
  }, [])

  const beginFreezeForDrag = useCallback(() => {
    if (freezeAnchoredLayoutRef.current) return
    freezeAnchoredLayoutRef.current = true
  }, [])

  const unlockScrollAndRelayout = useCallback(() => {
    moveScreenStartRef.current = null
    if (!freezeAnchoredLayoutRef.current) return
    freezeAnchoredLayoutRef.current = false
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    /** One coalesced relayout; avoids double `setTick` when `object:modified` also calls `bump`. */
    bump()
  }, [bump])

  useEffect(() => {
    const el = viewportRef.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      setViewportW(el.clientWidth)
    })
    ro.observe(el)
    setViewportW(el.clientWidth)
    return () => ro.disconnect()
  }, [viewportRef])

  /**
   * Never tie `bump` to `after:render` or `object:moving` — that schedules ~60 React updates/sec
   * while dragging and makes layer moves stutter. Layout no longer depends on live device position.
   */
  useEffect(() => {
    const c = fabricCanvas
    if (!c) return
    const events = ['object:modified', 'object:added', 'object:removed'] as const
    for (const e of events) {
      c.on(e, bump)
    }
    return () => {
      for (const e of events) {
        c.off(e, bump)
      }
    }
  }, [fabricCanvas, bump])

  /**
   * While dragging, skip `bump()` relayout (see `bump` guard). We intentionally **do not** toggle
   * `overflow` on the scroll viewport: that hides/shows scrollbars, `ResizeObserver` updates
   * `viewportW`, and `contentW` in the anchored layout jumps by ~scrollbar width (intermittent
   * vertical shift). Scale/rotate/skew freeze immediately; move uses a small pointer threshold so
   * Fabric’s first `object:moving` tick doesn’t freeze on selection jitter.
   */
  useEffect(() => {
    const c = fabricCanvas
    if (!c) return

    const onMoving = (opt?: { e?: unknown }) => {
      const p = pointerClient(opt?.e)
      if (!p) return
      const start = moveScreenStartRef.current
      if (!start) {
        moveScreenStartRef.current = p
        return
      }
      if (Math.hypot(p.x - start.x, p.y - start.y) < MOVE_FREEZE_THRESHOLD_PX) return
      beginFreezeForDrag()
    }

    const onControlTransform = () => {
      beginFreezeForDrag()
    }

    const onTransformEnd = () => {
      unlockScrollAndRelayout()
    }

    c.on('object:moving', onMoving)
    for (const ev of ['object:scaling', 'object:rotating', 'object:skewing'] as const) {
      c.on(ev, onControlTransform)
    }
    c.on('object:modified', onTransformEnd)
    window.addEventListener('pointerup', onTransformEnd)
    window.addEventListener('pointercancel', onTransformEnd)

    return () => {
      c.off('object:moving', onMoving)
      for (const ev of ['object:scaling', 'object:rotating', 'object:skewing'] as const) {
        c.off(ev, onControlTransform)
      }
      c.off('object:modified', onTransformEnd)
      window.removeEventListener('pointerup', onTransformEnd)
      window.removeEventListener('pointercancel', onTransformEnd)
      moveScreenStartRef.current = null
      freezeAnchoredLayoutRef.current = false
    }
  }, [fabricCanvas, unlockScrollAndRelayout, beginFreezeForDrag])

  useEffect(() => {
    return () => {
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current)
      }
    }
  }, [])

  useEffect(() => {
    let prevObjects = useDesignStore.getState().objects
    let prevZoom = useDesignStore.getState().canvasZoom
    return useDesignStore.subscribe((s) => {
      if (s.objects !== prevObjects || s.canvasZoom !== prevZoom) {
        prevObjects = s.objects
        prevZoom = s.canvasZoom
        bump()
      }
    })
  }, [bump])

  return useMemo(() => {
    const { width: panelW, height: panelH } = getArtboardDimensionsFromConfig({
      artboardPresetId,
    })
    const artboardW = totalContinuousWidth(screens, gap, panelW)
    const artboardH = panelH
    const z = canvasZoom
    const canvasCssW = artboardW * z
    const canvasCssH = artboardH * z

    void tick

    const inner = computeAnchoredFrameLayout(
      fabricCanvas,
      objects,
      screens,
      gap,
      panelW,
      panelH,
      canvasZoom,
      viewportW,
    )
    if (!inner) {
      return {
        deviceAnchored: false,
        contentW: 0,
        canvasLeft: 0,
        canvasTop: 0,
        trackHeight: canvasCssH,
        canvasCssW,
        canvasCssH,
      }
    }

    return {
      deviceAnchored: true,
      contentW: inner.contentW,
      canvasLeft: inner.canvasLeft,
      canvasTop: inner.canvasTop,
      trackHeight: inner.trackHeight,
      canvasCssW: inner.canvasCssW,
      canvasCssH: inner.canvasCssH,
    }
  }, [
    fabricCanvas,
    objects,
    canvasZoom,
    screens,
    gap,
    artboardPresetId,
    viewportW,
    tick,
  ])
}
