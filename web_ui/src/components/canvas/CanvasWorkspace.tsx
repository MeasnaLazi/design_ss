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
import { attachDeviceGroupUniformScaling } from '../../canvas/deviceGroupUniformScaling'
import {
  CANVAS_GUTTER_COLOR,
  fabricPanelRectFill,
} from '../../lib/canvasBackground'
import { getFabricObjectId } from '../../lib/fabricObjectRegistry'
import { useDesignStore } from '../../store/useDesignStore'

const GUIDE_STROKE = 'rgba(255,255,255,0.35)'
const GUIDE_DASH: [number, number] = [6, 6]

const PANEL_SLOT_STROKE = 'rgba(255,255,255,0.1)'

const PANEL_BG_MARK = '__appsPublisherPanelBg' as const
type PanelBgImage = FabricImage & { [PANEL_BG_MARK]?: true }

function isPanelBackgroundImage(o: unknown): o is PanelBgImage {
  return o instanceof FabricImage && !!(o as PanelBgImage)[PANEL_BG_MARK]
}

/** Removes tracked and any stray per-panel background images (avoids stale refs / async races). */
function removeAllPanelBackgroundImagesFromCanvas(
  canvas: Canvas,
  ref: { current: FabricImage[] },
): void {
  ref.current.forEach((img) => {
    try {
      canvas.remove(img)
    } catch {
      /* already detached */
    }
    img.dispose()
  })
  ref.current = []
  for (const o of [...canvas.getObjects()]) {
    if (isPanelBackgroundImage(o)) {
      canvas.remove(o)
      o.dispose()
    }
  }
}

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
  const panelBackgroundRectsRef = useRef<Rect[]>([])
  const panelBackgroundImagesRef = useRef<FabricImage[]>([])
  const prevScreensGapRef = useRef<{ screens: number; gap: number }>({
    screens: -1,
    gap: -1,
  })

  const screens = useDesignStore((s) => s.config.screens)
  const gap = useDesignStore((s) => s.config.gap)
  const background = useDesignStore((s) => s.config.background)
  const backgroundMode = useDesignStore((s) => s.config.backgroundMode)
  const gradientFrom = useDesignStore((s) => s.config.backgroundGradient.colorFrom)
  const gradientTo = useDesignStore((s) => s.config.backgroundGradient.colorTo)
  const gradientAngle = useDesignStore((s) => s.config.backgroundGradient.angleDeg)
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
        backgroundColor: CANVAS_GUTTER_COLOR,
        preserveObjectStacking: true,
      })
      fabricRef.current = canvas
      useDesignStore.getState().setFabricCanvas(canvas)
      attachSelectionSync(canvas)
      attachDeviceGroupUniformScaling(canvas)
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
    canvas.backgroundColor = CANVAS_GUTTER_COLOR

    const prev = prevScreensGapRef.current
    const screensOrGapChanged = prev.screens !== screens || prev.gap !== gap
    prevScreensGapRef.current = { screens, gap }

    const cfg = useDesignStore.getState().config
    const panelFill = fabricPanelRectFill(cfg)

    if (
      !screensOrGapChanged &&
      panelBackgroundRectsRef.current.length === screens &&
      screens > 0
    ) {
      panelBackgroundRectsRef.current.forEach((r) => r.set({ fill: panelFill }))
      canvas.requestRenderAll()
      applyCanvasCssZoom(
        canvas,
        width,
        height,
        useDesignStore.getState().canvasZoom,
      )
      return
    }

    removeAllPanelBackgroundImagesFromCanvas(canvas, panelBackgroundImagesRef)

    panelBackgroundRectsRef.current.forEach((r) => canvas.remove(r))
    panelBackgroundRectsRef.current = []
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
        fill: panelFill,
        stroke: PANEL_SLOT_STROKE,
        strokeWidth: 1,
        selectable: false,
        evented: false,
        objectCaching: false,
      })
      canvas.insertAt(0, rect)
      panelBackgroundRectsRef.current.push(rect)
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
  }, [
    screens,
    gap,
    background,
    backgroundMode,
    gradientFrom,
    gradientTo,
    gradientAngle,
  ])

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

    removeAllPanelBackgroundImagesFromCanvas(canvas, panelBackgroundImagesRef)

    const url = useDesignStore.getState().config.backgroundImageUrl
    const W = APP_STORE_SCREEN_WIDTH
    const H = APP_STORE_SCREEN_HEIGHT

    if (!url) {
      canvas.requestRenderAll()
      return
    }

    void (async () => {
      let base: FabricImage | undefined
      try {
        base = await FabricImage.fromURL(url, { crossOrigin: 'anonymous' })
        if (cancelled) {
          return
        }
        if (useDesignStore.getState().config.backgroundImageUrl !== url) {
          return
        }

        const iw = Math.max(base.width || 1, 1)
        const ih = Math.max(base.height || 1, 1)
        const n = useDesignStore.getState().config.screens
        const g = useDesignStore.getState().config.gap

        for (let i = 0; i < n; i++) {
          if (cancelled) break
          if (useDesignStore.getState().config.backgroundImageUrl !== url) break

          const img = (await base.clone()) as PanelBgImage
          img[PANEL_BG_MARK] = true

          if (cancelled) break
          if (useDesignStore.getState().config.backgroundImageUrl !== url) break

          const left = i * (W + g)
          const scale = Math.max(W / iw, H / ih)

          img.set({
            originX: 'center',
            originY: 'center',
            left: left + W / 2,
            top: H / 2,
            scaleX: scale,
            scaleY: scale,
            selectable: false,
            evented: false,
            objectCaching: false,
            clipPath: new Rect({
              left: left + W / 2,
              top: H / 2,
              width: W,
              height: H,
              originX: 'center',
              originY: 'center',
              absolutePositioned: true,
              selectable: false,
              evented: false,
            }),
          })

          if (cancelled) break
          if (useDesignStore.getState().config.backgroundImageUrl !== url) break

          canvas.insertAt(n + i, img)
          panelBackgroundImagesRef.current.push(img)
        }

        if (!cancelled) {
          canvas.requestRenderAll()
          console.log('[CanvasWorkspace] per-panel background images applied', { n })
        }
      } catch (e) {
        console.error('[CanvasWorkspace] background image load failed', e)
      } finally {
        base?.dispose()
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
      panelBackgroundRectsRef.current = []
      panelBackgroundImagesRef.current = []
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
