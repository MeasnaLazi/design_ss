import { randomUUID } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

import sharp from 'sharp'

import {
  displayDocumentToSession,
  displayFilePathForPreset,
  readDisplayDocumentIfExists,
  sessionToDisplayDocument,
} from './display-designer-session'
import { ARTBOARD_PRESET_ID_LEGACY, normalizeArtboardPresetId } from './src/constants/artboardPresets'

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

type CornerPoint = [number, number]
type CornerData = { TL: CornerPoint; TR: CornerPoint; BR: CornerPoint; BL: CornerPoint }
type RadiiData = { tl: number; tr: number; br: number; bl: number }

type DeviceFrameLayer = BaseLayer & {
  kind: 'device_frame'
  framePath: string
  frameName: string
  packId: string
  scale: number
  viewWidth: number
  viewHeight: number
  corners: CornerData
  clipRadii: RadiiData | null
  homography: boolean
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
  width: number
  height: number
  background: BackgroundConfig
  layers: Layer[]
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

const PANEL_GAP = 40

type PresetInfo = { presetId: string; displaySlug: string; placeholder: string }

const CANVAS_SIZE_TO_PRESET: Record<string, PresetInfo> = {
  iphone: { presetId: 'appstore_iphone_portrait', displaySlug: 'iphone', placeholder: 'http://localhost:4713/__api/datasource/placeholder/iphone.jpg' },
  ipad: { presetId: 'appstore_ipad_portrait', displaySlug: 'ipad', placeholder: 'http://localhost:4713/__api/datasource/placeholder/ipad.jpg' },
  phone: { presetId: 'play_phone_portrait', displaySlug: 'play_phone', placeholder: 'http://localhost:4713/__api/datasource/placeholder/phone.jpg' },
  tablet: { presetId: 'play_tablet_portrait', displaySlug: 'play_tablet_portrait', placeholder: 'http://localhost:4713/__api/datasource/placeholder/phone.jpg' },
}

function canonicalPresetId(raw: string): string {
  const mapped = ARTBOARD_PRESET_ID_LEGACY[raw]
  return mapped ?? raw
}

const PRESET_BY_ID: Record<string, PresetInfo & { width: number; height: number }> = {
  appstore_iphone_portrait: {
    presetId: 'appstore_iphone_portrait',
    displaySlug: 'iphone',
    placeholder: 'http://localhost:4713/__api/datasource/placeholder/iphone.jpg',
    width: 1290,
    height: 2796,
  },
  appstore_ipad_portrait: {
    presetId: 'appstore_ipad_portrait',
    displaySlug: 'ipad',
    placeholder: 'http://localhost:4713/__api/datasource/placeholder/ipad.jpg',
    width: 2048,
    height: 2732,
  },
  play_phone_portrait: { presetId: 'play_phone_portrait', displaySlug: 'play_phone', placeholder: 'http://localhost:4713/__api/datasource/placeholder/phone.jpg', width: 1080, height: 1920 },
  play_tablet_portrait: { presetId: 'play_tablet_portrait', displaySlug: 'play_tablet_portrait', placeholder: 'http://localhost:4713/__api/datasource/placeholder/phone.jpg', width: 1600, height: 2560 },
  play_tablet_landscape: { presetId: 'play_tablet_landscape', displaySlug: 'play_tablet_landscape', placeholder: 'http://localhost:4713/__api/datasource/placeholder/phone.jpg', width: 2560, height: 1600 },
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

const DEFAULT_PRESET_ID = 'appstore_iphone_portrait'

const RENDER_STATE_FILE = '.screenshot-designer-state.json'

export type DesignerExecuteContext = {
  rootDir: string
  datasourceDir: string
  canvasSize?: string
  presetId?: string
  sessionArtboard?: string
  cookieArtboard?: string
  refererArtboard?: string
  onDisplayWritten?: (info: { slug: string; savedAt: string }) => void
}

type SlugRenderState = {
  renderCount: number
  /** Iterations for `render_workspace_preview` (separate cap from `render_preview`). */
  workspaceRenderCount: number
  displayMtimeMs: number
}

type RenderStateFile = {
  v: 1
  slugs: Record<string, SlugRenderState>
}

function normalizeSlugRenderState(raw: unknown): SlugRenderState | undefined {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return undefined
  const o = raw as Record<string, unknown>
  const renderCount = typeof o.renderCount === 'number' ? o.renderCount : 0
  const workspaceRenderCount =
    typeof o.workspaceRenderCount === 'number' ? o.workspaceRenderCount : 0
  const displayMtimeMs = typeof o.displayMtimeMs === 'number' ? o.displayMtimeMs : -1
  return { renderCount, workspaceRenderCount, displayMtimeMs }
}

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

/** Rasterize session layers onto a bitmap of size `canvasWidth` × `canvasHeight` (preset panel or multi-panel strip). */
async function renderSessionPngAtSize(
  rootDir: string,
  session: DesignerSession,
  canvasWidth: number,
  canvasHeight: number,
): Promise<Buffer> {
  let base = sharp({
    create: {
      width: canvasWidth,
      height: canvasHeight,
      channels: 4,
      background: '#000000',
    },
  })

  if (session.background.type === 'color') {
    base = sharp({
      create: {
        width: canvasWidth,
        height: canvasHeight,
        channels: 4,
        background: session.background.value,
      },
    })
  } else if (session.background.type === 'gradient') {
    const svg = buildGradientBackgroundSvg(canvasWidth, canvasHeight, session.background.value)
    base = sharp(Buffer.from(svg))
  } else if (session.background.type === 'image') {
    const full = await resolveImagePath(rootDir, session.background.value)
    const raw = await fs.readFile(full)
    base = sharp(raw).resize(canvasWidth, canvasHeight, { fit: 'cover' })
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

async function renderSessionPng(rootDir: string, session: DesignerSession): Promise<Buffer> {
  return renderSessionPngAtSize(rootDir, session, session.width, session.height)
}

function createBlankSession(width: number, height: number): DesignerSession {
  return {
    width,
    height,
    background: { type: 'color', value: '#101827' },
    layers: [],
  }
}

/** `?artboard=` on the app URL or session URL: short keys (iphone, …) or full preset id. */
function presetIdFromArtboardUrlParam(raw: string | undefined | null): string | undefined {
  if (raw == null) return undefined
  const v = raw.trim()
  if (!v) return undefined
  const canon = canonicalPresetId(v)
  if (PRESET_BY_ID[canon]) return canon
  const key = v.toLowerCase()
  return CANVAS_SIZE_TO_PRESET[key]?.presetId
}

function resolvePresetId(
  canvasSize?: string,
  presetId?: string,
  sessionArtboard?: string,
  cookieArtboard?: string,
  refererArtboard?: string,
): string {
  if (presetId) {
    const canon = canonicalPresetId(presetId)
    if (PRESET_BY_ID[canon]) return canon
  }
  const sizeKey = canvasSize ?? ''
  const fromCanvasSize = CANVAS_SIZE_TO_PRESET[sizeKey]?.presetId
  if (fromCanvasSize) return fromCanvasSize
  const fromSessionArtboard = presetIdFromArtboardUrlParam(sessionArtboard)
  if (fromSessionArtboard) return fromSessionArtboard
  const fromCookie = presetIdFromArtboardUrlParam(cookieArtboard)
  if (fromCookie) return fromCookie
  const fromRefererArtboard = presetIdFromArtboardUrlParam(refererArtboard)
  if (fromRefererArtboard) return fromRefererArtboard
  return DEFAULT_PRESET_ID
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x)
}

async function readRenderState(datasourceDir: string): Promise<RenderStateFile> {
  try {
    const raw = JSON.parse(
      await fs.readFile(path.join(datasourceDir, RENDER_STATE_FILE), 'utf8'),
    ) as unknown
    if (isRecord(raw) && raw.v === 1 && isRecord(raw.slugs)) {
      return { v: 1, slugs: raw.slugs as RenderStateFile['slugs'] }
    }
  } catch {
    /* missing or corrupt */
  }
  return { v: 1, slugs: {} }
}

async function writeRenderState(datasourceDir: string, s: RenderStateFile): Promise<void> {
  await fs.mkdir(datasourceDir, { recursive: true })
  await fs.writeFile(path.join(datasourceDir, RENDER_STATE_FILE), JSON.stringify(s, null, 2), 'utf8')
}

function workspaceStripPixelSize(
  panelWidth: number,
  panelHeight: number,
  screens: number,
  gap: number,
): { width: number; height: number } {
  const s = Math.max(1, Math.floor(screens))
  const g = Math.max(0, Math.floor(gap))
  const width = s * panelWidth + Math.max(0, s - 1) * g
  return { width, height: panelHeight }
}

async function bumpRenderPreviewIteration(
  datasourceDir: string,
  slug: string,
  displayFilePath: string,
): Promise<number> {
  let st: Awaited<ReturnType<typeof fs.stat>>
  try {
    st = await fs.stat(displayFilePath)
  } catch {
    throw new Error('display file missing for render_preview')
  }
  const mtime = Math.floor(st.mtimeMs)
  const state = await readRenderState(datasourceDir)
  const prevN = normalizeSlugRenderState(state.slugs[slug])
  const renderCount =
    prevN !== undefined && prevN.displayMtimeMs === mtime ? prevN.renderCount + 1 : 1
  if (renderCount > MAX_ITERATIONS_PER_SCREENSHOT) {
    throw new Error(`Maximum ${MAX_ITERATIONS_PER_SCREENSHOT} render iterations reached`)
  }
  const workspaceRenderCount =
    prevN !== undefined && prevN.displayMtimeMs === mtime ? prevN.workspaceRenderCount : 0
  state.slugs[slug] = { renderCount, displayMtimeMs: mtime, workspaceRenderCount }
  await writeRenderState(datasourceDir, state)
  return renderCount
}

async function bumpWorkspaceRenderPreviewIteration(
  datasourceDir: string,
  slug: string,
  displayFilePath: string,
): Promise<number> {
  let st: Awaited<ReturnType<typeof fs.stat>>
  try {
    st = await fs.stat(displayFilePath)
  } catch {
    throw new Error('display file missing for render_workspace_preview')
  }
  const mtime = Math.floor(st.mtimeMs)
  const state = await readRenderState(datasourceDir)
  const prevN = normalizeSlugRenderState(state.slugs[slug])
  const workspaceRenderCount =
    prevN !== undefined && prevN.displayMtimeMs === mtime ? prevN.workspaceRenderCount + 1 : 1
  if (workspaceRenderCount > MAX_ITERATIONS_PER_SCREENSHOT) {
    throw new Error(`Maximum ${MAX_ITERATIONS_PER_SCREENSHOT} workspace render iterations reached`)
  }
  const renderCount =
    prevN !== undefined && prevN.displayMtimeMs === mtime ? prevN.renderCount : 0
  state.slugs[slug] = { renderCount, displayMtimeMs: mtime, workspaceRenderCount }
  await writeRenderState(datasourceDir, state)
  return workspaceRenderCount
}

async function loadDesignerSessionForPreset(
  rootDir: string,
  datasourceDir: string,
  resolvedPresetId: string,
): Promise<{
  session: DesignerSession
  slug: string
  displayPath: string
  canvasZoom: number
  screens: number
  gap: number
}> {
  const preset = PRESET_BY_ID[resolvedPresetId]
  if (!preset) throw new Error(`Unknown presetId "${resolvedPresetId}"`)
  const displayPath = displayFilePathForPreset(datasourceDir, resolvedPresetId)
  const slug = preset.displaySlug
  const raw = await readDisplayDocumentIfExists(displayPath)
  if (raw === null) {
    return {
      session: createBlankSession(preset.width, preset.height),
      slug,
      displayPath,
      canvasZoom: 0.2,
      screens: 1,
      gap: PANEL_GAP,
    }
  }
  const loaded = await displayDocumentToSession(raw, preset.width, preset.height, rootDir)
  const design = raw.design
  let canvasZoom = 0.2
  let screens = 1
  let gap = PANEL_GAP
  if (isRecord(design)) {
    const cz = design.canvasZoom
    if (typeof cz === 'number' && Number.isFinite(cz)) canvasZoom = cz
    const cfg = design.config
    if (isRecord(cfg)) {
      const sc = cfg.screens
      const g = cfg.gap
      if (typeof sc === 'number' && Number.isFinite(sc)) screens = Math.round(sc)
      if (typeof g === 'number' && Number.isFinite(g)) gap = Math.round(g)
    }
  }
  return {
    session: {
      width: loaded.width,
      height: loaded.height,
      background: loaded.background as BackgroundConfig,
      layers: loaded.layers as Layer[],
    },
    slug,
    displayPath,
    canvasZoom,
    screens,
    gap,
  }
}

async function persistDesignerSession(
  ctx: DesignerExecuteContext,
  resolvedPresetId: string,
  session: DesignerSession,
  meta: { canvasZoom: number; screens: number; gap: number },
): Promise<{ slug: string; savedAt: string }> {
  const preset = PRESET_BY_ID[resolvedPresetId]
  if (!preset) throw new Error(`Unknown presetId "${resolvedPresetId}"`)
  const doc = sessionToDisplayDocument(
    session,
    normalizeArtboardPresetId(resolvedPresetId),
    {
      placeholderUrl: preset.placeholder,
      canvasZoom: meta.canvasZoom,
      screens: meta.screens,
      gap: meta.gap,
      buildScreenHolePath,
    },
  )
  const savedAt = String(doc.savedAt)
  await fs.mkdir(ctx.datasourceDir, { recursive: true })
  await fs.writeFile(
    displayFilePathForPreset(ctx.datasourceDir, resolvedPresetId),
    JSON.stringify(doc, null, 2),
    'utf8',
  )
  const info = { slug: preset.displaySlug, savedAt }
  ctx.onDisplayWritten?.(info)
  return info
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

export async function getScreenshotDesignerSession(
  datasourceDir: string,
  canvasSize?: string,
  presetId?: string,
  sessionArtboard?: string,
  cookieArtboard?: string,
  refererArtboard?: string,
): Promise<{
  width: number
  height: number
  presetId: string
  savedAt?: string
  displayFile?: string
}> {
  const urlResolved = resolvePresetId(
    canvasSize,
    presetId,
    sessionArtboard,
    cookieArtboard,
    refererArtboard,
  )
  const preset = PRESET_BY_ID[urlResolved]
  if (!preset) throw new Error(`Unknown presetId "${urlResolved}"`)

  const displayPath = displayFilePathForPreset(datasourceDir, urlResolved)
  const raw = await readDisplayDocumentIfExists(displayPath)
  if (raw === null) {
    return {
      width: preset.width,
      height: preset.height,
      presetId: urlResolved,
      displayFile: `display_${preset.displaySlug}.json`,
    }
  }
  const design = raw.design
  let filePresetId = urlResolved
  if (isRecord(design) && isRecord(design.config)) {
    const ap = design.config.artboardPresetId
    if (typeof ap === 'string') {
      const canon = normalizeArtboardPresetId(ap)
      if (PRESET_BY_ID[canon]) filePresetId = canon
    }
  }
  const dimPreset = PRESET_BY_ID[filePresetId] ?? preset
  const savedAt = typeof raw.savedAt === 'string' ? raw.savedAt : undefined
  return {
    width: dimPreset.width,
    height: dimPreset.height,
    presetId: filePresetId,
    savedAt,
    displayFile: `display_${dimPreset.displaySlug}.json`,
  }
}

export async function screenshotDesignerExecuteOperation(
  ctx: DesignerExecuteContext,
  operation: string,
  args: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  if (operation === 'noop') {
    return { ok: true }
  }

  const resolvedPresetId = resolvePresetId(
    ctx.canvasSize,
    ctx.presetId,
    ctx.sessionArtboard,
    ctx.cookieArtboard,
    ctx.refererArtboard,
  )
  const loaded = await loadDesignerSessionForPreset(
    ctx.rootDir,
    ctx.datasourceDir,
    resolvedPresetId,
  )
  const session = loaded.session
  const meta = { canvasZoom: loaded.canvasZoom, screens: loaded.screens, gap: loaded.gap }

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
      await persistDesignerSession(ctx, resolvedPresetId, session, meta)
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

      // Extract packId from framePath: /device-frames/<packId>/frame/<style>.svg
      const pathParts = framePath.split('/').filter(Boolean)
      const packId = pathParts[1] ?? ''

      // Read frame.json to get viewWidth/viewHeight, corners, clipRadii, homography
      let viewWidth = 0
      let viewHeight = 0
      let corners: CornerData = { TL: [0, 0], TR: [0, 0], BR: [0, 0], BL: [0, 0] }
      let clipRadii: RadiiData | null = null
      let homography = false

      try {
        const frameJsonPath = path.join(ctx.rootDir, 'public', 'device-frames', packId, 'frame.json')
        const raw = await fs.readFile(frameJsonPath, 'utf8')
        const parsed = JSON.parse(raw) as { frames: Array<{
          name: string; viewWidth: number; viewHeight: number
          corners: CornerData; clipCornerRadiiPx?: RadiiData; homography?: boolean
        }> }
        const entry = parsed.frames.find((f) => f.name === frameName)
        if (entry) {
          viewWidth = entry.viewWidth
          viewHeight = entry.viewHeight
          corners = entry.corners
          clipRadii = entry.clipCornerRadiiPx ?? null
          homography = entry.homography ?? false
        }
      } catch {
        // fall back to sharp dimensions if frame.json is unreadable
      }

      // Fall back to sharp if frame.json didn't supply dimensions
      if (viewWidth <= 0 || viewHeight <= 0) {
        const resolved = await resolveImagePath(ctx.rootDir, framePath)
        const meta = await sharp(resolved).metadata()
        viewWidth = meta.width ?? 0
        viewHeight = meta.height ?? 0
        if (viewWidth <= 0 || viewHeight <= 0) {
          throw new Error('Unable to read frame dimensions')
        }
      }

      const id = randomUUID()
      const width = Math.round(viewWidth * scale)
      const height = Math.round(viewHeight * scale)
      const layer: DeviceFrameLayer = {
        id,
        kind: 'device_frame',
        framePath,
        frameName,
        packId,
        x,
        y,
        width,
        height,
        scale,
        viewWidth,
        viewHeight,
        corners,
        clipRadii,
        homography,
        zIndex: Z_INDEX.deviceFrame,
      }
      session.layers.push(layer)
      await persistDesignerSession(ctx, resolvedPresetId, session, meta)
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
      await persistDesignerSession(ctx, resolvedPresetId, session, meta)
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
      await persistDesignerSession(ctx, resolvedPresetId, session, meta)
      return { ok: true, layer_id: layer.id, x: layer.x, y: layer.y }
    }

    case 'render_preview': {
      try {
        await fs.stat(loaded.displayPath)
      } catch {
        await persistDesignerSession(ctx, resolvedPresetId, session, meta)
      }
      const iteration = await bumpRenderPreviewIteration(
        ctx.datasourceDir,
        loaded.slug,
        loaded.displayPath,
      )
      const png = await renderSessionPng(ctx.rootDir, session)
      const checks = qualityChecks(session)
      return {
        ok: true,
        image_base64: png.toString('base64'),
        checks,
        iteration,
      }
    }

    case 'render_workspace_preview': {
      try {
        await fs.stat(loaded.displayPath)
      } catch {
        await persistDesignerSession(ctx, resolvedPresetId, session, meta)
      }
      const iteration = await bumpWorkspaceRenderPreviewIteration(
        ctx.datasourceDir,
        loaded.slug,
        loaded.displayPath,
      )
      const { width: wsW, height: wsH } = workspaceStripPixelSize(
        session.width,
        session.height,
        loaded.screens,
        loaded.gap,
      )
      const png = await renderSessionPngAtSize(ctx.rootDir, session, wsW, wsH)
      return {
        ok: true,
        image_base64: png.toString('base64'),
        checks: {
          ok: true,
          errors: [] as string[],
          contrastIssues: [] as ContrastIssue[],
          workspacePreview: true,
        },
        iteration,
        workspaceWidth: wsW,
        workspaceHeight: wsH,
        panelWidth: session.width,
        panelHeight: session.height,
        screens: loaded.screens,
        gap: loaded.gap,
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

    default:
      throw new Error(`Unknown operation "${operation}"`)
  }
}

// Build SVG path commands for the screen hole.
// Corners are in frame SVG space (origin = top-left of SVG).
// Output is in image-local space (origin = center of image).
function buildScreenHolePath(
  corners: CornerData,
  radii: RadiiData | null,
  viewWidth: number,
  viewHeight: number,
): unknown[][] {
  const hw = viewWidth / 2
  const hh = viewHeight / 2
  const pts: [number, number][] = [
    [corners.TL[0] - hw, corners.TL[1] - hh],
    [corners.TR[0] - hw, corners.TR[1] - hh],
    [corners.BR[0] - hw, corners.BR[1] - hh],
    [corners.BL[0] - hw, corners.BL[1] - hh],
  ]
  const r = radii ? [radii.tl, radii.tr, radii.br, radii.bl] : [0, 0, 0, 0]
  const n = 4
  const cmds: unknown[][] = []

  for (let i = 0; i < n; i++) {
    const prev = pts[(i - 1 + n) % n]!
    const curr = pts[i]!
    const next = pts[(i + 1) % n]!
    const ri = r[i] ?? 0

    if (ri <= 0) {
      cmds.push(i === 0 ? ['M', curr[0], curr[1]] : ['L', curr[0], curr[1]])
      continue
    }

    const dx1 = curr[0] - prev[0], dy1 = curr[1] - prev[1]
    const len1 = Math.sqrt(dx1 * dx1 + dy1 * dy1)
    const dx2 = next[0] - curr[0], dy2 = next[1] - curr[1]
    const len2 = Math.sqrt(dx2 * dx2 + dy2 * dy2)

    const inX = curr[0] - (dx1 / len1) * ri
    const inY = curr[1] - (dy1 / len1) * ri
    const outX = curr[0] + (dx2 / len2) * ri
    const outY = curr[1] + (dy2 / len2) * ri

    cmds.push(i === 0 ? ['M', inX, inY] : ['L', inX, inY])
    cmds.push(['Q', curr[0], curr[1], outX, outY])
  }

  cmds.push(['Z'])
  return cmds
}

/** Round-trip current on-disk design for a preset (refreshes `savedAt`, notifies SSE). */
export async function saveDisplayDocument(
  datasourceDir: string,
  rootDir: string,
  presetId?: string,
  opts?: { onDisplayWritten?: DesignerExecuteContext['onDisplayWritten'] },
): Promise<{ file: string }> {
  const resolvedPresetId =
    presetId && PRESET_BY_ID[presetId] ? presetId : DEFAULT_PRESET_ID
  const preset = PRESET_BY_ID[resolvedPresetId]
  if (!preset) throw new Error(`Unknown presetId "${resolvedPresetId}"`)
  const loaded = await loadDesignerSessionForPreset(rootDir, datasourceDir, resolvedPresetId)
  const ctx: DesignerExecuteContext = {
    rootDir,
    datasourceDir,
    onDisplayWritten: opts?.onDisplayWritten,
  }
  await persistDesignerSession(ctx, resolvedPresetId, loaded.session, {
    canvasZoom: loaded.canvasZoom,
    screens: loaded.screens,
    gap: loaded.gap,
  })
  return { file: `display_${preset.displaySlug}.json` }
}
