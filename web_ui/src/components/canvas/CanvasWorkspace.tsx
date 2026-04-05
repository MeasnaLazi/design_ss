import {
  APP_STORE_SCREEN_HEIGHT,
  APP_STORE_SCREEN_WIDTH,
  screenshotLeftEdgeXs,
  totalContinuousWidth,
} from '../../constants/appStoreScreens'
import {
  ActiveSelection,
  Canvas,
  FabricImage,
  Group,
  IText,
  Line,
  Rect,
} from 'fabric'
import { useEffect, useRef } from 'react'

import { applyCanvasCssZoom } from '../../canvas/applyCanvasCssZoom'
import { getFabricObjectId } from '../../lib/fabricObjectRegistry'
import { useDesignStore } from '../../store/useDesignStore'

const GUIDE_STROKE = 'rgba(255,255,255,0.35)'
const GUIDE_DASH: [number, number] = [6, 6]

const PANEL_SLOT_FILL = 'rgba(255,255,255,0.045)'
const PANEL_SLOT_STROKE = 'rgba(255,255,255,0.1)'

function attachSelectionSync(canvas: Canvas): void {
  const pushSelectionToStore = (eventName: string) => {
    const active = canvas.getActiveObject()
    console.log(`[CanvasWorkspace] ${eventName}`, { activeType: active?.type })

    if (active instanceof ActiveSelection) {
      useDesignStore.getState().setSelectedObject(null)
      console.log('[CanvasWorkspace] activeSelection — store cleared')
      return
    }

    if (active instanceof IText) {
      const id = getFabricObjectId(active)
      useDesignStore.getState().setSelectedObject(id ?? null)
      console.log('[CanvasWorkspace] selected text id', id)
      return
    }

    if (active instanceof Group) {
      const id = getFabricObjectId(active)
      useDesignStore.getState().setSelectedObject(id ?? null)
      console.log('[CanvasWorkspace] selected group id', id)
      return
    }

    useDesignStore.getState().setSelectedObject(null)
  }

  canvas.on('selection:created', () => pushSelectionToStore('selection:created'))
  canvas.on('selection:updated', () => pushSelectionToStore('selection:updated'))
  canvas.on('selection:cleared', () => {
    console.log('[CanvasWorkspace] selection:cleared')
    useDesignStore.getState().setSelectedObject(null)
  })
}

