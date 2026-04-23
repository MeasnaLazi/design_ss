/**
 * Server-only: map `datasource/display_*.json` ↔ designer session used by
 * screenshot-designer-server (Sharp render + agent execute ops).
 */
import { randomUUID } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

import { getDisplayFileSlug, normalizeArtboardPresetId } from './src/constants/artboardPresets'

export type DesignerBackground =
  | { type: 'color'; value: string }
  | {
      type: 'gradient'
      value: { angleDeg: number; stops: { offset: number; color: string }[] }
    }
  | { type: 'image'; value: string }

export type DesignerCornerData = {
  TL: [number, number]
  TR: [number, number]
  BR: [number, number]
  BL: [number, number]
}

export type DesignerRadiiData = { tl: number; tr: number; br: number; bl: number }

export type DesignerDeviceLayer = {
  id: string
  kind: 'device_frame'
  framePath: string
  frameName: string
  packId: string
  x: number
  y: number
  width: number
  height: number
  scale: number
  viewWidth: number
  viewHeight: number
  corners: DesignerCornerData
  clipRadii: DesignerRadiiData | null
  homography: boolean
  zIndex: number
}

export type DesignerTextLayer = {
  id: string
  kind: 'text'
  content: string
  x: number
  y: number
  width: number
  height: number
  font: string
  size: number
  color: string
  align: 'left' | 'center' | 'right'
  weight: string
  zIndex: number
}

export type DesignerLayer = DesignerDeviceLayer | DesignerTextLayer

export type DesignerSessionFile = {
  width: number
  height: number
  background: DesignerBackground
  layers: DesignerLayer[]
}

const PANEL_GAP = 40

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x)
}

function findDeviceFrameSrcDeep(node: unknown): string | null {
  if (!isRecord(node)) return null
  if (node.type === 'Image' && typeof node.src === 'string' && node.src.includes('/device-frames/')) {
    return normalizeDeviceFrameSrc(node.src)
  }
  if (Array.isArray(node.objects)) {
    for (const c of node.objects) {
      const found = findDeviceFrameSrcDeep(c)
      if (found) return found
    }
  }
  return null
}

/** Strip origin host so paths match server `resolveImagePath` (`/device-frames/...`). */
export function normalizeDeviceFrameSrc(raw: string): string {
  const s = raw.trim()
  if (s.startsWith('/device-frames/')) return s
  try {
    const u = new URL(s)
    const p = u.pathname
    if (p.startsWith('/device-frames/')) return p
  } catch {
    /* relative */
  }
  const idx = s.indexOf('/device-frames/')
  if (idx >= 0) return s.slice(idx)
  return s
}

function designConfigFromSessionBackground(
  bg: DesignerBackground,
): Record<string, unknown> {
  const defaultGradientStops = [
    { offset: 0, color: '#0f172a' },
    { offset: 1, color: '#1e293b' },
  ]
  if (bg.type === 'color') {
    return {
      background: bg.value,
      backgroundMode: 'solid',
      backgroundGradient: { kind: 'linear', angleDeg: 135, stops: defaultGradientStops },
      backgroundImageUrl: null,
    }
  }
  if (bg.type === 'gradient') {
    return {
      background: bg.value.stops[0]?.color ?? '#000000',
      backgroundMode: 'gradient',
      backgroundGradient: { kind: 'linear', angleDeg: bg.value.angleDeg, stops: bg.value.stops },
      backgroundImageUrl: null,
    }
  }
  return {
    background: '#000000',
    backgroundMode: 'solid',
    backgroundGradient: { kind: 'linear', angleDeg: 135, stops: defaultGradientStops },
    backgroundImageUrl: bg.value,
  }
}

const COMMON = {
  version: '7.2.0',
  stroke: null,
  strokeWidth: 1,
  strokeDashArray: null,
  strokeLineCap: 'butt',
  strokeDashOffset: 0,
  strokeLineJoin: 'miter',
  strokeUniform: false,
  strokeMiterLimit: 4,
  angle: 0,
  flipX: false,
  flipY: false,
  opacity: 1,
  shadow: null,
  visible: true,
  backgroundColor: '',
  fillRule: 'nonzero',
  paintFirst: 'fill',
  globalCompositeOperation: 'source-over',
  skewX: 0,
  skewY: 0,
} as const

