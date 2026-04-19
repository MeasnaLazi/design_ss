import type { ScreenQuadConfigEntry } from '../canvas/loadScreenRegion'

/** Used when the registry is empty or a style cannot be resolved (matches default pack `front.svg`). */
export const DEVICE_FRAME_FALLBACK_SRC = '/device-frames/iphone_12_pro/frame/front.svg' as const

/** Default `frames[].name` (re-exported as `DEFAULT_DEVICE_FRAME_STYLE_ID` from deviceFrameStyles). */
export const DEFAULT_DEVICE_FRAME_ANGLE_ID = 'front' as const

export const DEVICE_FRAME_TYPES = ['iphone', 'ipad', 'phone', 'tablet'] as const
export type DeviceFrameType = (typeof DEVICE_FRAME_TYPES)[number]

/** One entry in a device manifest `frames` array — same shape as a quad row plus `name`. */
type DeviceFrameManifestFrame = { name: string } & ScreenQuadConfigEntry

type DeviceFrameManifest = {
  type: DeviceFrameType
  name: string
  frames: DeviceFrameManifestFrame[]
}

export type DeviceFrameStyle = {
  id: string
  label: string
  src: string
}

export type CatalogDevice = {
  /** Folder id under `public/device-frames/`, e.g. `iphone_12_pro` */
  id: string
  manifestUrl: string
  manifest: DeviceFrameManifest
}

const INDEX_URL = '/device-frames/index.json'

function frameNameToLabel(name: string): string {
  return name
    .split(/[-_]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ')
}

export const FALLBACK_DEVICE_FRAME_STYLE: DeviceFrameStyle = {
  id: DEFAULT_DEVICE_FRAME_ANGLE_ID,
  label: frameNameToLabel(DEFAULT_DEVICE_FRAME_ANGLE_ID),
  src: DEVICE_FRAME_FALLBACK_SRC,
}

function normalizeAssetPath(p: string): string {
  if (!p) return p
  return p.startsWith('/') ? p : `/${p}`
}

function stylesFromManifest(m: DeviceFrameManifest): DeviceFrameStyle[] {
  return m.frames.map((f) => ({
    id: f.name,
    label: frameNameToLabel(f.name),
    src: normalizeAssetPath(f.framePath),
  }))
}

export function activePackStyles(devices: CatalogDevice[], packId: string | null): DeviceFrameStyle[] {
  if (!packId) return []
  const dev = devices.find((d) => d.id === packId)
  return dev ? stylesFromManifest(dev.manifest) : []
}

function normalizeDeviceFrameType(raw: string | undefined): DeviceFrameType {
  const t = (raw ?? '').toLowerCase()
  if ((DEVICE_FRAME_TYPES as readonly string[]).includes(t)) return t as DeviceFrameType
  return 'phone'
}

/** Derive pack folder id from `/device-frames/<pack>/frame.json`. */
function packIdFromManifestUrl(manifestUrl: string): string {
  try {
    const u = new URL(manifestUrl, 'http://localhost')
    const parts = u.pathname.replace(/^\/+|\/+$/g, '').split('/')
    if (parts.length >= 2 && parts[0] === 'device-frames') {
      return parts[1]
    }
  } catch {
    /* ignore */
  }
  const cleaned = manifestUrl.replace(/^\/+/, '').split('/')
  return cleaned.length >= 2 ? cleaned[1] : 'device'
}

function manifestFramesToQuadRows(frames: DeviceFrameManifestFrame[]): ScreenQuadConfigEntry[] {
  return frames.map(({ name: _omitName, ...row }) => ({
    ...row,
    framePath: normalizeAssetPath(row.framePath),
  }))
}

type DeviceFrameIndexFile = {
  manifests?: string[]
}

async function fetchDeviceFrameIndex(): Promise<string[]> {
  const res = await fetch(INDEX_URL)
  if (!res.ok) throw new Error(`[deviceFrameCatalog] ${INDEX_URL} (${res.status})`)
  const json = (await res.json()) as DeviceFrameIndexFile
  const list = json.manifests ?? []
  return list.filter((u): u is string => typeof u === 'string' && u.length > 0)
}

async function fetchDeviceManifest(manifestUrl: string): Promise<DeviceFrameManifest> {
  const res = await fetch(manifestUrl)
  if (!res.ok) throw new Error(`[deviceFrameCatalog] ${manifestUrl} (${res.status})`)
  const json = (await res.json()) as Record<string, unknown>
  if (!json || typeof json.name !== 'string' || !Array.isArray(json.frames)) {
    throw new Error(`[deviceFrameCatalog] invalid manifest: ${manifestUrl}`)
  }
  const frames = json.frames as DeviceFrameManifestFrame[]
  for (const fr of frames) {
    if (!fr || typeof fr.name !== 'string' || typeof fr.framePath !== 'string' || !fr.corners) {
      throw new Error(`[deviceFrameCatalog] invalid frame entry in ${manifestUrl}`)
    }
  }
  return {
    name: json.name,
    type: normalizeDeviceFrameType(typeof json.type === 'string' ? json.type : undefined),
    frames,
  }
}

/** Loads all manifests from `index.json` plus merged quad rows for the screen-region loader cache. */
export async function loadDeviceFrameRegistry(): Promise<{
  devices: CatalogDevice[]
  quadConfigRows: ScreenQuadConfigEntry[]
}> {
  const urls = await fetchDeviceFrameIndex()
  const devices: CatalogDevice[] = []
  for (const url of urls) {
    const manifest = await fetchDeviceManifest(url)
    devices.push({
      id: packIdFromManifestUrl(url),
      manifestUrl: url,
      manifest,
    })
  }
  const quadConfigRows = devices.flatMap((d) => manifestFramesToQuadRows(d.manifest.frames))
  return { devices, quadConfigRows }
}

export function resolveDeviceFrameStyle(
  packId: string | undefined,
  styleId: string | undefined,
  catalog: CatalogDevice[],
  fallbackPackId: string | undefined,
): DeviceFrameStyle {
  if (catalog.length === 0) return FALLBACK_DEVICE_FRAME_STYLE

  const preferPack =
    (packId && catalog.some((d) => d.id === packId) ? packId : null) ??
    (fallbackPackId && catalog.some((d) => d.id === fallbackPackId) ? fallbackPackId : null) ??
    catalog[0].id

  const device = catalog.find((d) => d.id === preferPack) ?? catalog[0]
  const styles = stylesFromManifest(device.manifest)
  const sid = styleId ?? DEFAULT_DEVICE_FRAME_ANGLE_ID
  const found = styles.find((s) => s.id === sid)
  if (found) return found
  return styles[0] ?? FALLBACK_DEVICE_FRAME_STYLE
}
