import { randomUUID } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

import sharp from 'sharp'

type Anchor = 'center_x' | 'center_y' | 'top' | 'bottom' | 'left' | 'right'
type FontToken = 'headline' | 'subheadline' | 'body' | 'caption'
type TextAlign = 'left' | 'center' | 'right'

type GradientStop = { offset: number; color: string }
type GradientConfig = {
  angleDeg: number
  stops: GradientStop[]
}

type BackgroundConfig =
  | { type: 'color'; value: string }
  | { type: 'gradient'; value: GradientConfig }
  | { type: 'image'; value: string }

type BaseLayer = {
  id: string
  kind: 'device_frame' | 'text'
  x: number
  y: number
  width: number
  height: number
  zIndex: number
}

type DeviceFrameLayer = BaseLayer & {
  kind: 'device_frame'
  framePath: string
  frameName: string
  scale: number
}

type TextLayer = BaseLayer & {
  kind: 'text'
  content: string
  font: string
  size: number
  color: string
  align: TextAlign
  weight: string
}

type Layer = DeviceFrameLayer | TextLayer

type DesignerSession = {
  id: string
  width: number
  height: number
  background: BackgroundConfig
  layers: Layer[]
  renderCount: number
}

type ContrastIssue = {
  layerId: string
  contrastRatio: number
}

const DESIGN_GRID = 16
const SAFE_ZONE = { top: 120, bottom: 120, sides: 60 }
const MIN_HEADLINE_SIZE = 60
const MIN_CONTRAST = 4.5
const MAX_ITERATIONS_PER_SCREENSHOT = 4
const DEVICE_MIN_CANVAS_HEIGHT_RATIO = 0.55
const DEVICE_MAX_CANVAS_HEIGHT_RATIO = 0.75
const Z_INDEX = {
  background: 0,
  shapes: 1,
  deviceFrame: 2,
  screenshotContent: 3,
  text: 4,
} as const

const CANVAS_SIZES: Record<string, { width: number; height: number }> = {
  iphone: { width: 1290, height: 2796 },
  ipad: { width: 2048, height: 2732 },
  phone: { width: 1080, height: 1920 },
  tablet: { width: 1600, height: 2560 },
}

// FONT_MAP stores clean font family tokens. The full CSS font-family stack is
// built at render time: "Inter, sans-serif" when the font file is found on disk,
// or "system-ui, -apple-system, sans-serif" when it is not.
const FONT_MAP: Record<FontToken, string> = {
  headline: 'Inter',
  subheadline: 'Inter',
  body: 'Inter',
  caption: 'Inter',
}

const DEFAULT_SESSION_SIZE = CANVAS_SIZES.iphone

const sessions = new Map<string, DesignerSession>()

function isHexColor(value: string): boolean {
  return /^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(value.trim())
}

function isGridValue(value: number): boolean {
  return Number.isFinite(value) && Math.round(value) % DESIGN_GRID === 0
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function estimateTextWidth(content: string, fontSize: number): number {
  return Math.max(fontSize, Math.round(content.length * fontSize * 0.56))
}

function relativeLuminance(hex: string): number {
  const clean = hex.replace('#', '').trim()
  const value = clean.length === 8 ? clean.slice(0, 6) : clean
  const n = Number.parseInt(value, 16)
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  const toLinear = (c: number): number => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b)
}

function contrastRatio(a: string, b: string): number {
  const l1 = relativeLuminance(a)
  const l2 = relativeLuminance(b)
  const bright = Math.max(l1, l2)
  const dark = Math.min(l1, l2)
  return (bright + 0.05) / (dark + 0.05)
}

function rectsOverlap(a: { x: number; y: number; width: number; height: number }, b: {
  x: number
  y: number
  width: number
  height: number
}): boolean {
  return !(
    a.x + a.width <= b.x ||
    b.x + b.width <= a.x ||
    a.y + a.height <= b.y ||
    b.y + b.height <= a.y
  )
}

function isWithinCanvas(layer: Layer, width: number, height: number): boolean {
  return (
    layer.x >= 0 &&
    layer.y >= 0 &&
    layer.x + layer.width <= width &&
    layer.y + layer.height <= height
  )
}

