import { getArtboardDimensionsFromConfig } from '../../constants/artboardPresets'
import { screenshotLeftEdgeXs, totalContinuousWidth } from '../../constants/appStoreScreens'
import { Canvas, Circle, type FabricObject, FabricImage, Line, Rect } from 'fabric'
import { memo, useEffect, useRef } from 'react'

import { applyCanvasCssZoom } from '../../canvas/applyCanvasCssZoom'
import { attachDeviceGroupNoCacheForScreenshotClip } from '../../canvas/deviceGroupDisableCachingForClipRotation'
import { attachDeviceGroupPanelClamp } from '../../canvas/deviceGroupPanelClamp'
import { attachDeviceGroupUniformScaling } from '../../canvas/deviceGroupUniformScaling'
import { attachTextboxSafeZoneClamp } from '../../canvas/textSafeZone'
import {
  addGutterOverlayRects,
  attachGutterOverlaysAlwaysOnTop,
  removeGutterOverlaysFromCanvas,
  type GutterOverlayRect,
} from '../../canvas/gutterOverlayRects'
import {
  isLayerNameOverlayText,
  removeLayerNameOverlaysFromCanvas,
  syncLayerNameOverlays,
  type LayerNameOverlayText,
} from '../../canvas/layerNameOverlays'
import {
  isPanelBackgroundImage,
  type PanelBgImage,
  type PanelSlotRect,
  PANEL_BG_MARK,
  PANEL_SLOT_MARK,
  STRIP_BACKGROUND_FILL_MARK,
  type StripBackgroundFillRect,
} from '../../canvas/canvasObjectMarks'
import {
  CANVAS_GUTTER_COLOR,
  fabricPanelRectFill,
} from '../../lib/canvasBackground'
import { getFabricObjectId } from '../../lib/fabricObjectRegistry'
import { useDesignStore } from '../../store/useDesignStore'
import { isDesignSystemCanvasObject } from '../../canvas/canvasObjectMarks'

const GUIDE_STROKE = 'rgba(255,255,255,0.35)'
const GUIDE_DASH: [number, number] = [6, 6]
const SMART_GUIDE_STROKE = 'rgba(255, 215, 0, 0.98)'
const SMART_GUIDE_DASH: [number, number] = [10, 14]
/** Visual thresholds in on-screen px (converted to canvas units via CSS zoom). */
const SMART_GUIDE_SHOW_TOLERANCE_SCREEN_PX = 12
const SMART_GUIDE_SNAP_TOLERANCE_SCREEN_PX = 6

const PANEL_SLOT_STROKE = 'rgba(255,255,255,0.1)'

/** Removes the strip background image and any stray marked images (async / layout races). */
function removeStripBackgroundImageFromCanvas(
  canvas: Canvas,
  ref: { current: FabricImage | null },
): void {
  const tracked = ref.current
  if (tracked) {
    try {
      canvas.remove(tracked)
    } catch {
      /* already detached */
    }
    tracked.dispose()
    ref.current = null
  }
  for (const o of [...canvas.getObjects()]) {
    if (isPanelBackgroundImage(o)) {
      canvas.remove(o)
      o.dispose()
    }
  }
}

/**
 * Fabric 7's {@link ActiveSelection} extends {@link Group}, so `instanceof Group` is true for
 * multi-select. Use the same duck-typing as fabric's `isActiveSelection` so we never treat a
 * marquee selection as a single device/text layer.
 */
function isFabricActiveSelection(active: FabricObject | undefined): boolean {
  return !!active && 'multiSelectionStacking' in active
}

function attachSelectionSync(canvas: Canvas): void {
  const pushSelectionToStore = () => {
    const active = canvas.getActiveObject()

    if (active && isFabricActiveSelection(active)) {
      useDesignStore.getState().setSelectedObject(null)
      return
    }

    if (!active || isDesignSystemCanvasObject(active)) {
      useDesignStore.getState().setSelectedObject(null)
      return
    }

    const id = getFabricObjectId(active)
    useDesignStore.getState().setSelectedObject(id ?? null)
  }

  canvas.on('selection:created', pushSelectionToStore)
  canvas.on('selection:updated', pushSelectionToStore)
  canvas.on('selection:cleared', () => {
    useDesignStore.getState().setSelectedObject(null)
  })
}

