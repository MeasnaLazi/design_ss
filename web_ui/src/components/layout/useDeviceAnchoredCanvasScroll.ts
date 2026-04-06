import type { RefObject } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { deviceFramesUnionBBox } from '../../canvas/deviceFramesUnionBBox'
import {
  APP_STORE_SCREEN_HEIGHT,
  totalContinuousWidth,
} from '../../constants/appStoreScreens'
import { useDesignStore } from '../../store/useDesignStore'

/** Matches `p-6` on the scroll viewport — keeps union aligned with the same inset as padding. */
const SCROLL_END_PAD_PX = 24

/** Extra space (CSS px) around the device union so bezels / controls stay in view. */
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

export function useDeviceAnchoredCanvasScroll(
  viewportRef: RefObject<HTMLElement | null>,
): DeviceAnchoredCanvasLayout {
  const fabricCanvas = useDesignStore((s) => s.fabricCanvas)
  const objects = useDesignStore((s) => s.objects)
  const canvasZoom = useDesignStore((s) => s.canvasZoom)
  const screens = useDesignStore((s) => s.config.screens)
  const gap = useDesignStore((s) => s.config.gap)

  const [viewportW, setViewportW] = useState(0)
  const [tick, setTick] = useState(0)

  const rafRef = useRef<number | null>(null)
  const bump = useCallback(() => {
    if (rafRef.current != null) return
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null
      setTick((t) => t + 1)
    })
  }, [])

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

  useEffect(() => {
    const c = fabricCanvas
    if (!c) return
    const events = [
      'after:render',
      'object:modified',
      'object:moving',
      'object:scaling',
      'object:rotating',
      'object:skewing',
    ] as const
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
    const artboardW = totalContinuousWidth(screens, gap)
    const artboardH = APP_STORE_SCREEN_HEIGHT
    const z = canvasZoom
    const canvasCssW = artboardW * z
    const canvasCssH = artboardH * z
    const pad = SCROLL_END_PAD_PX
    const V = viewportW

    void tick

    const m = DEVICE_FRAME_SCROLL_MARGIN_CSS_PX

    if (!fabricCanvas) {
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

    const union = deviceFramesUnionBBox(fabricCanvas, objects)
    if (!union) {
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

    const canvasLeft = pad + m - union.left * z
    const contentW = Math.max(V, canvasLeft + canvasCssW + pad + m)
    const canvasTop = m
    const trackHeight = canvasCssH + 2 * m

    return {
      deviceAnchored: true,
      contentW,
      canvasLeft,
      canvasTop,
      trackHeight,
      canvasCssW,
      canvasCssH,
    }
  }, [
    fabricCanvas,
    objects,
    canvasZoom,
    screens,
    gap,
    viewportW,
    tick,
  ])
}