function textInsideSafeZone(layer: TextLayer, width: number, height: number): boolean {
  return (
    layer.x >= SAFE_ZONE.sides &&
    layer.y >= SAFE_ZONE.top &&
    layer.x + layer.width <= width - SAFE_ZONE.sides &&
    layer.y + layer.height <= height - SAFE_ZONE.bottom
  )
}

function buildGradientBackgroundSvg(width: number, height: number, gradient: GradientConfig): string {
  const colorStops = gradient.stops
    .map((stop) => {
      const offset = Math.round(clamp(stop.offset, 0, 1) * 100)
      return `<stop offset="${offset}%" stop-color="${stop.color}" />`
    })
    .join('')
  const angle = ((gradient.angleDeg % 360) + 360) % 360
  const rad = (angle * Math.PI) / 180
  const x2 = 50 + 50 * Math.cos(rad)
  const y2 = 50 + 50 * Math.sin(rad)
  return [
    `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">`,
    '<defs>',
    `<linearGradient id="g" x1="50%" y1="50%" x2="${x2}%" y2="${y2}%">`,
    colorStops,
    '</linearGradient>',
    '</defs>',
    `<rect x="0" y="0" width="${width}" height="${height}" fill="url(#g)" />`,
    '</svg>',
  ].join('')
}

function resolveCanvasSize(canvasSize: string | undefined): { width: number; height: number } {
  if (!canvasSize) return DEFAULT_SESSION_SIZE
  return CANVAS_SIZES[canvasSize] ?? DEFAULT_SESSION_SIZE
}

async function resolveImagePath(rootDir: string, imagePath: string): Promise<string> {
  const normalized = imagePath.trim()
  if (normalized.startsWith('/device-frames/')) {
    return path.join(rootDir, 'public', normalized.slice(1))
  }
  if (normalized.startsWith('/__api/datasource/screenshots/')) {
    const rel = normalized.replace('/__api/datasource/screenshots/', '')
    return path.join(rootDir, '../datasource/screenshots', rel)
  }
  if (normalized.startsWith('/')) {
    return path.join(rootDir, 'public', normalized.slice(1))
  }
  return path.resolve(rootDir, normalized)
}

// Tries to load an Inter font file from {rootDir}/public/fonts/ as a base64
// data URI. Returns null if the file does not exist — callers must fall back
// to the system font stack in that case.
// No font files are present in public/fonts/ by default; add Inter .ttf files
// there to enable reliable server-side font rendering via Sharp.
async function loadFontAsBase64(rootDir: string, fontToken: FontToken): Promise<string | null> {
  const isBold = fontToken === 'headline' || fontToken === 'subheadline'
  const fileName = isBold ? 'Inter-Bold.ttf' : 'Inter-Regular.ttf'
  const fontPath = path.join(rootDir, 'public', 'fonts', fileName)
  try {
    const data = await fs.readFile(fontPath)
    return `data:font/truetype;base64,${data.toString('base64')}`
  } catch {
    return null
  }
}

