import { getArtboardDimensionsFromConfig } from '../../constants/artboardPresets'
import { screenshotLeftEdgeXs, totalContinuousWidth } from '../../constants/appStoreScreens'
import {
  ActiveSelection,
  Canvas,
  FabricImage,
  Group,
  IText,
  Line,
  Rect,
} from 'fabric'
import { memo, useEffect, useRef } from 'react'

import { applyCanvasCssZoom } from '../../canvas/applyCanvasCssZoom'
import { attachDeviceGroupNoCacheForScreenshotClip } from '../../canvas/deviceGroupDisableCachingForClipRotation'
import { attachDeviceGroupPanelClamp } from '../../canvas/deviceGroupPanelClamp'
import { attachDeviceGroupUniformScaling } from '../../canvas/deviceGroupUniformScaling'
import {
  addGutterOverlayRects,
  attachGutterOverlaysAlwaysOnTop,
  removeGutterOverlaysFromCanvas,
  type GutterOverlayRect,
} from '../../canvas/gutterOverlayRects'
import {
  isPanelBackgroundImage,
  type PanelBgImage,
  type PanelSlotRect,
  PANEL_BG_MARK,
  PANEL_SLOT_MARK,
} from '../../canvas/canvasObjectMarks'
import {
  CANVAS_GUTTER_COLOR,
  fabricPanelRectFill,
} from '../../lib/canvasBackground'
import { getFabricObjectId } from '../../lib/fabricObjectRegistry'
import { useDesignStore } from '../../store/useDesignStore'

const GUIDE_STROKE = 'rgba(255,255,255,0.35)'
const GUIDE_DASH: [number, number] = [6, 6]

const PANEL_SLOT_STROKE = 'rgba(255,255,255,0.1)'

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

