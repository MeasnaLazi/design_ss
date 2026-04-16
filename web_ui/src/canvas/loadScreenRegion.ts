/**
 * Loads the `#screen` path from a device-frame SVG and returns the 4 corner
 * points of its bounding box plus the raw path data for use as a Fabric clip.
 *
 * The bounding box is computed by briefly mounting the path in the live document
 * and calling `getBBox()` — the only reliable way to handle arbitrary path shapes
 * (curves, compound paths, etc.) without a full SVG path parser.
 */

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