async function renderSessionPng(rootDir: string, session: DesignerSession): Promise<Buffer> {
  let base = sharp({
    create: {
      width: session.width,
      height: session.height,
      channels: 4,
      background: '#000000',
    },
  })

  if (session.background.type === 'color') {
    base = sharp({
      create: {
        width: session.width,
        height: session.height,
        channels: 4,
        background: session.background.value,
      },
    })
  } else if (session.background.type === 'gradient') {
    const svg = buildGradientBackgroundSvg(session.width, session.height, session.background.value)
    base = sharp(Buffer.from(svg))
  } else if (session.background.type === 'image') {
    const full = await resolveImagePath(rootDir, session.background.value)
    const raw = await fs.readFile(full)
    base = sharp(raw).resize(session.width, session.height, { fit: 'cover' })
  }

  const composites: sharp.OverlayOptions[] = []
  const sorted = [...session.layers].sort((a, b) => a.zIndex - b.zIndex)

  for (const layer of sorted) {
    if (layer.kind === 'device_frame') {
      const framePath = await resolveImagePath(rootDir, layer.framePath)
      const frameBuffer = await sharp(framePath)
        .resize(Math.max(1, Math.round(layer.width)), Math.max(1, Math.round(layer.height)))
        .png()
        .toBuffer()
      composites.push({
        input: frameBuffer,
        left: Math.round(layer.x),
        top: Math.round(layer.y),
      })
      continue
    }

    const escaped = layer.content
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
    const x = layer.align === 'center' ? layer.width / 2 : layer.align === 'right' ? layer.width : 0
    const anchor = layer.align === 'center' ? 'middle' : layer.align === 'right' ? 'end' : 'start'

    // Determine which FontToken this layer was created with so we can pick the
    // right Inter variant (Bold vs Regular). layer.font stores the bare family
    // name token written by add_text via FONT_MAP.
    const isBoldLayer = layer.weight === '700' || layer.weight === 'bold'
    const fontToken: FontToken = isBoldLayer ? 'headline' : 'body'
    const fontDataUri = await loadFontAsBase64(rootDir, fontToken)
    const cssFontFamily = fontDataUri ? `${layer.font}, sans-serif` : 'system-ui, -apple-system, sans-serif'
    const fontFaceBlock = fontDataUri
      ? `<style>@font-face { font-family: '${layer.font}'; src: url('${fontDataUri}'); }</style>`
      : ''

    const textSvg = [
      `<svg width="${Math.max(1, Math.round(layer.width))}" height="${Math.max(1, Math.round(layer.height))}" xmlns="http://www.w3.org/2000/svg">`,
      fontFaceBlock,
      `<text x="${x}" y="${Math.max(layer.size, Math.round(layer.height * 0.8))}" font-size="${layer.size}"`,
      `font-family="${cssFontFamily}" font-weight="${layer.weight}" fill="${layer.color}" text-anchor="${anchor}">${escaped}</text>`,
      '</svg>',
    ].join(' ')
    composites.push({
      input: Buffer.from(textSvg),
      left: Math.round(layer.x),
      top: Math.round(layer.y),
    })
  }

  return base.composite(composites).png().toBuffer()
}

function getSessionOrThrow(sessionId: string): DesignerSession {
  const session = sessions.get(sessionId)
  if (!session) throw new Error(`Unknown session "${sessionId}"`)
  return session
}

function qualityChecks(session: DesignerSession): {
  ok: boolean
  errors: string[]
  contrastIssues: ContrastIssue[]
} {
  const errors: string[] = []
  const textLayers = session.layers.filter((layer): layer is TextLayer => layer.kind === 'text')
  const devices = session.layers.filter((layer): layer is DeviceFrameLayer => layer.kind === 'device_frame')
  const contrastIssues: ContrastIssue[] = []

  for (const text of textLayers) {
    if (!textInsideSafeZone(text, session.width, session.height)) {
      errors.push(`Text layer ${text.id} is outside safe zones.`)
    }
    if (!isWithinCanvas(text, session.width, session.height)) {
      errors.push(`Text layer ${text.id} is outside canvas bounds.`)
    }
    const bgForContrast =
      session.background.type === 'color' && isHexColor(session.background.value)
        ? session.background.value
        : '#111111'
    if (isHexColor(text.color) && isHexColor(bgForContrast)) {
      const ratio = contrastRatio(text.color, bgForContrast)
      if (ratio < MIN_CONTRAST) {
        contrastIssues.push({ layerId: text.id, contrastRatio: Number(ratio.toFixed(2)) })
      }
    }
    if (text.size < MIN_HEADLINE_SIZE && text.content.trim().split(/\s+/).length <= 6) {
      errors.push(`Headline-like text layer ${text.id} must be at least ${MIN_HEADLINE_SIZE}px.`)
    }
  }

  for (const device of devices) {
    const ratio = device.height / session.height
    if (ratio < DEVICE_MIN_CANVAS_HEIGHT_RATIO || ratio > DEVICE_MAX_CANVAS_HEIGHT_RATIO) {
      errors.push(
        `Device layer ${device.id} must occupy ${(DEVICE_MIN_CANVAS_HEIGHT_RATIO * 100).toFixed(0)}-${(
          DEVICE_MAX_CANVAS_HEIGHT_RATIO * 100
        ).toFixed(0)}% of canvas height.`,
      )
    }
    if (!isWithinCanvas(device, session.width, session.height)) {
      errors.push(`Device layer ${device.id} is outside canvas bounds.`)
    }
  }

  for (const text of textLayers) {
    for (const device of devices) {
      if (rectsOverlap(text, device)) {
        errors.push(`Text layer ${text.id} overlaps device frame ${device.id}.`)
      }
    }
  }

  if (contrastIssues.length > 0) {
    errors.push('One or more text layers fail minimum contrast ratio 4.5:1.')
  }

  return { ok: errors.length === 0, errors, contrastIssues }
}

