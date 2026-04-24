import type { Canvas, FabricObject } from 'fabric'
import { ActiveSelection, Group, Textbox } from 'fabric'

import { addDeviceFrameToCanvas } from './addDeviceFrameToCanvas'
import { addTextboxToCanvas } from './addTextboxToCanvas'
import { buildAgentLayoutSummaryFromCanvas } from './buildAgentLayoutSummary'
import { DEFAULT_DEVICE_FRAME_STYLE_ID } from '../constants/deviceFrameStyles'
import { getArtboardDimensionsFromConfig } from '../constants/artboardPresets'
import { pushAgentExportJson, pushLiveCanvasPreview } from '../lib/agentContextApi'
import { findObjectOnCanvasByAppId } from '../lib/fabricObjectRegistry'
import { normalizeBackgroundGradient } from '../lib/backgroundGradient'
import { useDesignStore } from '../store/useDesignStore'
import { useToastStore } from '../store/useToastStore'

const DESIGN_GRID = 16

const TEXT_FONT_SIZE_MIN = 8
const TEXT_FONT_SIZE_MAX = 400
const DEVICE_SIZE_MIN_PX = 80

type FontToken = 'headline' | 'subheadline' | 'body' | 'caption'

const FONT_MAP: Record<FontToken, string> = {
  headline: 'Inter',
  subheadline: 'Inter',
  body: 'Inter',
  caption: 'Inter',
}

function snapGrid(n: number): number {
  return Math.round(n / DESIGN_GRID) * DESIGN_GRID
}

function clampTextFontSize(n: number): number {
  return Math.min(TEXT_FONT_SIZE_MAX, Math.max(TEXT_FONT_SIZE_MIN, Math.round(n)))
}

function getTextboxForLayer(canvas: Canvas, layerId: string): Textbox | null {
  const rec = useDesignStore.getState().objects.find((o) => o.id === layerId)
  if (rec?.kind !== 'text') return null
  const obj = findObjectOnCanvasByAppId(canvas, layerId)
  return obj instanceof Textbox ? obj : null
}

function getDeviceGroupForLayer(canvas: Canvas, layerId: string): Group | null {
  const rec = useDesignStore.getState().objects.find((o) => o.id === layerId)
  if (rec?.kind !== 'device') return null
  const obj = findObjectOnCanvasByAppId(canvas, layerId)
  return obj instanceof Group ? obj : null
}

function fireObjectModified(canvas: Canvas, target: FabricObject) {
  canvas.fire('object:modified', { target })
  canvas.requestRenderAll()
}

function patchTextbox(canvas: Canvas, text: Textbox, patch: Record<string, unknown>) {
  text.set(patch)
  text.set('dirty', true)
  fireObjectModified(canvas, text)
}

function isHexColor(value: string): boolean {
  return /^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(value.trim())
}

function estimateTextWidth(content: string, fontSize: number): number {
  return Math.max(fontSize, Math.round(content.length * fontSize * 0.56))
}

function packIdFromDeviceFramePath(framePath: string): string | undefined {
  const parts = framePath.split('/').filter(Boolean)
  if (parts[0] === 'device-frames' && typeof parts[1] === 'string') return parts[1]
  return undefined
}

type AlignAnchor = 'center_x' | 'center_y' | 'top' | 'bottom' | 'left' | 'right'

function refRectCanvas(): { x: number; y: number; width: number; height: number } {
  const { width, height } = getArtboardDimensionsFromConfig(useDesignStore.getState().config)
  return { x: 0, y: 0, width, height }
}

/**
 * Applies one agent command using the same canvas/store paths as the interactive UI.
 * Does not persist to datasource (user Save only).
 */
