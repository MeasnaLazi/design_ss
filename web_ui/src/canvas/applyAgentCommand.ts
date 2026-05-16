import { ActiveSelection, FabricImage, Group, Textbox } from 'fabric'
import type { Canvas, FabricObject } from 'fabric'
import {
  panelPreviewExportRect,
  resolvePanelPreviewSelection,
} from './agentPanelPreviewArgs'
import {
  pushAgentPreviewDataJson,
  pushLiveCanvasPreviewRect,
  resolveAgentPreviewMultiplier,
} from '../lib/agentContextApi'

import { DEFAULT_DEVICE_FRAME_STYLE_ID } from '../constants/deviceFrameStyles'
import {
  getTextStylePreset,
  tryParseTextStylePresetId,
  type TextStylePresetId,
} from '../constants/textStylePresets'
import { addDeviceFrameToCanvas } from './addDeviceFrameToCanvas'
import { addTextboxToCanvas, type AddTextboxToCanvasOptions } from './addTextboxToCanvas'
import { buildAgentPanelPreviewData } from './buildAgentPanelPreviewData'
import { findObjectOnCanvasByAppId } from '../lib/fabricObjectRegistry'
import { getArtboardDimensionsFromConfig } from '../constants/artboardPresets'
import { normalizeBackgroundGradient } from '../lib/backgroundGradient'
import { resolveDeviceFrameStyle } from '../lib/deviceFrameCatalog'
import { screenExportRect } from '../constants/appStoreScreens'
import { useDesignStore } from '../store/useDesignStore'
import { useDeviceFramePackStore } from '../store/useDeviceFramePackStore'
import { useToastStore } from '../store/useToastStore'

const DESIGN_GRID = 16

const TEXT_FONT_SIZE_MIN = 8
const TEXT_FONT_SIZE_MAX = 400
const DEVICE_SIZE_MIN_PX = 80

/** Legacy agent alias: maps to {@link TextStylePresetId} `caption1`. */
const LEGACY_FONT_CAPTION_ALIAS = 'caption'

function snapGrid(n: number): number {
  return Math.round(n / DESIGN_GRID) * DESIGN_GRID
}

function clampTextFontSize(n: number): number {
  return Math.min(TEXT_FONT_SIZE_MAX, Math.max(TEXT_FONT_SIZE_MIN, Math.round(n)))
}

function resolveAddTextPresetId(fontRaw: string): TextStylePresetId | null {
  const trimmed = fontRaw.trim()
  const direct = tryParseTextStylePresetId(trimmed)
  if (direct) return direct
  if (trimmed.toLowerCase() === LEGACY_FONT_CAPTION_ALIAS) return 'caption1'
  return null
}