type PanelBounds = { left: number; top: number; right: number; bottom: number }

type SmartGuideOverlay = {
  vertical: Line
  horizontal: Line
  intersectionDot: Circle
}

type AxisBestMatch = { dist: number; anchor: number; feature: number; featureIdx: 0 | 1 | 2 }
type AxisSnapCandidate = { anchor: number; featureIdx: 0 | 1 | 2 }

type DragSnapState = {
  target: FabricObject | null
  snapX: AxisSnapCandidate | null
  snapY: AxisSnapCandidate | null
}

function panelBoundsForCenterX(
  centerX: number,
  screens: number,
  gap: number,
  panelW: number,
  panelH: number,
): PanelBounds {
  let bestIdx = 0
  let bestDist = Infinity
  for (let i = 0; i < screens; i++) {
    const midX = i * (panelW + gap) + panelW / 2
    const dist = Math.abs(centerX - midX)
    if (dist < bestDist) {
      bestDist = dist
      bestIdx = i
    }
  }
  const left = bestIdx * (panelW + gap)
  return { left, top: 0, right: left + panelW, bottom: panelH }
}

function createSmartGuideOverlay(canvas: Canvas): SmartGuideOverlay {
  const vertical = new Line([0, 0, 0, 0], {
    stroke: SMART_GUIDE_STROKE,
    strokeWidth: 8,
    strokeDashArray: [...SMART_GUIDE_DASH],
    selectable: false,
    evented: false,
    visible: false,
    excludeFromExport: true,
  })
  const horizontal = new Line([0, 0, 0, 0], {
    stroke: SMART_GUIDE_STROKE,
    strokeWidth: 8,
    strokeDashArray: [...SMART_GUIDE_DASH],
    selectable: false,
    evented: false,
    visible: false,
    excludeFromExport: true,
  })
  const intersectionDot = new Circle({
    radius: 3,
    fill: SMART_GUIDE_STROKE,
    left: 0,
    top: 0,
    originX: 'center',
    originY: 'center',
    selectable: false,
    evented: false,
    visible: false,
    excludeFromExport: true,
  })
  canvas.add(vertical, horizontal, intersectionDot)
  return { vertical, horizontal, intersectionDot }
}

function hideSmartGuideOverlay(overlay: SmartGuideOverlay): void {
  overlay.vertical.set({ visible: false })
  overlay.horizontal.set({ visible: false })
  overlay.intersectionDot.set({ visible: false })
}

