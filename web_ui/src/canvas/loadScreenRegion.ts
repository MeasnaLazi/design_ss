/**
 * Loads the `#screen` path from a device-frame SVG and returns the 4 corner
 * points of its bounding box plus the raw path data for use as a Fabric clip.
 *
 * The bounding box is computed by briefly mounting the path in the live document
 * and calling `getBBox()` — the only reliable way to handle arbitrary path shapes
 * (curves, compound paths, etc.) without a full SVG path parser.
 */

import type { ScreenQuad } from '../constants/deviceFrame'

export type ScreenRegion = {
  /** Top-left corner in SVG viewBox coordinates */
  tl: readonly [number, number]
  /** Top-right corner in SVG viewBox coordinates */
  tr: readonly [number, number]
  /** Bottom-left corner in SVG viewBox coordinates */
  bl: readonly [number, number]
  /** Bottom-right corner in SVG viewBox coordinates */
  br: readonly [number, number]
  /** SVG viewBox width */
  viewW: number
  /** SVG viewBox height */
  viewH: number
  /** Raw `d` attribute of the `#screen` path, for use as a Fabric clip path */
  pathD: string
}

const cache = new Map<string, ScreenRegion>()
const quadCache = new Map<string, ScreenQuad>()

/** One frame angle entry merged from device manifest JSON under public/device-frames. */
export type ScreenQuadConfigEntry = {
  framePath: string
  /**
   * When `false`, this frame uses the rectangular pipeline (`loadScreenRegion` + exact `#screen` path clip),
   * not WebGL homography. Omit or `true` for iso / perspective quads.
   */
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

let screenQuadConfigCache: ScreenQuadConfigEntry[] = []

/**
 * Replaces merged quad config (all device manifests). Clears in-memory quad cache so
 * corners re-resolve after a registry reload.
 */
export function setScreenQuadConfigCache(rows: ScreenQuadConfigEntry[]): void {
  screenQuadConfigCache = rows
  quadCache.clear()
}

function normalizeFramePath(svgUrl: string): string {
  try {
    const asUrl = new URL(svgUrl, window.location.origin)
    return asUrl.pathname
  } catch {
    return svgUrl
  }
}

function getScreenQuadConfigRows(): ScreenQuadConfigEntry[] {
  return screenQuadConfigCache
}

export async function loadScreenRegion(svgUrl: string): Promise<ScreenRegion> {
  const cached = cache.get(svgUrl)
  if (cached) return cached

  const text = await fetch(svgUrl).then((r) => {
    if (!r.ok) throw new Error(`[loadScreenRegion] fetch failed: ${svgUrl} (${r.status})`)
    return r.text()
  })

  const doc = new DOMParser().parseFromString(text, 'image/svg+xml')
  const svgEl = doc.documentElement

  // Parse viewBox
  const vbParts = svgEl.getAttribute('viewBox')?.split(/[\s,]+/).map(Number)
  const viewW = vbParts?.[2] ?? parseFloat(svgEl.getAttribute('width') ?? '0')
  const viewH = vbParts?.[3] ?? parseFloat(svgEl.getAttribute('height') ?? '0')
  if (!viewW || !viewH) throw new Error(`[loadScreenRegion] could not read viewBox from ${svgUrl}`)

  const screenEl = doc.getElementById('screen')
  if (!screenEl) throw new Error(`[loadScreenRegion] no element with id="screen" in ${svgUrl}`)

  const pathD = screenEl.getAttribute('d')
  if (!pathD) throw new Error(`[loadScreenRegion] #screen has no "d" attribute in ${svgUrl}`)

  // Mount a temporary SVG in the live document to call getBBox()
  const NS = 'http://www.w3.org/2000/svg'
  const tmpSvg = document.createElementNS(NS, 'svg') as SVGSVGElement
  tmpSvg.setAttribute('viewBox', `0 0 ${viewW} ${viewH}`)
  tmpSvg.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;visibility:hidden;pointer-events:none'

  const tmpPath = document.createElementNS(NS, 'path') as SVGPathElement
  tmpPath.setAttribute('d', pathD)
  tmpSvg.appendChild(tmpPath)
  document.body.appendChild(tmpSvg)

  let bbox: DOMRect
  try {
    bbox = tmpPath.getBBox()
  } finally {
    document.body.removeChild(tmpSvg)
  }

  const region: ScreenRegion = {
    tl: [bbox.x, bbox.y],
    tr: [bbox.x + bbox.width, bbox.y],
    bl: [bbox.x, bbox.y + bbox.height],
    br: [bbox.x + bbox.width, bbox.y + bbox.height],
    viewW,
    viewH,
    pathD,
  }

  cache.set(svgUrl, region)
  return region
}

/**
 * Parses the `#screen` path from an isometric device-frame SVG and returns a
 * {@link ScreenQuad} with the 4 corner points of the parallelogram screen face.
 *
 * The `#screen` path **must** be a simple 4-point polygon (`M x y L x y L x y L x y Z`)
 * with no curves. Points are interpreted in SVG viewBox coordinates as:
 * TL → TR → BR → BL (the natural clockwise order of the `d` attribute).
 *
 * Throws if the path is missing or is not a simple polygon.
 */
export async function loadScreenQuad(svgUrl: string): Promise<ScreenQuad> {
  const cached = quadCache.get(svgUrl)
  if (cached) return cached

  const normalizedPath = normalizeFramePath(svgUrl)
  const configRows = getScreenQuadConfigRows()
  const configMatch = configRows.find((row) => normalizeFramePath(row.framePath) === normalizedPath)

  const text = await fetch(svgUrl).then((r) => {
    if (!r.ok) throw new Error(`[loadScreenQuad] fetch failed: ${svgUrl} (${r.status})`)
    return r.text()
  })

  const doc = new DOMParser().parseFromString(text, 'image/svg+xml')
  const svgEl = doc.documentElement

  const vbParts = svgEl.getAttribute('viewBox')?.split(/[\s,]+/).map(Number)
  const viewW = vbParts?.[2] ?? parseFloat(svgEl.getAttribute('width') ?? '0')
  const viewH = vbParts?.[3] ?? parseFloat(svgEl.getAttribute('height') ?? '0')
  if (!viewW || !viewH) throw new Error(`[loadScreenQuad] could not read viewBox from ${svgUrl}`)

  const screenEl = doc.getElementById('screen')
  if (!screenEl) throw new Error(`[loadScreenQuad] no element with id="screen" in ${svgUrl}`)

  const pathD = screenEl.getAttribute('d')
  if (!pathD) throw new Error(`[loadScreenQuad] #screen has no "d" attribute in ${svgUrl}`)

  if (configMatch) {
    if (configMatch.homography === false) {
      throw new Error(`[loadScreenQuad] homography disabled for ${normalizedPath}`)
    }
    const quad: ScreenQuad = {
      tl: configMatch.corners.TL,
      tr: configMatch.corners.TR,
      br: configMatch.corners.BR,
      bl: configMatch.corners.BL,
      viewW,
      viewH,
      pathD,
      clipCornerRadiusPx: configMatch.clipCornerRadiusPx,
      clipCornerRadiiPx: configMatch.clipCornerRadiiPx,
    }
    quadCache.set(svgUrl, quad)
    return quad
  }

  throw new Error(`[loadScreenQuad] no manual quad config found for ${normalizedPath}`)
}