/** Maps common toolkit strings to Fabric-friendly weight values. */
function normalizeAddTextFontWeight(raw: string): string | number {
  const s = raw.trim().toLowerCase()
  if (s === 'regular' || s === 'normal') return '400'
  if (s === 'bold') return '700'
  const t = raw.trim()
  if (/^\d+(\.\d+)?$/.test(t)) return t
  return raw.trim()
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

function normalizeBackgroundType(rawType: unknown, rawValue: unknown): 'color' | 'gradient' | 'image' | null {
  const t = String(rawType ?? '').trim().toLowerCase()
  if (t === 'color' || t === 'gradient' || t === 'image') return t
  if (t === 'background_color' || t === 'bg_color') return 'color'
  if (t === 'background_gradient' || t === 'bg_gradient') return 'gradient'
  if (t === 'background_image' || t === 'bg_image') return 'image'
  if (t === 'solid' || t === 'set_background_color' || t === 'set_bg') return 'color'
  if (!t) {
    if (typeof rawValue === 'string' && isHexColor(rawValue)) return 'color'
    if (typeof rawValue === 'object' && rawValue !== null && 'stops' in (rawValue as Record<string, unknown>)) {
      return 'gradient'
    }
  }
  return null
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
type LayerKind = 'text' | 'device'

/**
 * Axis-aligned box used to compute align deltas. Device frame groups use the bezel image’s bbox
 * (last child), matching {@link clampDeviceGroupToNearestPanel}, so programmatic align + clamp do
 * not fight each other.
 */
function boundingRectForAlign(layerId: string, target: FabricObject): {
  left: number
  top: number
  width: number
  height: number
} {
  const rec = useDesignStore.getState().objects.find((o) => o.id === layerId)
  if (rec?.kind === 'device' && target instanceof Group) {
    const children = target.getObjects()
    const frame = children[children.length - 1]
    if (frame instanceof FabricImage) {
      return frame.getBoundingRect()
    }
  }
  return target.getBoundingRect()
}

function argsSpecifyPanel(args: Record<string, unknown>): boolean {
  return (
    (args.panel_index !== undefined && args.panel_index !== null && args.panel_index !== '') ||
    (args.panel_number !== undefined && args.panel_number !== null && args.panel_number !== '')
  )
}

/** Resolve optional `panel_index` (0-based) or `panel_number` (1-based) from op args; `null` if neither set. */
function parsePanelIndexFromArgs(args: Record<string, unknown>): number | null {
  const hasPi = args.panel_index !== undefined && args.panel_index !== null && args.panel_index !== ''
  const hasPn = args.panel_number !== undefined && args.panel_number !== null && args.panel_number !== ''
  if (hasPi) {
    const n = Number(args.panel_index)
    if (!Number.isInteger(n)) return null
    return n
  }
  if (hasPn) {
    const n = Number(args.panel_number)
    if (!Number.isInteger(n)) return null
    return n - 1
  }
  return null
}

function clampPanelIndex(panelIndex: number, screens: number): number {
  const s = Math.max(1, screens)
  if (!Number.isInteger(panelIndex) || panelIndex < 0) return 0
  if (panelIndex >= s) return s - 1
  return panelIndex
}

function refRectForPanelIndex(panelIndex: number): { x: number; y: number; width: number; height: number } | null {
  const config = useDesignStore.getState().config
  const screens = Math.max(1, config.screens)
  if (!Number.isInteger(panelIndex) || panelIndex < 0 || panelIndex >= screens) return null
  const { width, height } = getArtboardDimensionsFromConfig(config)
  const r = screenExportRect(panelIndex, config.gap, width, height)
  return { x: r.left, y: r.top, width: r.width, height: r.height }
}

/**
 * Which strip column contains the point `(cx, cy)` (typically bbox center).
 * Returns `null` if outside all panels (e.g. in the gutter).
 */
function panelIndexContainingPoint(cx: number, cy: number): number | null {
  const config = useDesignStore.getState().config
  const screens = Math.max(1, Math.floor(Number(config.screens) || 1))
  const gap = Number(config.gap) || 0
  const { width: panelW, height: panelH } = getArtboardDimensionsFromConfig(config)
  for (let i = 0; i < screens; i += 1) {
    const r = screenExportRect(i, gap, panelW, panelH)
    if (cx >= r.left && cx < r.left + r.width && cy >= r.top && cy < r.top + r.height) {
      return i
    }
  }
  return null
}

function panelIndexForLayerObject(_canvas: Canvas, layerId: string, obj: FabricObject): number | null {
  const b = boundingRectForAlign(layerId, obj)
  const cx = b.left + b.width / 2
  const cy = b.top + b.height / 2
  return panelIndexContainingPoint(cx, cy)
}

/**
 * Resolves and clamps `panel_index` / `panel_number` from args, or `null` if missing / invalid.
 * Callers should toast when `null`.
 */
function requirePanelIndexFromArgs(args: Record<string, unknown>, opName: string): number | null {
  if (!argsSpecifyPanel(args)) {
    useToastStore.getState().showToast(`${opName}: panel_index or panel_number is required (panel-local coordinates).`, 'warning')
    return null
  }
  const parsed = parsePanelIndexFromArgs(args)
  if (parsed === null) {
    useToastStore.getState().showToast(`${opName}: panel_index and panel_number must be integers.`, 'warning')
    return null
  }
  const screens = Math.max(1, useDesignStore.getState().config.screens)
  return clampPanelIndex(parsed, screens)
}

/** Parse `panel_index` / `panel_number` when present; no toast on missing. */
function parseOptionalPanelIndexClamped(args: Record<string, unknown>): number | null {
  if (!argsSpecifyPanel(args)) return null
  const parsed = parsePanelIndexFromArgs(args)
  if (parsed === null) return null
  const screens = Math.max(1, useDesignStore.getState().config.screens)
  return clampPanelIndex(parsed, screens)
}

/** Panel-local top-left `(localX, localY)` to world canvas `left`/`top` for the same origin model (top-left). */
function localToWorldTopLeft(panelIndex: number, localX: number, localY: number): { left: number; top: number } | null {
  const origin = refRectForPanelIndex(panelIndex)
  if (!origin) return null
  return { left: origin.x + snapGrid(localX), top: origin.y + snapGrid(localY) }
}

/** Panel-local center `(lx, ly)` to world canvas `left`/`top` for a Fabric object with `originX/Y: 'center'`. */
function localToWorldCenter(panelIndex: number, localCenterX: number, localCenterY: number): { left: number; top: number } | null {
  const origin = refRectForPanelIndex(panelIndex)
  if (!origin) return null
  return {
    left: origin.x + snapGrid(localCenterX),
    top: origin.y + snapGrid(localCenterY),
  }
}

function getLayerTarget(canvas: Canvas, layerId: string): { obj: FabricObject; kind: LayerKind } | null {
  const rec = useDesignStore.getState().objects.find((o) => o.id === layerId)
  if (!rec || (rec.kind !== 'text' && rec.kind !== 'device')) return null
  const obj = findObjectOnCanvasByAppId(canvas, layerId)
  if (!obj || obj instanceof ActiveSelection) return null
  return { obj, kind: rec.kind }
}

/**
 * Sets a Textbox's wrap width to achieve a target on-canvas width, resets scale to 1, and
 * recomputes height from wrapped lines (no glyph stretch from scaleX/scaleY).
 */
function applyTextboxToDesiredScaledWidth(text: Textbox, desiredScaledWidth: number): boolean {
  const w = snapGrid(desiredScaledWidth)
  if (!Number.isFinite(w) || w <= 0) return false
  const curW = text.getScaledWidth()
  if (curW < 1e-6) return false
  const sx = text.scaleX ?? 1
  const internal = text.width ?? curW / sx
  const minW = text.minWidth ?? 20
  const newInternal = Math.max(minW, internal * (w / curW))
  text.set({ width: newInternal, scaleX: 1, scaleY: 1, dirty: true })
  text.initDimensions()
  text.setCoords()
  return true
}

/** `layer_patch` width/height for text: `width` drives wrap column; `height` is validated but intrinsic. */
function applyTextboxTypographicBoxSize(text: Textbox, width: unknown, height: unknown): boolean {
  const pw = Number(width)
  const ph = Number(height)
  if (!Number.isFinite(pw) || pw <= 0 || !Number.isFinite(ph) || ph <= 0) return false
  return applyTextboxToDesiredScaledWidth(text, pw)
}

/** Uniform scale so aspect ratio is preserved — device frame layers only (`kind: 'device'`). */
type UniformFitMode = 'contain' | 'cover'

function applyUniformScaledSizeForDeviceFrame(
  canvas: Canvas,
  layerId: string,
  target: FabricObject,
  opts: { w?: number; h?: number; fit: UniformFitMode },
): boolean {
  const rec = useDesignStore.getState().objects.find((o) => o.id === layerId)
  if (rec?.kind !== 'device') return false
  const onCanvas = findObjectOnCanvasByAppId(canvas, layerId)
  if (onCanvas !== target) return false
  const cw = target.getScaledWidth()
  const ch = target.getScaledHeight()
  if (cw < 1e-6 || ch < 1e-6) return false
  const hasW = opts.w != null && Number.isFinite(opts.w) && opts.w > 0
  const hasH = opts.h != null && Number.isFinite(opts.h) && opts.h > 0
  if (!hasW && !hasH) return false
  const tw = hasW ? snapGrid(opts.w!) : null
  const th = hasH ? snapGrid(opts.h!) : null
  let factor: number
  if (hasW && hasH && tw != null && th != null) {
    const scaleW = tw / cw
    const scaleH = th / ch
    factor = opts.fit === 'cover' ? Math.max(scaleW, scaleH) : Math.min(scaleW, scaleH)
  } else if (hasW && tw != null) {
    factor = tw / cw
  } else if (hasH && th != null) {
    factor = th / ch
  } else {
    return false
  }
  if (!Number.isFinite(factor) || factor <= 0) return false
  target.set({
    scaleX: (target.scaleX ?? 1) * factor,
    scaleY: (target.scaleY ?? 1) * factor,
  })
  return true
}

function applyLayerPatch(
  canvas: Canvas,
  layerId: string,
  patch: Record<string, unknown>,
  panelIndexForPosition: number | null,
): string | null {
  const target = getLayerTarget(canvas, layerId)
  if (!target) return `layer "${layerId}" not found.`
  const { obj, kind } = target
  const changed: Record<string, unknown> = {}
  const allowedCommon = new Set(['x', 'y', 'width', 'height', 'angle', 'opacity', 'scale_x', 'scale_y'])
  const allowedText = new Set([
    'content',
    'font_size',
    'font_weight',
    'font_style',
    'color',
    'text_align',
    'line_height',
    'letter_spacing',
  ])

  for (const key of Object.keys(patch)) {
    const deviceOnly = key === 'fit' && kind === 'device'
    if (!allowedCommon.has(key) && !(kind === 'text' && allowedText.has(key)) && !deviceOnly) {
      return `layer_patch: key "${key}" is not allowed for ${kind} layers.`
    }
  }
  if ('fit' in patch && kind !== 'device') {
    return 'layer_patch: fit is only valid for device frame layers.'
  }

  if ('x' in patch || 'y' in patch) {
    if (panelIndexForPosition === null) {
      return 'layer_patch: panel_index or panel_number is required when setting x/y (panel-local coordinates).'
    }
    const origin = refRectForPanelIndex(panelIndexForPosition)
    if (!origin) return 'layer_patch: invalid panel_index for current layout.'
    let localX: number
    let localY: number
    if (kind === 'device') {
      const curLx = (obj.left ?? 0) - origin.x
      const curLy = (obj.top ?? 0) - origin.y
      localX = 'x' in patch ? Number(patch.x) : curLx
      localY = 'y' in patch ? Number(patch.y) : curLy
    } else {
      const curLx = (obj.left ?? 0) - origin.x
      const curLy = (obj.top ?? 0) - origin.y
      localX = 'x' in patch ? Number(patch.x) : curLx
      localY = 'y' in patch ? Number(patch.y) : curLy
    }
    if (!Number.isFinite(localX) || !Number.isFinite(localY)) {
      return 'layer_patch: x and y must be numeric when setting position.'
    }
    const world =
      kind === 'device'
        ? localToWorldCenter(panelIndexForPosition, localX, localY)
        : localToWorldTopLeft(panelIndexForPosition, localX, localY)
    if (!world) return 'layer_patch: could not resolve panel position.'
    changed.left = world.left
    changed.top = world.top
  }

  if ('width' in patch || 'height' in patch) {
    const pw = 'width' in patch ? Number(patch.width) : Number.NaN
    const ph = 'height' in patch ? Number(patch.height) : Number.NaN
    const hasW = Number.isFinite(pw) && pw > 0
    const hasH = Number.isFinite(ph) && ph > 0
    if (kind === 'device') {
      if (!hasW && !hasH) {
        return 'layer_patch: device needs at least one positive width or height.'
      }
      const fitRaw = String(patch.fit ?? 'contain').toLowerCase()
      const fit: UniformFitMode = fitRaw === 'cover' ? 'cover' : 'contain'
      if (
        !applyUniformScaledSizeForDeviceFrame(canvas, layerId, obj, {
          w: hasW ? pw : undefined,
          h: hasH ? ph : undefined,
          fit,
        })
      ) {
        return 'layer_patch: device frame width/height could not be applied.'
      }
    } else {
      if (!hasW || !hasH) {
        return 'layer_patch: width and height must be provided together.'
      }
      if (!(obj instanceof Textbox)) {
        return 'layer_patch: text resize requires a Textbox instance.'
      }
      if (!applyTextboxTypographicBoxSize(obj, patch.width, patch.height)) {
        return 'layer_patch: width/height must be positive numeric values.'
      }
    }
  }

  if ('scale_x' in patch) {
    const sx = Number(patch.scale_x)
    if (!Number.isFinite(sx) || sx <= 0) return 'layer_patch: scale_x must be > 0.'
    changed.scaleX = sx
  }
  if ('scale_y' in patch) {
    const sy = Number(patch.scale_y)
    if (!Number.isFinite(sy) || sy <= 0) return 'layer_patch: scale_y must be > 0.'
    changed.scaleY = sy
  }
  if ('angle' in patch) {
    const angle = Number(patch.angle)
    if (!Number.isFinite(angle)) return 'layer_patch: angle must be numeric.'
    changed.angle = angle
  }
  if ('opacity' in patch) {
    const opacity = Number(patch.opacity)
    if (!Number.isFinite(opacity) || opacity < 0 || opacity > 1) {
      return 'layer_patch: opacity must be between 0 and 1.'
    }
    changed.opacity = opacity
  }

  if (kind === 'text') {
    const text = obj instanceof Textbox ? obj : null
    if (!text) return `layer_patch: text layer "${layerId}" object mismatch.`
    if ('content' in patch) changed.text = String(patch.content ?? '')
    if ('font_size' in patch) {
      const size = Number(patch.font_size)
      if (!Number.isFinite(size)) return 'layer_patch: font_size must be numeric.'
      changed.fontSize = clampTextFontSize(size)
    }
    if ('font_weight' in patch) changed.fontWeight = String(patch.font_weight ?? 'normal')
    if ('font_style' in patch) {
      const style = String(patch.font_style ?? 'normal')
      if (!['normal', 'italic'].includes(style)) return 'layer_patch: font_style must be normal or italic.'
      changed.fontStyle = style
    }
    if ('color' in patch) {
      const color = String(patch.color ?? '').trim()
      if (!isHexColor(color)) return 'layer_patch: color must be hex (#rrggbb).'
      changed.fill = color
    }
    if ('text_align' in patch) {
      const align = String(patch.text_align ?? 'left')
      if (!['left', 'center', 'right', 'justify'].includes(align)) {
        return 'layer_patch: text_align must be left|center|right|justify.'
      }
      changed.textAlign = align
    }
    if ('line_height' in patch) {
      const lineHeight = Number(patch.line_height)
      if (!Number.isFinite(lineHeight) || lineHeight <= 0) return 'layer_patch: line_height must be > 0.'
      changed.lineHeight = lineHeight
    }
    if ('letter_spacing' in patch) {
      const spacing = Number(patch.letter_spacing)
      if (!Number.isFinite(spacing)) return 'layer_patch: letter_spacing must be numeric.'
      changed.charSpacing = spacing
    }
    patchTextbox(canvas, text, changed)
    return null
  }

  obj.set(changed)
  obj.setCoords()
  fireObjectModified(canvas, obj)
  return null
}

function sortObjectsByAxis(objs: FabricObject[], axis: 'x' | 'y'): FabricObject[] {
  return [...objs].sort((a, b) => ((axis === 'x' ? a.left : a.top) ?? 0) - ((axis === 'x' ? b.left : b.top) ?? 0))
}

function resolveLayersForIds(canvas: Canvas, layerIds: string[]): FabricObject[] | null {
  const targets: FabricObject[] = []
  for (const id of layerIds) {
    const obj = findObjectOnCanvasByAppId(canvas, id)
    if (!obj || obj instanceof ActiveSelection) return null
    targets.push(obj)
  }
  return targets
}

/** All layers must lie in one strip column; optional declared panel must match inferred. */
function validateSinglePanelForLayerIds(
  canvas: Canvas,
  layerIds: string[],
  targets: FabricObject[],
  opName: string,
  optionalDeclaredPanel: number | null,
): boolean {
  const panels: (number | null)[] = []
  for (let i = 0; i < layerIds.length; i += 1) {
    panels.push(panelIndexForLayerObject(canvas, layerIds[i]!, targets[i]!))
  }
  if (panels.some((p) => p === null)) {
    useToastStore
      .getState()
      .showToast(`${opName}: could not infer panel for one or more layers (stay inside one column).`, 'warning')
    return false
  }
  const first = panels[0]!
  if (!panels.every((p) => p === first)) {
    useToastStore.getState().showToast(`${opName}: all layers must belong to the same panel column.`, 'warning')
    return false
  }
  if (optionalDeclaredPanel !== null && optionalDeclaredPanel !== first) {
    useToastStore
      .getState()
      .showToast(`${opName}: layers are not in the declared panel_index column.`, 'warning')
    return false
  }
  return true
}

async function replaceDeviceFrameStyle(canvas: Canvas, layerId: string, styleId: string, packId?: string): Promise<string | null> {
  const rec = useDesignStore.getState().objects.find((o) => o.id === layerId)
  if (rec?.kind !== 'device') return `device_set_frame_style: layer "${layerId}" is not a device.`
  const target = getDeviceGroupForLayer(canvas, layerId)
  if (!target) return `device_set_frame_style: device layer "${layerId}" not found.`

  const state = useDeviceFramePackStore.getState()
  const resolvedPack = packId ?? rec.deviceFramePackId ?? state.selectedPackId ?? undefined
  const style = resolveDeviceFrameStyle(resolvedPack, styleId, state.devices, state.selectedPackId ?? undefined)
  if (!style.src) return 'device_set_frame_style: could not resolve frame style source.'

  const frame = await FabricImage.fromURL(
    style.src,
    { crossOrigin: 'anonymous' },
    {
      originX: 'left',
      originY: 'top',
      selectable: false,
      evented: false,
    },
  )
  if (!(frame instanceof FabricImage)) return 'device_set_frame_style: failed to load frame image.'

  const objects = target.getObjects()
  if (objects.length === 0) return 'device_set_frame_style: device group has no frame.'
  const oldFrame = objects[objects.length - 1]
  const oldW = oldFrame.getScaledWidth()
  const nextW = frame.getScaledWidth()
  const factor = oldW > 1e-6 && nextW > 1e-6 ? oldW / nextW : 1
  frame.set({
    left: oldFrame.left,
    top: oldFrame.top,
    scaleX: (frame.scaleX ?? 1) * factor,
    scaleY: (frame.scaleY ?? 1) * factor,
    objectCaching: false,
    dirty: true,
  })
  target.remove(oldFrame)
  target.add(frame)
  target.triggerLayout({})
  target.setCoords()
  useDesignStore.getState().upsertObject({
    ...rec,
    deviceFrameStyleId: style.id,
    deviceFramePackId: resolvedPack,
  })
  fireObjectModified(canvas, target)
  return null
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
      const panelIndex = requirePanelIndexFromArgs(args, 'add_device_frame')
      if (panelIndex === null) return
      await addDeviceFrameToCanvas(canvas, frame, {
        ...(packId ? { packId } : {}),
        panelIndex,
      })
      return
    }

    case 'set_background': {
      const payload =
        typeof args.background === 'object' && args.background !== null && !Array.isArray(args.background)
          ? (args.background as Record<string, unknown>)
          : args
      const rawType = payload.type ?? payload.mode ?? payload.background_type
      const rawValue =
        payload.value ??
        payload.color ??
        payload.gradient ??
        payload.image ??
        payload.image_url ??
        payload.background
      const type = normalizeBackgroundType(rawType, rawValue)
      const { setConfig } = useDesignStore.getState()
      if (type === 'color') {
        const value = String(rawValue ?? '').trim()
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
        const g = normalizeBackgroundGradient(rawValue)
        setConfig({
          backgroundMode: 'gradient',
          backgroundGradient: g,
          backgroundImageUrl: null,
        })
        canvas.requestRenderAll()
        return
      }
      if (type === 'image') {
        setConfig({ backgroundImageUrl: String(rawValue ?? '') })
        canvas.requestRenderAll()
        return
      }
      console.warn('[applyAgentCommand] set_background rejected payload', { args })
      useToastStore.getState().showToast('set_background type must be color | gradient | image.', 'warning')
      return
    }

    case 'move_layer': {
      const layerId = String(args.layer_id ?? '')
      if (!layerId) {
        useToastStore.getState().showToast('move_layer: missing layer_id.', 'warning')
        return
      }
      const target = getLayerTarget(canvas, layerId)
      if (!target) {
        useToastStore.getState().showToast(`move_layer: layer "${layerId}" not found.`, 'warning')
        return
      }

      const x = Number(args.x)
      const y = Number(args.y)
      if (Number.isFinite(x) && Number.isFinite(y)) {
        const panelIndex = requirePanelIndexFromArgs(args, 'move_layer')
        if (panelIndex === null) return
        const world =
          target.kind === 'device'
            ? localToWorldCenter(panelIndex, x, y)
            : localToWorldTopLeft(panelIndex, x, y)
        if (!world) {
          useToastStore.getState().showToast('move_layer: invalid panel_index for current layout.', 'warning')
          return
        }
        target.obj.set(world)
        target.obj.setCoords()
        fireObjectModified(canvas, target.obj)
        return
      }

      const dx = Number(args.dx)
      const dy = Number(args.dy)
      if (Number.isFinite(dx) && Number.isFinite(dy)) {
        const inferred = panelIndexForLayerObject(canvas, layerId, target.obj)
        if (inferred === null) {
          useToastStore
            .getState()
            .showToast('move_layer: could not infer panel from layer position (stay inside one column).', 'warning')
          return
        }
        const declared = parseOptionalPanelIndexClamped(args)
        if (declared !== null && declared !== inferred) {
          useToastStore
            .getState()
            .showToast('move_layer: layer is not in the declared panel_index column.', 'warning')
          return
        }
        target.obj.set({
          left: snapGrid((target.obj.left ?? 0) + dx),
          top: snapGrid((target.obj.top ?? 0) + dy),
        })
        target.obj.setCoords()
        fireObjectModified(canvas, target.obj)
        return
      }

      useToastStore
        .getState()
        .showToast('move_layer: provide panel-local x/y with panel_index, or dx/dy for delta move.', 'warning')
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

      const refKey = reference.trim().toLowerCase()
      let refRect: { x: number; y: number; width: number; height: number }
      if (refKey === 'canvas') {
        useToastStore
          .getState()
          .showToast(
            'align: reference "canvas" is not allowed for layer placement; use reference "panel" with panel_index (panel-local).',
            'warning',
          )
        return
      } else if (refKey === 'panel') {
        if (!argsSpecifyPanel(args)) {
          useToastStore
            .getState()
            .showToast(
              'align: reference "panel" requires panel_index (0-based) or panel_number (1-based).',
              'warning',
            )
          return
        }
        const parsedPanel = parsePanelIndexFromArgs(args)
        if (parsedPanel === null) {
          useToastStore
            .getState()
            .showToast('align: panel_index and panel_number must be integers.', 'warning')
          return
        }
        const screens = Math.max(1, useDesignStore.getState().config.screens)
        const p = clampPanelIndex(parsedPanel, screens)
        const rr = refRectForPanelIndex(p)
        if (!rr) {
          useToastStore.getState().showToast('align: invalid panel for current layout.', 'warning')
          return
        }
        refRect = rr
      } else {
        const refObj = findObjectOnCanvasByAppId(canvas, reference)
        if (!refObj) {
          useToastStore.getState().showToast(`align: reference "${reference}" not found.`, 'warning')
          return
        }
        const pTarget = panelIndexForLayerObject(canvas, layerId, target)
        const pRef = panelIndexForLayerObject(canvas, reference, refObj)
        if (pTarget === null || pRef === null || pTarget !== pRef) {
          useToastStore
            .getState()
            .showToast('align: target and reference layers must be in the same panel column.', 'warning')
          return
        }
        const rr = boundingRectForAlign(reference, refObj)
        refRect = { x: rr.left, y: rr.top, width: rr.width, height: rr.height }
      }

      const b = boundingRectForAlign(layerId, target)
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
      const p = requirePanelIndexFromArgs(args, 'add_text')
      if (p === null) return
      const pr = refRectForPanelIndex(p)
      if (!pr) {
        useToastStore.getState().showToast('add_text: invalid panel for current layout.', 'warning')
        return
      }
      const lx = Number(args.x)
      const ly = Number(args.y)
      const world = localToWorldTopLeft(p, lx, ly)
      if (!world) {
        useToastStore.getState().showToast('add_text: could not place text in panel.', 'warning')
        return
      }
      const x = world.left
      const y = world.top
      const fontRaw = String(args.font ?? 'body')
      const presetId = resolveAddTextPresetId(fontRaw)
      if (!presetId) {
        useToastStore
          .getState()
          .showToast(
            `add_text: invalid font preset "${fontRaw.trim()}". Use a TextStylePresetId from textStylePresets (e.g. largeTitle, title3, body) or legacy alias "caption".`,
            'warning',
          )
        return
      }
      const presetDef = getTextStylePreset(presetId)
      const color = String(args.color ?? '#ffffff')
      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        useToastStore.getState().showToast('add_text: invalid x or y.', 'warning')
        return
      }
      const hasExplicitSize = args.size !== undefined && args.size !== null && args.size !== ''
      const sizeNum = hasExplicitSize ? Number(args.size) : Number.NaN
      if (hasExplicitSize && !Number.isFinite(sizeNum)) {
        useToastStore.getState().showToast('add_text: size must be numeric when set.', 'warning')
        return
      }
      if (!isHexColor(color)) {
        useToastStore.getState().showToast('add_text: color must be hex.', 'warning')
        return
      }

      const weightRaw = args.weight
      const hasExplicitWeight =
        weightRaw !== undefined && weightRaw !== null && String(weightRaw).trim() !== ''

      const alignRaw = args.align
      const hasExplicitAlign =
        alignRaw !== undefined && alignRaw !== null && String(alignRaw).trim() !== ''

      let textAlign: 'left' | 'center' | 'right'
      if (hasExplicitAlign) {
        const a = String(alignRaw).trim().toLowerCase()
        if (a !== 'left' && a !== 'center' && a !== 'right') {
          useToastStore.getState().showToast('add_text: align must be left, center, or right.', 'warning')
          return
        }
        textAlign = a
      } else {
        textAlign = presetDef.textAlign
      }

      const opts: AddTextboxToCanvasOptions = {
        preset: presetId,
        left: snapGrid(x),
        top: snapGrid(y),
        text: content.trim() !== '' ? content : presetDef.initialText,
        fill: color,
        textAlign,
      }
      if (hasExplicitSize) opts.fontSize = clampTextFontSize(sizeNum)
      if (hasExplicitWeight) opts.fontWeight = normalizeAddTextFontWeight(String(weightRaw))

      addTextboxToCanvas(canvas, opts)
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

    case 'text_set_content': {
      const layerId = String(args.layer_id ?? '')
      const content = String(args.content ?? '')
      if (!layerId) {
        useToastStore.getState().showToast('text_set_content: missing layer_id.', 'warning')
        return
      }
      const text = getTextboxForLayer(canvas, layerId)
      if (!text) {
        useToastStore.getState().showToast(`text_set_content: text layer "${layerId}" not found.`, 'warning')
        return
      }
      patchTextbox(canvas, text, { text: content })
      return
    }

    case 'text_set_line_height': {
      const layerId = String(args.layer_id ?? '')
      const lineHeight = Number(args.line_height)
      if (!layerId || !Number.isFinite(lineHeight) || lineHeight <= 0) {
        useToastStore.getState().showToast('text_set_line_height: need layer_id and line_height > 0.', 'warning')
        return
      }
      const text = getTextboxForLayer(canvas, layerId)
      if (!text) {
        useToastStore.getState().showToast(`text_set_line_height: text layer "${layerId}" not found.`, 'warning')
        return
      }
      patchTextbox(canvas, text, { lineHeight })
      return
    }

    case 'text_set_letter_spacing': {
      const layerId = String(args.layer_id ?? '')
      const spacing = Number(args.letter_spacing)
      if (!layerId || !Number.isFinite(spacing)) {
        useToastStore.getState().showToast(
          'text_set_letter_spacing: need layer_id and numeric letter_spacing.',
          'warning',
        )
        return
      }
      const text = getTextboxForLayer(canvas, layerId)
      if (!text) {
        useToastStore
          .getState()
          .showToast(`text_set_letter_spacing: text layer "${layerId}" not found.`, 'warning')
        return
      }
      patchTextbox(canvas, text, { charSpacing: spacing })
      return
    }

    case 'text_auto_fit': {
      const layerId = String(args.layer_id ?? '')
      const minSizeRaw = args.min_size
      const maxSizeRaw = args.max_size
      if (!layerId) {
        useToastStore.getState().showToast('text_auto_fit: missing layer_id.', 'warning')
        return
      }
      const text = getTextboxForLayer(canvas, layerId)
      if (!text) {
        useToastStore.getState().showToast(`text_auto_fit: text layer "${layerId}" not found.`, 'warning')
        return
      }
      const minSize = Number.isFinite(Number(minSizeRaw))
        ? clampTextFontSize(Number(minSizeRaw))
        : TEXT_FONT_SIZE_MIN
      const maxSize = Number.isFinite(Number(maxSizeRaw))
        ? clampTextFontSize(Number(maxSizeRaw))
        : TEXT_FONT_SIZE_MAX
      const ceiling = Math.max(minSize, maxSize)
      const floor = Math.min(minSize, maxSize)
      const cur = clampTextFontSize(Number(text.fontSize ?? ceiling))
      const width = Math.max(1, Number(text.width ?? 1))
      let best = Math.min(cur, ceiling)
      const content = String(text.text ?? '')
      for (let size = best; size >= floor; size -= 1) {
        if (estimateTextWidth(content, size) <= width) {
          best = size
          break
        }
        best = size
      }
      patchTextbox(canvas, text, { fontSize: best })
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
      const panelIndex = requirePanelIndexFromArgs(args, 'device_set_position')
      if (panelIndex === null) return
      const world = localToWorldCenter(panelIndex, x, y)
      if (!world) {
        useToastStore.getState().showToast('device_set_position: invalid panel_index for current layout.', 'warning')
        return
      }
      target.set(world)
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
      const inferred = panelIndexForLayerObject(canvas, layerId, target)
      if (inferred === null) {
        useToastStore
          .getState()
          .showToast('device_move_delta: could not infer panel from device position.', 'warning')
        return
      }
      const declared = parseOptionalPanelIndexClamped(args)
      if (declared !== null && declared !== inferred) {
        useToastStore
          .getState()
          .showToast('device_move_delta: device is not in the declared panel_index column.', 'warning')
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

    case 'device_set_size': {
      const layerId = String(args.layer_id ?? '')
      const width = Number(args.width)
      const height = Number(args.height)
      const hasW = Number.isFinite(width) && width > 0
      const hasH = Number.isFinite(height) && height > 0
      const fitRaw = String(args.fit ?? 'contain').toLowerCase()
      const fit: UniformFitMode = fitRaw === 'cover' ? 'cover' : 'contain'
      if (!layerId || (!hasW && !hasH)) {
        useToastStore
          .getState()
          .showToast(
            'device_set_size: need layer_id and at least one positive width or height (aspect ratio preserved).',
            'warning',
          )
        return
      }
      const target = getDeviceGroupForLayer(canvas, layerId)
      if (!target) {
        useToastStore.getState().showToast(`device_set_size: device layer "${layerId}" not found.`, 'warning')
        return
      }
      if (
        !applyUniformScaledSizeForDeviceFrame(canvas, layerId, target, {
          w: hasW ? width : undefined,
          h: hasH ? height : undefined,
          fit,
        })
      ) {
        useToastStore.getState().showToast('device_set_size: could not apply size (device frame only).', 'warning')
        return
      }
      target.setCoords()
      fireObjectModified(canvas, target)
      return
    }

    case 'device_set_frame_style': {
      const layerId = String(args.layer_id ?? '')
      const style = String(args.style ?? args.frame ?? '')
      const packIdRaw = args.pack_id
      const packId = packIdRaw == null ? undefined : String(packIdRaw)
      if (!layerId || !style) {
        useToastStore
          .getState()
          .showToast('device_set_frame_style: need layer_id and style (or frame).', 'warning')
        return
      }
      const err = await replaceDeviceFrameStyle(canvas, layerId, style, packId)
      if (err) useToastStore.getState().showToast(err, 'warning')
      return
    }

    case 'remove_layer': {
      const layerId = String(args.layer_id ?? '')
      if (!layerId) {
        useToastStore.getState().showToast('remove_layer: missing layer_id.', 'warning')
        return
      }
      const target = findObjectOnCanvasByAppId(canvas, layerId)
      if (!target) {
        useToastStore.getState().showToast(`remove_layer: layer "${layerId}" not found.`, 'warning')
        return
      }
      canvas.remove(target)
      useDesignStore.getState().removeObject(layerId)
      canvas.discardActiveObject()
      canvas.requestRenderAll()
      return
    }

    case 'set_z_index': {
      const layerId = String(args.layer_id ?? '')
      const zIndex = Number(args.z_index)
      if (!layerId || !Number.isInteger(zIndex)) {
        useToastStore.getState().showToast('set_z_index: need layer_id and integer z_index.', 'warning')
        return
      }
      const target = findObjectOnCanvasByAppId(canvas, layerId)
      if (!target) {
        useToastStore.getState().showToast(`set_z_index: layer "${layerId}" not found.`, 'warning')
        return
      }
      const objs = canvas.getObjects()
      const maxIndex = Math.max(0, objs.length - 1)
      const clamped = Math.min(maxIndex, Math.max(0, zIndex))
      // Fabric v6+ removed object.moveTo; stack order is controlled on the canvas.
      if (typeof canvas.moveObjectTo !== 'function') {
        useToastStore.getState().showToast('set_z_index: canvas does not support moveObjectTo.', 'warning')
        return
      }
      canvas.moveObjectTo(target, clamped)
      target.setCoords()
      fireObjectModified(canvas, target)
      return
    }

    case 'layer_patch': {
      const layerId = String(args.layer_id ?? '')
      const patch = args.patch
      if (!layerId || typeof patch !== 'object' || patch == null || Array.isArray(patch)) {
        useToastStore.getState().showToast('layer_patch: need layer_id and object patch.', 'warning')
        return
      }
      const p = patch as Record<string, unknown>
      const needsPanel = 'x' in p || 'y' in p
      const panelIdx = needsPanel ? requirePanelIndexFromArgs(args, 'layer_patch') : null
      if (needsPanel && panelIdx === null) return
      const err = applyLayerPatch(canvas, layerId, p, panelIdx)
      if (err) useToastStore.getState().showToast(err, 'warning')
      return
    }

    case 'layers_patch_bulk': {
      const entries = Array.isArray(args.layers) ? args.layers : null
      if (!entries || entries.length === 0) {
        useToastStore.getState().showToast('layers_patch_bulk: layers must be a non-empty array.', 'warning')
        return
      }
      const bulkDefaultPanel = parseOptionalPanelIndexClamped(args)
      for (const entry of entries) {
        if (typeof entry !== 'object' || entry == null || Array.isArray(entry)) {
          useToastStore.getState().showToast('layers_patch_bulk: each entry must be an object.', 'warning')
          return
        }
        const row = entry as Record<string, unknown>
        const layerId = String(row.layer_id ?? '')
        const patch = row.patch
        if (!layerId || typeof patch !== 'object' || patch == null || Array.isArray(patch)) {
          useToastStore.getState().showToast(
            'layers_patch_bulk: each entry needs layer_id and object patch.',
            'warning',
          )
          return
        }
        const p = patch as Record<string, unknown>
        const needsPanel = 'x' in p || 'y' in p
        let panelIdx: number | null = null
        if (needsPanel) {
          panelIdx = parseOptionalPanelIndexClamped(row) ?? bulkDefaultPanel
          if (panelIdx === null) {
            useToastStore
              .getState()
              .showToast(
                'layers_patch_bulk: panel_index or panel_number required on each entry (or top-level) when patch sets x/y.',
                'warning',
              )
            return
          }
        }
        const err = applyLayerPatch(canvas, layerId, p, panelIdx)
        if (err) {
          useToastStore.getState().showToast(`layers_patch_bulk: ${err}`, 'warning')
          return
        }
      }
      return
    }

    case 'batch': {
      const ops = Array.isArray(args.operations) ? args.operations : null
      if (!ops) {
        useToastStore.getState().showToast('batch: operations must be an array.', 'warning')
        return
      }
      for (const op of ops) {
        if (typeof op !== 'object' || op == null || Array.isArray(op)) {
          useToastStore.getState().showToast('batch: each operation must be an object.', 'warning')
          return
        }
        const row = op as Record<string, unknown>
        const childOp = String(row.operation ?? '')
        const childArgsRaw = row.args ?? {}
        if (!childOp || typeof childArgsRaw !== 'object' || childArgsRaw == null || Array.isArray(childArgsRaw)) {
          useToastStore
            .getState()
            .showToast('batch: each item requires operation and object args.', 'warning')
          return
        }
        if (childOp === 'batch') {
          useToastStore.getState().showToast('batch: nested batch is not supported.', 'warning')
          return
        }
        await applyAgentCommand(canvas, childOp, childArgsRaw as Record<string, unknown>)
      }
      return
    }

    case 'set_equal_spacing': {
      const layerIds = Array.isArray(args.layer_ids) ? args.layer_ids.map((id) => String(id)) : null
      const axis = String(args.axis ?? 'x')
      const gap = Number(args.gap)
      if (!layerIds || layerIds.length < 2 || !['x', 'y'].includes(axis) || !Number.isFinite(gap)) {
        useToastStore
          .getState()
          .showToast('set_equal_spacing: need 2+ layer_ids, axis x|y, and numeric gap.', 'warning')
        return
      }
      const targets = resolveLayersForIds(canvas, layerIds)
      if (!targets) {
        useToastStore.getState().showToast('set_equal_spacing: one or more layers not found.', 'warning')
        return
      }
      if (!validateSinglePanelForLayerIds(canvas, layerIds, targets, 'set_equal_spacing', parseOptionalPanelIndexClamped(args))) {
        return
      }
      const sorted = sortObjectsByAxis(targets, axis as 'x' | 'y')
      let cursor = axis === 'x' ? (sorted[0].left ?? 0) : (sorted[0].top ?? 0)
      for (let i = 1; i < sorted.length; i += 1) {
        const prev = sorted[i - 1]
        const prevSize = axis === 'x' ? prev.getScaledWidth() : prev.getScaledHeight()
        cursor = cursor + prevSize + gap
        const pos = snapGrid(cursor)
        if (axis === 'x') {
          sorted[i].set({ left: pos })
        } else {
          sorted[i].set({ top: pos })
        }
        sorted[i].setCoords()
        canvas.fire('object:modified', { target: sorted[i] })
      }
      canvas.requestRenderAll()
      return
    }

    case 'match_size': {
      const sourceId = String(args.source_layer_id ?? '')
      const targetIds = Array.isArray(args.target_layer_ids)
        ? args.target_layer_ids.map((id) => String(id))
        : []
      const mode = String(args.mode ?? 'both')
      if (!sourceId || targetIds.length === 0 || !['width', 'height', 'both'].includes(mode)) {
        useToastStore.getState().showToast(
          'match_size: need source_layer_id, target_layer_ids[], and mode width|height|both.',
          'warning',
        )
        return
      }
      const source = findObjectOnCanvasByAppId(canvas, sourceId)
      if (!source || source instanceof ActiveSelection) {
        useToastStore.getState().showToast(`match_size: source layer "${sourceId}" not found.`, 'warning')
        return
      }
      const sw = source.getScaledWidth()
      const sh = source.getScaledHeight()
      for (const targetId of targetIds) {
        const target = findObjectOnCanvasByAppId(canvas, targetId)
        if (!target || target instanceof ActiveSelection) {
          useToastStore.getState().showToast(`match_size: target layer "${targetId}" not found.`, 'warning')
          return
        }
        if (target instanceof Textbox) {
          if (mode === 'width' || mode === 'both') {
            applyTextboxToDesiredScaledWidth(target, sw)
          }
          // Textbox height is intrinsic to wrapped text; do not scaleY to match source height.
          target.setCoords()
          canvas.fire('object:modified', { target })
          continue
        }
        const tw = target.getScaledWidth()
        const th = target.getScaledHeight()
        if (tw < 1e-6 || th < 1e-6) continue
        const patch: Record<string, number> = {}
        if (mode === 'width' || mode === 'both') patch.scaleX = (target.scaleX ?? 1) * (sw / tw)
        if (mode === 'height' || mode === 'both') patch.scaleY = (target.scaleY ?? 1) * (sh / th)
        target.set(patch)
        target.setCoords()
        canvas.fire('object:modified', { target })
      }
      canvas.requestRenderAll()
      return
    }

    case 'render_panel_preview': {
      const selection = resolvePanelPreviewSelection(args, 'render_panel_preview')
      if (!selection) return
      const rect = panelPreviewExportRect(selection.panelIndexes)
      const mult = resolveAgentPreviewMultiplier(args.preview_multiplier)
      await pushLiveCanvasPreviewRect(canvas, rect, mult)
      return
    }

    case 'capture_panel_preview_data': {
      const selection = resolvePanelPreviewSelection(args, 'capture_panel_preview_data')
      if (!selection) return
      const payload = buildAgentPanelPreviewData(canvas, selection.panelIndexes)
      await pushAgentPreviewDataJson(payload)
      return
    }

    default:
      useToastStore.getState().showToast(`Unknown agent operation: ${operation}`, 'warning')
  }
}