export function CanvasWorkspace() {
  const canvasElRef = useRef<HTMLCanvasElement>(null)
  const fabricRef = useRef<Canvas | null>(null)
  const guideLinesRef = useRef<Line[]>([])
  const panelSlotRectsRef = useRef<Rect[]>([])

  const screens = useDesignStore((s) => s.config.screens)
  const gap = useDesignStore((s) => s.config.gap)
  const background = useDesignStore((s) => s.config.background)
  const backgroundImageUrl = useDesignStore((s) => s.config.backgroundImageUrl)
  const canvasZoom = useDesignStore((s) => s.canvasZoom)

  useEffect(() => {
    const el = canvasElRef.current
    if (!el) return

    let canvas = fabricRef.current
    if (!canvas) {
      const width = totalContinuousWidth(screens, gap)
      const height = APP_STORE_SCREEN_HEIGHT
      canvas = new Canvas(el, {
        width,
        height,
        backgroundColor: background,
        preserveObjectStacking: true,
      })
      fabricRef.current = canvas
      useDesignStore.getState().setFabricCanvas(canvas)
      attachSelectionSync(canvas)
      console.log('[CanvasWorkspace] fabric.Canvas initialized', { width, height })
    }

    const width = totalContinuousWidth(screens, gap)
    const height = APP_STORE_SCREEN_HEIGHT

    console.log('[CanvasWorkspace] sync layout', {
      screens,
      gap,
      width,
      height,
      background,
    })

    canvas.setDimensions({ width, height })
    canvas.backgroundColor = background

    panelSlotRectsRef.current.forEach((r) => canvas.remove(r))
    panelSlotRectsRef.current = []
    guideLinesRef.current.forEach((line) => canvas.remove(line))
    guideLinesRef.current = []

    for (let i = 0; i < screens; i++) {
      const left = i * (APP_STORE_SCREEN_WIDTH + gap)
      const rect = new Rect({
        left,
        top: 0,
        originX: 'left',
        originY: 'top',
        width: APP_STORE_SCREEN_WIDTH,
        height: APP_STORE_SCREEN_HEIGHT,
        fill: PANEL_SLOT_FILL,
        stroke: PANEL_SLOT_STROKE,
        strokeWidth: 1,
        selectable: false,
        evented: false,
        objectCaching: false,
        excludeFromExport: true,
      })
      canvas.insertAt(0, rect)
      panelSlotRectsRef.current.push(rect)
    }

    const xs = screenshotLeftEdgeXs(screens, gap)
    let guideInsertAt = screens
    for (const x of xs) {
      const line = new Line([x, 0, x, height], {
        stroke: GUIDE_STROKE,
        strokeWidth: 1,
        strokeDashArray: [...GUIDE_DASH],
        selectable: false,
        evented: false,
        objectCaching: false,
        excludeFromExport: true,
      })
      canvas.insertAt(guideInsertAt, line)
      guideInsertAt += 1
      guideLinesRef.current.push(line)
    }

    canvas.requestRenderAll()
    applyCanvasCssZoom(
      canvas,
      width,
      height,
      useDesignStore.getState().canvasZoom,
    )
  }, [screens, gap, background])

  useEffect(() => {
    const canvas = fabricRef.current
    if (!canvas) return
    const w = totalContinuousWidth(screens, gap)
    const h = APP_STORE_SCREEN_HEIGHT
    applyCanvasCssZoom(canvas, w, h, canvasZoom)
  }, [canvasZoom, screens, gap])

  useEffect(() => {
    const canvas = fabricRef.current
    if (!canvas) return

    let cancelled = false
    const w = totalContinuousWidth(screens, gap)
    const h = APP_STORE_SCREEN_HEIGHT

    void (async () => {
      const url = useDesignStore.getState().config.backgroundImageUrl
      const oldBg = canvas.backgroundImage

      if (!url) {
        canvas.backgroundImage = undefined
        oldBg?.dispose()
        canvas.requestRenderAll()
        console.log('[CanvasWorkspace] background image cleared')
        return
      }

      try {
        const img = await FabricImage.fromURL(url, { crossOrigin: 'anonymous' })
        if (cancelled) {
          img.dispose()
          return
        }
        if (useDesignStore.getState().config.backgroundImageUrl !== url) {
          img.dispose()
          return
        }

        oldBg?.dispose()

        const iw = img.width || 1
        const ih = img.height || 1
        const scale = Math.max(w / iw, h / ih)
        img.set({
          scaleX: scale,
          scaleY: scale,
          originX: 'center',
          originY: 'center',
          left: w / 2,
          top: h / 2,
          selectable: false,
          evented: false,
        })
        canvas.backgroundImage = img
        canvas.requestRenderAll()
        console.log('[CanvasWorkspace] background image applied', { w, h, scale })
      } catch (e) {
        console.error('[CanvasWorkspace] background image load failed', e)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [backgroundImageUrl, screens, gap])

  useEffect(() => {
    return () => {
      console.log('[CanvasWorkspace] disposing fabric.Canvas')
      guideLinesRef.current = []
      panelSlotRectsRef.current = []
      const c = fabricRef.current
      c?.backgroundImage?.dispose()
      if (c) c.backgroundImage = undefined
      useDesignStore.getState().setFabricCanvas(null)
      useDesignStore.getState().setSelectedObject(null)
      c?.dispose()
      fabricRef.current = null
    }
  }, [])

  return (
    <canvas
      ref={canvasElRef}
      className="max-w-none rounded-sm shadow-lg ring-1 ring-zinc-700/60"
      aria-label="Design canvas"
    />
  )
}
