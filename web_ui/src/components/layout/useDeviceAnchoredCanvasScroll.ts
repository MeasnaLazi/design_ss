import type { RefObject } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Canvas } from 'fabric'
import type { TPointerEventInfo } from 'fabric'

import { deviceGroupFrameUnionBBox } from '../../canvas/deviceFramesUnionBBox'
import { getArtboardDimensionsFromConfig } from '../../constants/artboardPresets'
import { totalContinuousWidth } from '../../constants/appStoreScreens'
import type { DesignObjectRecord } from '../../store/designTypes'
import { useDesignStore } from '../../store/useDesignStore'

/** Matches `p-6` on the scroll viewport — keeps union aligned with the same inset as padding. */
const SCROLL_END_PAD_PX = 24

/** Extra space (CSS px) around the canvas so bezels / edges stay clear of the scroll edge. */
const DEVICE_FRAME_SCROLL_MARGIN_CSS_PX = 50

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

  const bump = useCallback(() => {
    if (freezeAnchoredLayoutRef.current) return
    if (rafRef.current != null) return
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null
      if (freezeAnchoredLayoutRef.current) return
      setTick((t) => t + 1)
    })
  }, [])

  const unlockScrollAndRelayout = useCallback(() => {
    if (!freezeAnchoredLayoutRef.current) return
    freezeAnchoredLayoutRef.current = false
    viewportRef.current?.style.removeProperty('overflow')
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    setTick((t) => t + 1)
  }, [viewportRef])

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

  useEffect(() => {
    const c = fabricCanvas
    if (!c) return

    const onDown = (opt: TPointerEventInfo) => {
      if (opt.target == null) return
      const e = opt.e
      if (e instanceof MouseEvent && e.button !== 0) return
      freezeAnchoredLayoutRef.current = true
      /** Imperative lock avoids a React commit + `CanvasArea` re-render on drag start (layout thrash). */
      viewportRef.current?.style.setProperty('overflow', 'hidden')
    }

    c.on('mouse:down', onDown)
    window.addEventListener('pointerup', unlockScrollAndRelayout)
    window.addEventListener('pointercancel', unlockScrollAndRelayout)

    return () => {
      c.off('mouse:down', onDown)
      window.removeEventListener('pointerup', unlockScrollAndRelayout)
      window.removeEventListener('pointercancel', unlockScrollAndRelayout)
      freezeAnchoredLayoutRef.current = false
      viewportRef.current?.style.removeProperty('overflow')
    }
  }, [fabricCanvas, unlockScrollAndRelayout, viewportRef])

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
