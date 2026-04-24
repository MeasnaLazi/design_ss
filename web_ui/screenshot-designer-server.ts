import fs from 'node:fs/promises'

import {
  displayDocumentToSession,
  displayFilePathForPreset,
  readDisplayDocumentIfExists,
  sessionToDisplayDocument,
} from './display-designer-session'
import { ARTBOARD_PRESET_ID_LEGACY, normalizeArtboardPresetId } from './src/constants/artboardPresets'

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

const DEFAULT_PRESET_ID = 'appstore_iphone_portrait'

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

/** Display slug for `display_<slug>.json` / SSE — same resolution rules as `/execute` and `/session`. */
export function resolveDesignerDisplaySlugFromHints(h: {
  canvasSize?: string
  presetId?: string
  sessionArtboard?: string
  cookieArtboard?: string
  refererArtboard?: string
}): string {
  const resolved = resolvePresetId(
    h.canvasSize,
    h.presetId,
    h.sessionArtboard,
    h.cookieArtboard,
    h.refererArtboard,
  )
  const preset = PRESET_BY_ID[resolved]
  return preset?.displaySlug ?? PRESET_BY_ID[DEFAULT_PRESET_ID]!.displaySlug
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x)
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

const CLIENT_AUTHORITATIVE_OPERATIONS = new Set([
  'set_background',
  'add_device_frame',
  'add_text',
  'align',
  'text_font_size_delta',
  'text_set_font_size',
  'text_set_font_style',
  'text_set_color',
  'device_size_delta',
  'device_set_position',
  'device_move_delta',
  'device_set_angle',
  'render_preview',
  'render_workspace_preview',
  'export_json',
])

export async function screenshotDesignerExecuteOperation(
  _ctx: DesignerExecuteContext,
  operation: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _args: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  if (operation === 'noop') {
    return { ok: true }
  }
  if (CLIENT_AUTHORITATIVE_OPERATIONS.has(operation)) {
    throw new Error(
      `Operation "${operation}" runs in the Web UI only. Open web_ui with the designer, subscribe to GET /__api/screenshot-designer/command-events?slug=…, then POST /__api/screenshot-designer/enqueue-command (same cookies/query as before). Use: python -m agent_toolkit designer enqueue-op --operation ${operation} --args-json '…'`,
    )
  }
  throw new Error(`Unknown operation "${operation}"`)
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