export const CanvasWorkspace = memo(function CanvasWorkspace() {
  const canvasElRef = useRef<HTMLCanvasElement>(null)
  const fabricRef = useRef<Canvas | null>(null)
  const guideLinesRef = useRef<Line[]>([])
  const panelBackgroundRectsRef = useRef<Rect[]>([])
  const panelBackgroundImagesRef = useRef<FabricImage[]>([])
  const gutterOverlayRectsRef = useRef<GutterOverlayRect[]>([])
  const gutterStackCleanupRef = useRef<(() => void) | null>(null)
  const prevLayoutRef = useRef<{ screens: number; gap: number; preset: string }>({
    screens: -1,
    gap: -1,
    preset: '',
  })

  const screens = useDesignStore((s) => s.config.screens)
  const gap = useDesignStore((s) => s.config.gap)
  const artboardPresetId = useDesignStore((s) => s.config.artboardPresetId)
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
    const cfg0 = useDesignStore.getState().config
    const { width: panelW0, height: panelH0 } = getArtboardDimensionsFromConfig(cfg0)

    if (!canvas) {
      const width = totalContinuousWidth(screens, gap, panelW0)
      const height = panelH0
      canvas = new Canvas(el, {
        width,
        height,
        backgroundColor: CANVAS_GUTTER_COLOR,
        preserveObjectStacking: true,
        /** Marquee / multi-select rectangle — default 1px is easy to miss on dark gutters */
        selectionLineWidth: 2,
        selectionBorderColor: 'rgba(244, 244, 245, 0.9)',
        selectionColor: 'rgba(96, 165, 250, 0.22)',
        /**
         * Default `enableRetinaScaling` multiplies backing-store pixels by devicePixelRatio.
         * At full App Store artboard resolution that makes each drag-frame paint enormous; CSS zoom
         * already scales the element for preview, so logical-pixel buffers keep drags smooth.
         */
        enableRetinaScaling: false,
      })
      fabricRef.current = canvas
      useDesignStore.getState().setFabricCanvas(canvas)
      attachSelectionSync(canvas)
      attachDeviceGroupUniformScaling(canvas)
      attachDeviceGroupPanelClamp(canvas)
      attachDeviceGroupNoCacheForScreenshotClip(canvas)
      gutterStackCleanupRef.current = attachGutterOverlaysAlwaysOnTop(
        canvas,
        () => gutterOverlayRectsRef.current,
      )
      console.log('[CanvasWorkspace] fabric.Canvas initialized', { width, height })
    }

    const cfg = useDesignStore.getState().config
    const { width: panelW, height: panelH } = getArtboardDimensionsFromConfig(cfg)
    const width = totalContinuousWidth(screens, gap, panelW)
    const height = panelH

    console.log('[CanvasWorkspace] sync layout', {
      screens,
      gap,
      width,
      height,
      background,
      artboardPresetId: cfg.artboardPresetId,
    })

    canvas.setDimensions({ width, height })
    canvas.backgroundColor = CANVAS_GUTTER_COLOR

    const prev = prevLayoutRef.current
    const layoutChanged =
      prev.screens !== screens || prev.gap !== gap || prev.preset !== artboardPresetId
    prevLayoutRef.current = { screens, gap, preset: artboardPresetId }

    const panelFill = fabricPanelRectFill(cfg)

    if (
      !layoutChanged &&
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
      const left = i * (panelW + gap)
      const rect = new Rect({
        left,
        top: 0,
        originX: 'left',
        originY: 'top',
        width: panelW,
        height: panelH,
        fill: panelFill,
        stroke: PANEL_SLOT_STROKE,
        strokeWidth: 1,
        selectable: false,
        evented: false,
      }) as PanelSlotRect
      rect[PANEL_SLOT_MARK] = true
      canvas.insertAt(0, rect)
      panelBackgroundRectsRef.current.push(rect)
    }

    const xs = screenshotLeftEdgeXs(screens, gap, panelW)
    let guideInsertAt = screens
    for (const x of xs) {
      const line = new Line([x, 0, x, height], {
        stroke: GUIDE_STROKE,
        strokeWidth: 1,
        strokeDashArray: [...GUIDE_DASH],
        selectable: false,
        evented: false,
        excludeFromExport: true,
      })
      canvas.insertAt(guideInsertAt, line)
      guideInsertAt += 1
      guideLinesRef.current.push(line)
    }

    addGutterOverlayRects(canvas, gutterOverlayRectsRef, screens, gap, panelW, panelH)

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
    artboardPresetId,
    background,
    backgroundMode,
    gradientFrom,
    gradientTo,
    gradientAngle,
  ])

  useEffect(() => {
    const canvas = fabricRef.current
    if (!canvas) return
    const { width: pw, height: ph } = getArtboardDimensionsFromConfig(
      useDesignStore.getState().config,
    )
    const w = totalContinuousWidth(screens, gap, pw)
    applyCanvasCssZoom(canvas, w, ph, canvasZoom)
  }, [canvasZoom, screens, gap, artboardPresetId])

  useEffect(() => {
    const canvas = fabricRef.current
    if (!canvas) return

    let cancelled = false

    removeAllPanelBackgroundImagesFromCanvas(canvas, panelBackgroundImagesRef)

    const storeCfg = useDesignStore.getState().config
    const url = storeCfg.backgroundImageUrl
    const { width: W, height: H } = getArtboardDimensionsFromConfig(storeCfg)

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
  }, [backgroundImageUrl, screens, gap, artboardPresetId])

  useEffect(() => {
    return () => {
      console.log('[CanvasWorkspace] disposing fabric.Canvas')
      gutterStackCleanupRef.current?.()
      gutterStackCleanupRef.current = null
      const c = fabricRef.current
      if (c) {
        removeGutterOverlaysFromCanvas(c, gutterOverlayRectsRef)
      }
      guideLinesRef.current = []
      panelBackgroundRectsRef.current = []
      panelBackgroundImagesRef.current = []
      gutterOverlayRectsRef.current = []
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
})