function attachPanelAlignmentGuides(canvas: Canvas): () => void {
  const overlay = createSmartGuideOverlay(canvas)
  const dragState: DragSnapState = { target: null, snapX: null, snapY: null }

  const getBestAxisMatch = (
    anchors: number[],
    features: [number, number, number],
  ): AxisBestMatch | null => {
    let best: AxisBestMatch | null = null
    anchors.forEach((anchor) => {
      features.forEach((feature, idx) => {
        const dist = Math.abs(anchor - feature)
        if (!best || dist < best.dist) {
          best = {
            dist,
            anchor,
            feature,
            featureIdx: idx as 0 | 1 | 2,
          }
        }
      })
    })
    return best
  }

  const onMoving = (opt?: { target?: FabricObject }) => {
    const target = opt?.target
    if (!target || target === overlay.vertical || target === overlay.horizontal) return
    if (dragState.target !== target) {
      dragState.target = target
      dragState.snapX = null
      dragState.snapY = null
    }

    const cfg = useDesignStore.getState().config
    if (cfg.screens < 1) return
    const canvasZoom = Math.max(useDesignStore.getState().canvasZoom, 0.01)
    const showTolerance = SMART_GUIDE_SHOW_TOLERANCE_SCREEN_PX / canvasZoom
    const snapTolerance = SMART_GUIDE_SNAP_TOLERANCE_SCREEN_PX / canvasZoom
    const canvasWidth = canvas.getWidth()
    const canvasHeight = canvas.getHeight()
    const { width: panelW, height: panelH } = getArtboardDimensionsFromConfig(cfg)
    const bboxBefore = target.getBoundingRect()
    const panel = panelBoundsForCenterX(
      bboxBefore.left + bboxBefore.width / 2,
      cfg.screens,
      cfg.gap,
      panelW,
      panelH,
    )

    const xAnchors = [panel.left, panel.left + panelW / 2, panel.right]
    const yAnchors = [panel.top, panel.top + panelH / 2, panel.bottom]

    const xFeatures: [number, number, number] = [
      bboxBefore.left,
      bboxBefore.left + bboxBefore.width / 2,
      bboxBefore.left + bboxBefore.width,
    ]
    const yFeatures: [number, number, number] = [
      bboxBefore.top,
      bboxBefore.top + bboxBefore.height / 2,
      bboxBefore.top + bboxBefore.height,
    ]

    const bestX = getBestAxisMatch(xAnchors, xFeatures)
    const bestY = getBestAxisMatch(yAnchors, yFeatures)

    let guideX: number | null = null
    let guideY: number | null = null

    if (bestX && bestX.dist <= showTolerance) {
      guideX = bestX.anchor
      if (bestX.dist <= snapTolerance) {
        dragState.snapX = { anchor: bestX.anchor, featureIdx: bestX.featureIdx }
      } else {
        dragState.snapX = null
      }
    } else {
      dragState.snapX = null
    }
    if (bestY && bestY.dist <= showTolerance) {
      guideY = bestY.anchor
      if (bestY.dist <= snapTolerance) {
        dragState.snapY = { anchor: bestY.anchor, featureIdx: bestY.featureIdx }
      } else {
        dragState.snapY = null
      }
    } else {
      dragState.snapY = null
    }

    /**
     * If only one axis is aligned, still draw the other axis through the object center so users
     * always get a visible cross helper while dragging near an anchor.
     */
    let drawGuideX = guideX
    let drawGuideY = guideY
    if (drawGuideX !== null && drawGuideY === null) {
      drawGuideY = yFeatures[1]
    } else if (drawGuideY !== null && drawGuideX === null) {
      drawGuideX = xFeatures[1]
    }
    const hasExactIntersection = guideX !== null && guideY !== null

    overlay.vertical.set({
      x1: drawGuideX ?? 0,
      y1: 0,
      x2: drawGuideX ?? 0,
      y2: canvasHeight,
      visible: drawGuideX !== null,
    })
    overlay.horizontal.set({
      x1: 0,
      y1: drawGuideY ?? 0,
      x2: canvasWidth,
      y2: drawGuideY ?? 0,
      visible: drawGuideY !== null,
    })
    overlay.intersectionDot.set({
      left: drawGuideX ?? 0,
      top: drawGuideY ?? 0,
      visible: hasExactIntersection,
    })
    canvas.bringObjectToFront(overlay.vertical)
    canvas.bringObjectToFront(overlay.horizontal)
    canvas.bringObjectToFront(overlay.intersectionDot)
    canvas.requestRenderAll()
  }

  const finalizeSnapForTarget = (target?: FabricObject) => {
    if (target && dragState.target === target) {
      const bbox = target.getBoundingRect()
      const xFeatures: [number, number, number] = [
        bbox.left,
        bbox.left + bbox.width / 2,
        bbox.left + bbox.width,
      ]
      const yFeatures: [number, number, number] = [
        bbox.top,
        bbox.top + bbox.height / 2,
        bbox.top + bbox.height,
      ]
      let moved = false
      if (dragState.snapX) {
        const dx = dragState.snapX.anchor - xFeatures[dragState.snapX.featureIdx]
        if (dx !== 0) {
          target.set({ left: (target.left ?? 0) + dx })
          moved = true
        }
      }
      if (dragState.snapY) {
        const dy = dragState.snapY.anchor - yFeatures[dragState.snapY.featureIdx]
        if (dy !== 0) {
          target.set({ top: (target.top ?? 0) + dy })
          moved = true
        }
      }
      if (moved) {
        target.setCoords()
      }
    }
  }

  const onModified = (opt?: { target?: FabricObject }) => {
    finalizeSnapForTarget(opt?.target)
    dragState.target = null
    dragState.snapX = null
    dragState.snapY = null
    hideSmartGuideOverlay(overlay)
    canvas.requestRenderAll()
  }

  const onSelectionCleared = () => {
    dragState.target = null
    dragState.snapX = null
    dragState.snapY = null
    hideSmartGuideOverlay(overlay)
    canvas.requestRenderAll()
  }

  canvas.on('object:moving', onMoving)
  canvas.on('object:modified', onModified)
  canvas.on('selection:cleared', onSelectionCleared)

  return () => {
    canvas.off('object:moving', onMoving)
    canvas.off('object:modified', onModified)
    canvas.off('selection:cleared', onSelectionCleared)
    canvas.remove(overlay.vertical, overlay.horizontal, overlay.intersectionDot)
  }
}