/** Build display JSON document from session (single panel). Preserves `canvasZoom` when provided. */
export function sessionToDisplayDocument(
  session: DesignerSessionFile,
  presetId: string,
  options: {
    placeholderUrl: string
    canvasZoom?: number
    screens?: number
    gap?: number
    buildScreenHolePath: (
      corners: DesignerCornerData,
      radii: DesignerRadiiData | null,
      viewWidth: number,
      viewHeight: number,
    ) => unknown[][]
  },
): Record<string, unknown> {
  const preset = normalizeArtboardPresetId(presetId)
  const bgParts = designConfigFromSessionBackground(session.background)
  const canvasZoom = options.canvasZoom ?? 0.2
  const screens = options.screens ?? 1
  const gap = options.gap ?? PANEL_GAP

  const designObjects: unknown[] = []
  const fabricObjects: unknown[] = []
  let zIdx = 0
  const offset = 0

  for (const layer of session.layers) {
    if (layer.kind !== 'text') continue
    const uuid = layer.id
    designObjects.push({ id: uuid, kind: 'text', name: `Text · P1`, zIndex: zIdx })
    fabricObjects.push({
      ...COMMON,
      type: 'Textbox',
      originX: 'center',
      originY: 'center',
      scaleX: 1,
      scaleY: 1,
      left: Math.round(layer.x + layer.width / 2) + offset,
      top: Math.round(layer.y + layer.height / 2),
      width: layer.width,
      height: layer.height,
      fill: layer.color,
      strokeWidth: 1,
      fontSize: layer.size,
      fontWeight: layer.weight,
      fontFamily: layer.font,
      fontStyle: 'normal',
      lineHeight: 1.16,
      text: layer.content,
      charSpacing: 0,
      textAlign: layer.align,
      styles: [],
      pathStartOffset: 0,
      pathSide: 'left',
      pathAlign: 'baseline',
      underline: false,
      overline: false,
      linethrough: false,
      textBackgroundColor: '',
      direction: 'ltr',
      textDecorationThickness: Math.round(layer.size * 0.667 * 100) / 100,
      minWidth: 20,
      splitByGrapheme: false,
      appObjectId: uuid,
      zIndex: zIdx,
    })
    zIdx++
  }

  for (const layer of session.layers) {
    if (layer.kind !== 'device_frame') continue
    const uuid = layer.id
    const clipPath = {
      type: 'Path',
      version: '7.2.0',
      originX: 'center',
      originY: 'center',
      left: 0,
      top: 0,
      absolutePositioned: false,
      inverted: false,
      path: options.buildScreenHolePath(
        layer.corners,
        layer.clipRadii,
        layer.viewWidth,
        layer.viewHeight,
      ),
    }
    const screenshotChild = {
      ...COMMON,
      strokeWidth: 0,
      type: 'Image',
      originX: 'center',
      originY: 'center',
      left: 0,
      top: 0,
      width: layer.viewWidth,
      height: layer.viewHeight,
      fill: 'rgb(0,0,0)',
      scaleX: 1,
      scaleY: 1,
      cropX: 0,
      cropY: 0,
      clipPath,
      src: options.placeholderUrl,
      crossOrigin: 'anonymous',
      filters: [],
    }
    const frameChild = {
      ...COMMON,
      strokeWidth: 0,
      type: 'Image',
      originX: 'left',
      originY: 'top',
      left: -(layer.viewWidth / 2),
      top: -(layer.viewHeight / 2),
      width: layer.viewWidth,
      height: layer.viewHeight,
      fill: 'rgb(0,0,0)',
      scaleX: 1,
      scaleY: 1,
      cropX: 0,
      cropY: 0,
      src: `http://localhost:4713${layer.framePath}`,
      crossOrigin: 'anonymous',
      filters: [],
    }
    designObjects.push({
      id: uuid,
      kind: 'device',
      name: `Device · P1`,
      zIndex: zIdx,
      deviceFrameStyleId: layer.frameName,
      deviceFramePackId: layer.packId,
    })
    fabricObjects.push({
      ...COMMON,
      strokeWidth: 0,
      type: 'Group',
      subTargetCheck: false,
      interactive: false,
      originX: 'center',
      originY: 'center',
      left: Math.round(layer.x + layer.width / 2) + offset,
      top: Math.round(layer.y + layer.height / 2),
      width: layer.viewWidth,
      height: layer.viewHeight,
      fill: 'rgb(0,0,0)',
      scaleX: layer.scale,
      scaleY: layer.scale,
      layoutManager: { type: 'layoutManager', strategy: 'fixed' },
      objects: [screenshotChild, frameChild],
      appObjectId: uuid,
      zIndex: zIdx,
    })
    zIdx++
  }

  fabricObjects.sort((a, b) => (a as { zIndex: number }).zIndex - (b as { zIndex: number }).zIndex)

  return {
    version: 1,
    savedAt: new Date().toISOString(),
    design: {
      config: {
        artboardPresetId: preset,
        screens,
        gap,
        showLayerNames: false,
        ...bgParts,
      },
      objects: designObjects,
      canvasZoom,
    },
    fabricObjects,
  }
}