export function createScreenshotDesignerSession(canvasSize?: string): {
  sessionId: string
  width: number
  height: number
} {
  const { width, height } = resolveCanvasSize(canvasSize)
  const id = randomUUID()
  sessions.set(id, {
    id,
    width,
    height,
    background: { type: 'color', value: '#101827' },
    layers: [],
    renderCount: 0,
  })
  return { sessionId: id, width, height }
}

export async function screenshotDesignerExecuteOperation(
  rootDir: string,
  sessionId: string,
  operation: string,
  args: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const session = getSessionOrThrow(sessionId)

  switch (operation) {
    case 'set_background': {
      const type = args.type
      if (type !== 'color' && type !== 'gradient' && type !== 'image') {
        throw new Error('type must be "color" | "gradient" | "image"')
      }
      if (type === 'color') {
        const value = String(args.value ?? '').trim()
        if (!isHexColor(value)) throw new Error('Solid color must be a hex value')
        session.background = { type, value }
      } else if (type === 'gradient') {
        const value = args.value as Partial<GradientConfig> | undefined
        if (!value || !Array.isArray(value.stops) || value.stops.length < 2) {
          throw new Error('Gradient requires at least two color stops')
        }
        session.background = {
          type,
          value: {
            angleDeg: Number(value.angleDeg ?? 180),
            stops: value.stops.map((stop) => ({
              offset: clamp(Number(stop.offset), 0, 1),
              color: String(stop.color),
            })),
          },
        }
      } else {
        session.background = { type, value: String(args.value ?? '') }
      }
      return { ok: true }
    }

    case 'add_device_frame': {
      const framePath = String(args.path ?? '')
      const frameName = String(args.frame ?? 'front')
      const x = Number(args.x)
      const y = Number(args.y)
      const scale = Number(args.scale)
      if (!isGridValue(x) || !isGridValue(y)) {
        throw new Error('x and y must be multiples of 16')
      }
      if (!Number.isFinite(scale) || scale <= 0) {
        throw new Error('scale must be a positive number')
      }
      const resolved = await resolveImagePath(rootDir, framePath)
      const meta = await sharp(resolved).metadata()
      const sourceWidth = meta.width ?? 0
      const sourceHeight = meta.height ?? 0
      if (sourceWidth <= 0 || sourceHeight <= 0) {
        throw new Error('Unable to read frame dimensions')
      }
      const id = randomUUID()
      const width = Math.round(sourceWidth * scale)
      const height = Math.round(sourceHeight * scale)
      const layer: DeviceFrameLayer = {
        id,
        kind: 'device_frame',
        framePath,
        frameName,
        x,
        y,
        width,
        height,
        scale,
        zIndex: Z_INDEX.deviceFrame,
      }
      session.layers.push(layer)
      return { ok: true, layer_id: id }
    }

    case 'add_text': {
      const content = String(args.content ?? '')
      const x = Number(args.x)
      const y = Number(args.y)
      const fontToken = String(args.font ?? '') as FontToken
      const size = Number(args.size)
      const color = String(args.color ?? '')
      const align = String(args.align ?? 'left') as TextAlign
      const weight = String(args.weight ?? '700')
      const zIndex = Number(args.z_index ?? Z_INDEX.text)

      if (!isGridValue(x) || !isGridValue(y)) {
        throw new Error('x and y must be multiples of 16')
      }
      if (!(fontToken in FONT_MAP)) {
        throw new Error('font must be one of: headline, subheadline, body, caption')
      }
      if (!isHexColor(color)) {
        throw new Error('color must be a hex color')
      }
      if (align !== 'left' && align !== 'center' && align !== 'right') {
        throw new Error('align must be left | center | right')
      }
      const width = estimateTextWidth(content, size)
      const height = Math.round(size * 1.3)
      const layer: TextLayer = {
        id: randomUUID(),
        kind: 'text',
        content,
        x,
        y,
        width,
        height,
        font: FONT_MAP[fontToken],
        size,
        color,
        align,
        weight,
        zIndex: Number.isFinite(zIndex) ? zIndex : Z_INDEX.text,
      }
      session.layers.push(layer)
      return { ok: true, layer_id: layer.id }
    }

    case 'align': {
      const layerId = String(args.layer_id ?? '')
      const anchor = String(args.anchor ?? '') as Anchor
      const reference = String(args.reference ?? 'canvas')
      const layer = session.layers.find((l) => l.id === layerId)
      if (!layer) throw new Error('layer_id not found')
      if (!['center_x', 'center_y', 'top', 'bottom', 'left', 'right'].includes(anchor)) {
        throw new Error('invalid anchor')
      }
      const refRect =
        reference === 'canvas'
          ? { x: 0, y: 0, width: session.width, height: session.height }
          : session.layers.find((l) => l.id === reference)
      if (!refRect) {
        throw new Error('reference must be "canvas" or existing layer id')
      }
      if (anchor === 'center_x') {
        layer.x = Math.round((refRect.x + refRect.width / 2 - layer.width / 2) / DESIGN_GRID) * DESIGN_GRID
      } else if (anchor === 'center_y') {
        layer.y = Math.round((refRect.y + refRect.height / 2 - layer.height / 2) / DESIGN_GRID) * DESIGN_GRID
      } else if (anchor === 'top') {
        layer.y = Math.round(refRect.y / DESIGN_GRID) * DESIGN_GRID
      } else if (anchor === 'bottom') {
        layer.y = Math.round((refRect.y + refRect.height - layer.height) / DESIGN_GRID) * DESIGN_GRID
      } else if (anchor === 'left') {
        layer.x = Math.round(refRect.x / DESIGN_GRID) * DESIGN_GRID
      } else {
        layer.x = Math.round((refRect.x + refRect.width - layer.width) / DESIGN_GRID) * DESIGN_GRID
      }
      return { ok: true, layer_id: layer.id, x: layer.x, y: layer.y }
    }

    case 'render_preview': {
      session.renderCount += 1
      if (session.renderCount > MAX_ITERATIONS_PER_SCREENSHOT) {
        throw new Error(`Maximum ${MAX_ITERATIONS_PER_SCREENSHOT} render iterations reached for this session`)
      }
      const png = await renderSessionPng(rootDir, session)
      const checks = qualityChecks(session)
      return {
        ok: true,
        image_base64: png.toString('base64'),
        checks,
        iteration: session.renderCount,
      }
    }

    case 'export_json': {
      const checks = qualityChecks(session)
      if (!checks.ok) {
        throw new Error(`quality_gate_failed: ${checks.errors.join(' | ')}`)
      }
      const json = {
        version: 'fabric-like-v1',
        width: session.width,
        height: session.height,
        background: session.background,
        objects: session.layers.map((layer) => ({
          id: layer.id,
          type: layer.kind === 'text' ? 'textbox' : 'image',
          left: layer.x,
          top: layer.y,
          width: layer.width,
          height: layer.height,
          zIndex: layer.zIndex,
          ...(layer.kind === 'text'
            ? {
                text: layer.content,
                fontFamily: layer.font,
                fontSize: layer.size,
                fill: layer.color,
                textAlign: layer.align,
                fontWeight: layer.weight,
              }
            : {
                src: layer.framePath,
                frameName: layer.frameName,
                scale: layer.scale,
              }),
        })),
      }
      return { ok: true, json }
    }

    case 'clear_canvas': {
      session.layers = []
      return { ok: true }
    }

    default:
      throw new Error(`Unknown operation "${operation}"`)
  }
}