export const CanvasWorkspace = memo(function CanvasWorkspace() {
  const canvasElRef = useRef<HTMLCanvasElement>(null)
  const fabricRef = useRef<Canvas | null>(null)
  const guideLinesRef = useRef<Line[]>([])
  const stripBackgroundFillRef = useRef<StripBackgroundFillRect | null>(null)
  const panelSlotRectsRef = useRef<PanelSlotRect[]>([])
  const stripBackgroundImageRef = useRef<FabricImage | null>(null)
  const gutterOverlayRectsRef = useRef<GutterOverlayRect[]>([])
  const layerNameOverlaysRef = useRef<LayerNameOverlayText[]>([])
  const gutterStackCleanupRef = useRef<(() => void) | null>(null)
  const textSafeZoneCleanupRef = useRef<(() => void) | null>(null)
  const smartGuideCleanupRef = useRef<(() => void) | null>(null)
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
  const gradientKey = useDesignStore((s) => JSON.stringify(s.config.backgroundGradient))
  const backgroundImageUrl = useDesignStore((s) => s.config.backgroundImageUrl)
  const canvasZoom = useDesignStore((s) => s.canvasZoom)
  const showLayerNames = useDesignStore((s) => s.config.showLayerNames)
  const layerTitleMode = useDesignStore((s) => s.config.layerTitleMode)
  const objects = useDesignStore((s) => s.objects)

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
      textSafeZoneCleanupRef.current?.()
      textSafeZoneCleanupRef.current = attachTextboxSafeZoneClamp(canvas)
      attachDeviceGroupNoCacheForScreenshotClip(canvas)
      smartGuideCleanupRef.current = attachPanelAlignmentGuides(canvas)
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
      stripBackgroundFillRef.current &&
      panelSlotRectsRef.current.length === screens &&
      screens > 0
    ) {
      stripBackgroundFillRef.current.set({
        fill: panelFill,
        width,
        height,
      })
      panelSlotRectsRef.current.forEach((r, i) => {
        const left = i * (panelW + gap)
        r.set({ left, width: panelW, height: panelH })
      })
      canvas.requestRenderAll()
      applyCanvasCssZoom(
        canvas,
        width,
        height,
        useDesignStore.getState().canvasZoom,
      )
      return
    }

    removeStripBackgroundImageFromCanvas(canvas, stripBackgroundImageRef)

    if (stripBackgroundFillRef.current) {
      canvas.remove(stripBackgroundFillRef.current)
      stripBackgroundFillRef.current.dispose()
      stripBackgroundFillRef.current = null
    }
    panelSlotRectsRef.current.forEach((r) => canvas.remove(r))
    panelSlotRectsRef.current = []
    guideLinesRef.current.forEach((line) => canvas.remove(line))
    guideLinesRef.current = []

    const stripRect = new Rect({
      left: 0,
      top: 0,
      originX: 'left',
      originY: 'top',
      width,
      height,
      fill: panelFill,
      strokeWidth: 0,
      selectable: false,
      evented: false,
    }) as StripBackgroundFillRect
    stripRect[STRIP_BACKGROUND_FILL_MARK] = true
    canvas.insertAt(0, stripRect)
    stripBackgroundFillRef.current = stripRect

    for (let i = 0; i < screens; i++) {
      const left = i * (panelW + gap)
      const rect = new Rect({
        left,
        top: 0,
        originX: 'left',
        originY: 'top',
        width: panelW,
        height: panelH,
        fill: 'transparent',
        stroke: PANEL_SLOT_STROKE,
        strokeWidth: 1,
        selectable: false,
        evented: false,
      }) as PanelSlotRect
      rect[PANEL_SLOT_MARK] = true
      canvas.insertAt(i + 1, rect)
      panelSlotRectsRef.current.push(rect)
    }

    const xs = screenshotLeftEdgeXs(screens, gap, panelW)
    let guideInsertAt = 1 + screens
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
    gradientKey,
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

    removeStripBackgroundImageFromCanvas(canvas, stripBackgroundImageRef)

    const storeCfg = useDesignStore.getState().config
    const url = storeCfg.backgroundImageUrl
    const { width: W, height: H } = getArtboardDimensionsFromConfig(storeCfg)
    const n = storeCfg.screens
    const g = storeCfg.gap
    const stripW = totalContinuousWidth(n, g, W)

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
        const scale = Math.max(stripW / iw, H / ih)

        const img = (await base.clone()) as PanelBgImage
        img[PANEL_BG_MARK] = true

        if (cancelled) return
        if (useDesignStore.getState().config.backgroundImageUrl !== url) return

        img.set({
          originX: 'center',
          originY: 'center',
          left: stripW / 2,
          top: H / 2,
          scaleX: scale,
          scaleY: scale,
          selectable: false,
          evented: false,
          clipPath: new Rect({
            left: stripW / 2,
            top: H / 2,
            width: stripW,
            height: H,
            originX: 'center',
            originY: 'center',
            absolutePositioned: true,
            selectable: false,
            evented: false,
          }),
        })

        if (cancelled) return
        if (useDesignStore.getState().config.backgroundImageUrl !== url) return

        canvas.insertAt(1 + n, img)
        stripBackgroundImageRef.current = img

        if (!cancelled) {
          canvas.requestRenderAll()
          console.log('[CanvasWorkspace] strip-wide background image applied', { stripW, n })
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
    const canvas = fabricRef.current
    if (!canvas) return

    if (!showLayerNames) {
      removeLayerNameOverlaysFromCanvas(canvas, layerNameOverlaysRef)
      canvas.requestRenderAll()
      return
    }

    let rafId = 0
    const syncNow = () => {
      try {
        syncLayerNameOverlays(canvas, layerNameOverlaysRef, objects, layerTitleMode)
        canvas.requestRenderAll()
      } catch (e) {
        console.error('[CanvasWorkspace] layer name overlay sync failed', e)
      }
    }
    const scheduleSync = () => {
      if (rafId !== 0) return
      rafId = requestAnimationFrame(() => {
        rafId = 0
        syncNow()
      })
    }
    const onCanvasObjectChanged = (opt?: { target?: FabricObject }) => {
      if (opt?.target && isLayerNameOverlayText(opt.target)) return
      scheduleSync()
    }

    syncNow()
    canvas.on('object:modified', onCanvasObjectChanged)
    canvas.on('object:moving', onCanvasObjectChanged)
    canvas.on('object:scaling', onCanvasObjectChanged)
    canvas.on('object:rotating', onCanvasObjectChanged)
    canvas.on('object:skewing', onCanvasObjectChanged)
    canvas.on('object:added', onCanvasObjectChanged)
    canvas.on('object:removed', onCanvasObjectChanged)

    return () => {
      if (rafId !== 0) cancelAnimationFrame(rafId)
      canvas.off('object:modified', onCanvasObjectChanged)
      canvas.off('object:moving', onCanvasObjectChanged)
      canvas.off('object:scaling', onCanvasObjectChanged)
      canvas.off('object:rotating', onCanvasObjectChanged)
      canvas.off('object:skewing', onCanvasObjectChanged)
      canvas.off('object:added', onCanvasObjectChanged)
      canvas.off('object:removed', onCanvasObjectChanged)
    }
  }, [showLayerNames, layerTitleMode, objects, screens, gap, artboardPresetId])

  useEffect(() => {
    return () => {
      console.log('[CanvasWorkspace] disposing fabric.Canvas')
      gutterStackCleanupRef.current?.()
      gutterStackCleanupRef.current = null
      textSafeZoneCleanupRef.current?.()
      textSafeZoneCleanupRef.current = null
      smartGuideCleanupRef.current?.()
      smartGuideCleanupRef.current = null
      const c = fabricRef.current
      if (c) {
        removeGutterOverlaysFromCanvas(c, gutterOverlayRectsRef)
        removeLayerNameOverlaysFromCanvas(c, layerNameOverlaysRef)
      }
      guideLinesRef.current = []
      stripBackgroundFillRef.current = null
      panelSlotRectsRef.current = []
      stripBackgroundImageRef.current = null
      gutterOverlayRectsRef.current = []
      layerNameOverlaysRef.current = []
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