async function loadCornersFromFrameJson(
  rootDir: string,
  packId: string,
  frameName: string,
): Promise<{
  viewWidth: number
  viewHeight: number
  corners: DesignerCornerData
  clipRadii: DesignerRadiiData | null
  homography: boolean
}> {
  const defaults: DesignerCornerData = { TL: [0, 0], TR: [0, 0], BR: [0, 0], BL: [0, 0] }
  try {
    const frameJsonPath = path.join(rootDir, 'public', 'device-frames', packId, 'frame.json')
    const raw = await fs.readFile(frameJsonPath, 'utf8')
    const parsed = JSON.parse(raw) as {
      frames: Array<{
        name: string
        viewWidth: number
        viewHeight: number
        corners: DesignerCornerData
        clipCornerRadiiPx?: DesignerRadiiData
        homography?: boolean
      }>
    }
    const entry = parsed.frames.find((f) => f.name === frameName)
    if (entry) {
      return {
        viewWidth: entry.viewWidth,
        viewHeight: entry.viewHeight,
        corners: entry.corners,
        clipRadii: entry.clipCornerRadiiPx ?? null,
        homography: entry.homography ?? false,
      }
    }
  } catch {
    /* fall through */
  }
  return { viewWidth: 0, viewHeight: 0, corners: defaults, clipRadii: null, homography: false }
}

/**
 * Parse display document into a designer session. Only Textbox + device Group layouts
 * produced by the agent save path (or compatible client exports) are supported.
 */
