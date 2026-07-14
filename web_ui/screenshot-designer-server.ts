import { ARTBOARD_PRESET_ID_LEGACY, normalizeArtboardPresetId } from './src/constants/artboardPresets'
import {
  displayFilePathForPreset,
  readDisplayDocumentIfExists,
} from './display-designer-session'

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
  'add_image',
  'apply_screenshot_to_device',
  'clear_user_layers',
  'add_text',
  'align',
  'move_layer',
  'text_font_size_delta',
  'text_set_font_size',
  'text_set_font_style',
  'text_set_color',
  'text_set_content',
  'text_set_line_height',
  'text_set_letter_spacing',
  'text_auto_fit',
  'device_size_delta',
  'device_set_size',
  'device_set_position',
  'device_move_delta',
  'device_set_angle',
  'device_set_frame_style',
  'remove_layer',
  'set_z_index',
  'layer_patch',
  'layers_patch_bulk',
  'batch',
  'set_equal_spacing',
  'match_size',
  'render_panel_preview',
  'capture_panel_preview_data',
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
      `Operation "${operation}" runs in the Web UI only. Open web_ui with the designer, subscribe to GET /__api/screenshot-designer/command-events?slug=…, then POST /__api/screenshot-designer/enqueue-command (same cookies/query as before). composer/import-to-canvas.mjs drives this flow.`,
    )
  }
  throw new Error(`Unknown operation "${operation}"`)
}