export async function applyAgentCommand(
  canvas: Canvas,
  operation: string,
  args: Record<string, unknown>,
): Promise<void> {
  switch (operation) {
    case 'noop':
      return

    case 'add_device_frame': {
      const path = String(args.path ?? '')
      const frame = String(args.frame ?? DEFAULT_DEVICE_FRAME_STYLE_ID)
      const packId = path ? packIdFromDeviceFramePath(path.startsWith('/') ? path : `/${path}`) : undefined
      await addDeviceFrameToCanvas(canvas, frame, packId ? { packId } : undefined)
      return
    }

    case 'set_background': {
      const type = args.type
      const { setConfig } = useDesignStore.getState()
      if (type === 'color') {
        const value = String(args.value ?? '').trim()
        if (!isHexColor(value)) {
          useToastStore.getState().showToast('Solid background must be a hex color.', 'warning')
          return
        }
        setConfig({
          backgroundMode: 'solid',
          background: value,
          backgroundImageUrl: null,
        })
        canvas.requestRenderAll()
        return
      }
      if (type === 'gradient') {
        const g = normalizeBackgroundGradient(args.value)
        setConfig({
          backgroundMode: 'gradient',
          backgroundGradient: g,
          backgroundImageUrl: null,
        })
        canvas.requestRenderAll()
        return
      }
      if (type === 'image') {
        setConfig({ backgroundImageUrl: String(args.value ?? '') })
        canvas.requestRenderAll()
        return
      }
      useToastStore.getState().showToast('set_background type must be color | gradient | image.', 'warning')
      return
    }

    case 'align': {
      const layerId = String(args.layer_id ?? '')
      const anchor = String(args.anchor ?? '') as AlignAnchor
      const reference = String(args.reference ?? 'canvas')
      if (!layerId || !['center_x', 'center_y', 'top', 'bottom', 'left', 'right'].includes(anchor)) {
        useToastStore.getState().showToast('align: missing layer_id or invalid anchor.', 'warning')
        return
      }
      const target = findObjectOnCanvasByAppId(canvas, layerId)
      if (!target || target instanceof ActiveSelection) {
        useToastStore.getState().showToast(`align: layer "${layerId}" not found.`, 'warning')
        return
      }

      let refRect: { x: number; y: number; width: number; height: number }
      if (reference === 'canvas') {
        refRect = refRectCanvas()
      } else {
        const refObj = findObjectOnCanvasByAppId(canvas, reference)
        if (!refObj) {
          useToastStore.getState().showToast(`align: reference "${reference}" not found.`, 'warning')
          return
        }
        const rr = refObj.getBoundingRect()
        refRect = { x: rr.left, y: rr.top, width: rr.width, height: rr.height }
      }

      const b = target.getBoundingRect()
      const layerBox = { x: b.left, y: b.top, width: b.width, height: b.height }

      let nx = layerBox.x
      let ny = layerBox.y
      if (anchor === 'center_x') {
        nx = snapGrid(refRect.x + refRect.width / 2 - layerBox.width / 2)
      } else if (anchor === 'center_y') {
        ny = snapGrid(refRect.y + refRect.height / 2 - layerBox.height / 2)
      } else if (anchor === 'top') {
        ny = snapGrid(refRect.y)
      } else if (anchor === 'bottom') {
        ny = snapGrid(refRect.y + refRect.height - layerBox.height)
      } else if (anchor === 'left') {
        nx = snapGrid(refRect.x)
      } else {
        nx = snapGrid(refRect.x + refRect.width - layerBox.width)
      }

      const dx = nx - layerBox.x
      const dy = ny - layerBox.y
      target.set({
        left: (target.left ?? 0) + dx,
        top: (target.top ?? 0) + dy,
      })
      target.setCoords()
      canvas.fire('object:modified', { target })
      canvas.requestRenderAll()
      return
    }

    case 'add_text': {
      const content = String(args.content ?? '')
      const x = Number(args.x)
      const y = Number(args.y)
      const fontToken = String(args.font ?? 'body') as FontToken
      const size = Number(args.size)
      const color = String(args.color ?? '#ffffff')
      const align = String(args.align ?? 'left') as 'left' | 'center' | 'right'
      const weight = String(args.weight ?? '700')
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(size)) {
        useToastStore.getState().showToast('add_text: invalid x, y, or size.', 'warning')
        return
      }
      if (!(fontToken in FONT_MAP)) {
        useToastStore.getState().showToast('add_text: invalid font token.', 'warning')
        return
      }
      if (!isHexColor(color)) {
        useToastStore.getState().showToast('add_text: color must be hex.', 'warning')
        return
      }
      const width = estimateTextWidth(content, size)
      addTextboxToCanvas(canvas, {
        left: snapGrid(x),
        top: snapGrid(y),
        fontSize: size,
        width,
        fill: color,
        fontFamily: FONT_MAP[fontToken],
        text: content || 'Double-click to edit',
        textAlign: align,
        fontWeight: weight,
        layerName: 'Text',
      })
      return
    }

    case 'text_font_size_delta': {
      const layerId = String(args.layer_id ?? '')
      const delta = Number(args.delta)
      if (!layerId || !Number.isFinite(delta)) {
        useToastStore.getState().showToast('text_font_size_delta: need layer_id and numeric delta.', 'warning')
        return
      }
      const text = getTextboxForLayer(canvas, layerId)
      if (!text) {
        useToastStore.getState().showToast(`text_font_size_delta: text layer "${layerId}" not found.`, 'warning')
        return
      }
      const cur = text.fontSize ?? 32
      patchTextbox(canvas, text, { fontSize: clampTextFontSize(cur + delta) })
      return
    }

    case 'text_set_font_size': {
      const layerId = String(args.layer_id ?? '')
      const size = Number(args.size)
      if (!layerId || !Number.isFinite(size)) {
        useToastStore.getState().showToast('text_set_font_size: need layer_id and numeric size.', 'warning')
        return
      }
      const text = getTextboxForLayer(canvas, layerId)
      if (!text) {
        useToastStore.getState().showToast(`text_set_font_size: text layer "${layerId}" not found.`, 'warning')
        return
      }
      patchTextbox(canvas, text, { fontSize: clampTextFontSize(size) })
      return
    }

    case 'text_set_font_style': {
      const layerId = String(args.layer_id ?? '')
      const variant = String(args.variant ?? '')
      if (!layerId) {
        useToastStore.getState().showToast('text_set_font_style: missing layer_id.', 'warning')
        return
      }
      const text = getTextboxForLayer(canvas, layerId)
      if (!text) {
        useToastStore.getState().showToast(`text_set_font_style: text layer "${layerId}" not found.`, 'warning')
        return
      }
      const allowed = ['regular', 'bold', 'italic', 'bold_italic'] as const
      if (!(allowed as readonly string[]).includes(variant)) {
        useToastStore.getState().showToast('text_set_font_style: variant must be regular | bold | italic | bold_italic.', 'warning')
        return
      }
      if (variant === 'regular') {
        patchTextbox(canvas, text, { fontWeight: 'normal', fontStyle: 'normal' })
      } else if (variant === 'bold') {
        patchTextbox(canvas, text, { fontWeight: 'bold', fontStyle: 'normal' })
      } else if (variant === 'italic') {
        patchTextbox(canvas, text, { fontWeight: 'normal', fontStyle: 'italic' })
      } else {
        patchTextbox(canvas, text, { fontWeight: 'bold', fontStyle: 'italic' })
      }
      return
    }

    case 'text_set_color': {
      const layerId = String(args.layer_id ?? '')
      const color = String(args.color ?? '').trim()
      if (!layerId) {
        useToastStore.getState().showToast('text_set_color: missing layer_id.', 'warning')
        return
      }
      if (!isHexColor(color)) {
        useToastStore.getState().showToast('text_set_color: color must be hex (#rrggbb).', 'warning')
        return
      }
      const text = getTextboxForLayer(canvas, layerId)
      if (!text) {
        useToastStore.getState().showToast(`text_set_color: text layer "${layerId}" not found.`, 'warning')
        return
      }
      patchTextbox(canvas, text, { fill: color })
      return
    }

    case 'device_size_delta': {
      const layerId = String(args.layer_id ?? '')
      const rawDelta = args.delta_px ?? args.delta
      const delta = Number(rawDelta)
      if (!layerId || !Number.isFinite(delta)) {
        useToastStore.getState().showToast('device_size_delta: need layer_id and numeric delta_px (or delta).', 'warning')
        return
      }
      const target = getDeviceGroupForLayer(canvas, layerId)
      if (!target) {
        useToastStore.getState().showToast(`device_size_delta: device layer "${layerId}" not found.`, 'warning')
        return
      }
      const cw = target.getScaledWidth()
      if (cw < 1e-6) return
      const panelWidth = getArtboardDimensionsFromConfig(useDesignStore.getState().config).width
      const maxPx = Math.round(panelWidth * 3)
      let newW = cw + delta
      if (newW < DEVICE_SIZE_MIN_PX) newW = DEVICE_SIZE_MIN_PX
      if (newW > maxPx) newW = maxPx
      const factor = newW / cw
      const sx = (target.scaleX ?? 1) * factor
      const sy = (target.scaleY ?? 1) * factor
      target.set({ scaleX: sx, scaleY: sy })
      target.setCoords()
      fireObjectModified(canvas, target)
      return
    }

    case 'device_set_position': {
      const layerId = String(args.layer_id ?? '')
      const x = Number(args.x)
      const y = Number(args.y)
      if (!layerId || !Number.isFinite(x) || !Number.isFinite(y)) {
        useToastStore.getState().showToast('device_set_position: need layer_id, x, and y.', 'warning')
        return
      }
      const target = getDeviceGroupForLayer(canvas, layerId)
      if (!target) {
        useToastStore.getState().showToast(`device_set_position: device layer "${layerId}" not found.`, 'warning')
        return
      }
      target.set({ left: snapGrid(x), top: snapGrid(y) })
      target.setCoords()
      fireObjectModified(canvas, target)
      return
    }

    case 'device_move_delta': {
      const layerId = String(args.layer_id ?? '')
      const dx = Number(args.dx)
      const dy = Number(args.dy)
      if (!layerId || !Number.isFinite(dx) || !Number.isFinite(dy)) {
        useToastStore.getState().showToast('device_move_delta: need layer_id, dx, and dy.', 'warning')
        return
      }
      const target = getDeviceGroupForLayer(canvas, layerId)
      if (!target) {
        useToastStore.getState().showToast(`device_move_delta: device layer "${layerId}" not found.`, 'warning')
        return
      }
      target.set({
        left: snapGrid((target.left ?? 0) + dx),
        top: snapGrid((target.top ?? 0) + dy),
      })
      target.setCoords()
      fireObjectModified(canvas, target)
      return
    }

    case 'device_set_angle': {
      const layerId = String(args.layer_id ?? '')
      const angle = Number(args.angle)
      if (!layerId || !Number.isFinite(angle)) {
        useToastStore.getState().showToast('device_set_angle: need layer_id and numeric angle (degrees).', 'warning')
        return
      }
      const target = getDeviceGroupForLayer(canvas, layerId)
      if (!target) {
        useToastStore.getState().showToast(`device_set_angle: device layer "${layerId}" not found.`, 'warning')
        return
      }
      target.set({ angle })
      target.setCoords()
      fireObjectModified(canvas, target)
      return
    }

    case 'export_json': {
      const summary = buildAgentLayoutSummaryFromCanvas(canvas)
      await pushAgentExportJson(summary)
      useToastStore.getState().showToast('Layout summary pushed for agent (pull-export).', 'success')
      return
    }

    case 'render_preview':
    case 'render_workspace_preview': {
      await pushLiveCanvasPreview(canvas, 2)
      useToastStore.getState().showToast('Preview PNG pushed for agent (pull-preview).', 'success')
      return
    }

    default:
      useToastStore.getState().showToast(`Unknown agent operation: ${operation}`, 'warning')
  }
}
