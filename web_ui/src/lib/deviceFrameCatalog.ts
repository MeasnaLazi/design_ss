import type { ScreenQuadConfigEntry } from '../canvas/loadScreenRegion'

export const DEVICE_FRAME_TYPES = ['iphone', 'ipad', 'phone', 'tablet'] as const
export type DeviceFrameType = (typeof DEVICE_FRAME_TYPES)[number]

export type DeviceFrameManifestFrame = {
  name: string
  framePath: string
  homography?: boolean
  clipCornerRadiusPx?: number
  clipCornerRadiiPx?: {
    tl?: number
    tr?: number
    br?: number
    bl?: number
  }
  corners: {
    TL: [number, number]
    TR: [number, number]
    BR: [number, number]
    BL: [number, number]
  }
}

export type DeviceFrameManifest = {
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

export function frameNameToLabel(name: string): string {
  return name
    .split(/[-_]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ')
}

function normalizeAssetPath(p: string): string {
  if (!p) return p
  return p.startsWith('/') ? p : `/${p}`
}

export function stylesFromManifest(m: DeviceFrameManifest): DeviceFrameStyle[] {
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
  return frames.map((f) => ({
    name: f.name,
    framePath: normalizeAssetPath(f.framePath),
    homography: f.homography,
    clipCornerRadiusPx: f.clipCornerRadiusPx,
    clipCornerRadiiPx: f.clipCornerRadiiPx,
    corners: f.corners,
  }))
}

export function mergeQuadRowsFromDevices(devices: CatalogDevice[]): ScreenQuadConfigEntry[] {
  const out: ScreenQuadConfigEntry[] = []
  for (const d of devices) {
    out.push(...manifestFramesToQuadRows(d.manifest.frames))
  }
  return out
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

export async function loadDeviceCatalog(): Promise<CatalogDevice[]> {
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
  return devices
}

const FALLBACK_STYLE: DeviceFrameStyle = {
  id: 'front',
  label: 'Front',
  src: '/device-frames/iphone_12_pro/frame/front.svg',
}

export function resolveDeviceFrameStyle(
  packId: string | undefined,
  styleId: string | undefined,
  catalog: CatalogDevice[],
  fallbackPackId: string | undefined,
): DeviceFrameStyle {
  if (catalog.length === 0) return FALLBACK_STYLE

  const preferPack =
    (packId && catalog.some((d) => d.id === packId) ? packId : null) ??
    (fallbackPackId && catalog.some((d) => d.id === fallbackPackId) ? fallbackPackId : null) ??
    catalog[0].id

  const device = catalog.find((d) => d.id === preferPack) ?? catalog[0]
  const styles = stylesFromManifest(device.manifest)
  const sid = styleId ?? 'front'
  const found = styles.find((s) => s.id === sid)
  if (found) return found
  return styles[0] ?? FALLBACK_STYLE
}