export async function displayDocumentToSession(
  doc: Record<string, unknown>,
  panelWidth: number,
  panelHeight: number,
  rootDir: string,
): Promise<DesignerSessionFile> {
  const design = doc.design
  if (!isRecord(design)) throw new Error('display_document_invalid: missing design')
  const cfg = design.config
  if (!isRecord(cfg)) throw new Error('display_document_invalid: missing design.config')

  let background: DesignerBackground
  const mode = cfg.backgroundMode
  const bgHex = typeof cfg.background === 'string' ? cfg.background : '#101827'
  if (mode === 'gradient' && isRecord(cfg.backgroundGradient)) {
    const g = cfg.backgroundGradient as Record<string, unknown>
    const stops = Array.isArray(g.stops) ? g.stops : []
    background = {
      type: 'gradient',
      value: {
        angleDeg: Number(g.angleDeg ?? 180),
        stops: stops
          .filter(isRecord)
          .map((s) => ({
            offset: Number(s.offset ?? 0),
            color: String(s.color ?? '#000000'),
          })),
      },
    }
  } else if (typeof cfg.backgroundImageUrl === 'string' && cfg.backgroundImageUrl.length > 0) {
    background = { type: 'image', value: cfg.backgroundImageUrl }
  } else {
    background = { type: 'color', value: isHexColor(bgHex) ? bgHex : '#101827' }
  }

  const fabricObjects = Array.isArray(doc.fabricObjects) ? doc.fabricObjects : []
  const designObjects = Array.isArray(design.objects) ? design.objects : []

  const byAppId = new Map<string, Record<string, unknown>>()
  for (const o of designObjects) {
    if (!isRecord(o) || typeof o.id !== 'string') continue
    byAppId.set(o.id, o)
  }

  type Sortable = { z: number; o: Record<string, unknown> }
  const sorted: Sortable[] = []
  for (const o of fabricObjects) {
    if (!isRecord(o)) continue
    const z = typeof o.zIndex === 'number' ? o.zIndex : 0
    sorted.push({ z, o })
  }
  sorted.sort((a, b) => a.z - b.z)

  const layers: DesignerLayer[] = []

  for (const { o } of sorted) {
    if (o.type === 'Textbox') {
      const w = Number(o.width ?? 0)
      const h = Number(o.height ?? 0)
      const left = Number(o.left ?? 0)
      const top = Number(o.top ?? 0)
      const ox = o.originX === 'center' ? 'center' : 'left'
      const oy = o.originY === 'center' ? 'center' : 'top'
      const cx = ox === 'center' ? left : left + w / 2
      const cy = oy === 'center' ? top : top + h / 2
      const x = Math.round(cx - w / 2)
      const y = Math.round(cy - h / 2)
      const id = typeof o.appObjectId === 'string' ? o.appObjectId : randomUUID()
      const alignRaw = String(o.textAlign ?? 'left')
      const align =
        alignRaw === 'center' || alignRaw === 'right' ? alignRaw : ('left' as const)
      layers.push({
        id,
        kind: 'text',
        content: String(o.text ?? ''),
        x,
        y,
        width: w,
        height: h,
        font: String(o.fontFamily ?? 'Inter'),
        size: Number(o.fontSize ?? 24),
        color: String(o.fill ?? '#ffffff'),
        align,
        weight: String(o.fontWeight ?? '400'),
        zIndex: typeof o.zIndex === 'number' ? o.zIndex : 4,
      })
      continue
    }

    if (o.type === 'Group' && Array.isArray(o.objects)) {
      const frameSrc = findDeviceFrameSrcDeep(o)
      if (!frameSrc) {
        throw new Error('display_document_invalid: device Group missing /device-frames/ image src')
      }

      const pathParts = frameSrc.split('/').filter(Boolean)
      const packId = pathParts[1] ?? ''

      const metaId =
        typeof o.appObjectId === 'string'
          ? o.appObjectId
          : typeof (o as { appObjectId?: string }).appObjectId === 'string'
            ? String((o as { appObjectId?: string }).appObjectId)
            : ''
      const meta = metaId ? byAppId.get(metaId) : undefined
      const styleFromMeta =
        meta && meta.kind === 'device' && typeof meta.deviceFrameStyleId === 'string'
          ? meta.deviceFrameStyleId
          : 'front'

      const scale = Number(o.scaleX ?? o.scaleY ?? 1) || 1
      const viewW = Number(o.width ?? 0)
      const viewH = Number(o.height ?? 0)
      const gl = Number(o.left ?? 0)
      const gt = Number(o.top ?? 0)
      const gOx = o.originX === 'center' ? 'center' : 'left'
      const gOy = o.originY === 'center' ? 'center' : 'top'
      const centerX = gOx === 'center' ? gl : gl + (viewW * scale) / 2
      const centerY = gOy === 'center' ? gt : gt + (viewH * scale) / 2
      const dispW = Math.round(viewW * scale)
      const dispH = Math.round(viewH * scale)
      const x = Math.round(centerX - dispW / 2)
      const y = Math.round(centerY - dispH / 2)

      const geo = await loadCornersFromFrameJson(rootDir, packId, styleFromMeta)
      let viewWidth = geo.viewWidth > 0 ? geo.viewWidth : viewW
      let viewHeight = geo.viewHeight > 0 ? geo.viewHeight : viewH
      if (viewWidth <= 0) viewWidth = viewW
      if (viewHeight <= 0) viewHeight = viewH

      const id = typeof o.appObjectId === 'string' ? o.appObjectId : randomUUID()

      layers.push({
        id,
        kind: 'device_frame',
        framePath: frameSrc,
        frameName: styleFromMeta,
        packId,
        x,
        y,
        width: dispW,
        height: dispH,
        scale,
        viewWidth,
        viewHeight,
        corners: geo.corners,
        clipRadii: geo.clipRadii,
        homography: geo.homography,
        zIndex: typeof o.zIndex === 'number' ? o.zIndex : 2,
      })
    }
  }

  for (const x of fabricObjects) {
    if (!isRecord(x)) continue
    const t = x.type
    if (t !== 'Textbox' && t !== 'Group') {
      throw new Error(
        `display_document_unsupported: fabric type "${String(t)}" is not supported for agent execute`,
      )
    }
  }

  return {
    width: panelWidth,
    height: panelHeight,
    background,
    layers,
  }
}

function isHexColor(value: string): boolean {
  return /^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(value.trim())
}

export function displayFilePathForPreset(datasourceDir: string, presetId: string): string {
  const slug = getDisplayFileSlug(presetId)
  return path.join(datasourceDir, `display_${slug}.json`)
}

export async function readDisplayDocumentIfExists(
  filePath: string,
): Promise<Record<string, unknown> | null> {
  try {
    const text = await fs.readFile(filePath, 'utf8')
    const raw = JSON.parse(text) as unknown
    if (!isRecord(raw)) return null
    return raw
  } catch (e: unknown) {
    const err = e as NodeJS.ErrnoException
    if (err.code === 'ENOENT') return null
    throw e
  }
}
