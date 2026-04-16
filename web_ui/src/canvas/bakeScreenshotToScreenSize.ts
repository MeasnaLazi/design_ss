import {
  DEVICE_FRAME_FRONT,
  getScreenshotBakeDimensions,
  type DeviceFrameMetrics,
  type ScreenQuad,
} from '../constants/deviceFrame'
import type { ScreenRegion } from './loadScreenRegion'

function readFileDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader()
    fr.onload = () => resolve(fr.result as string)
    fr.onerror = () => reject(fr.error ?? new Error('read failed'))
    fr.readAsDataURL(file)
  })
}

function loadImageFromDataUrl(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('image decode failed'))
    img.src = dataUrl
  })
}

/**
 * Draw `source` with object-fit **cover** into a fixed bitmap, using high-quality smoothing.
 * Output is PNG (lossless) so UI text stays crisp after one resample.
 */
function renderCoverToPngDataUrl(
  source: CanvasImageSource,
  natW: number,
  natH: number,
  outW: number,
  outH: number,
  heightAdjustY: number,
): string {
  const canvas = document.createElement('canvas')
  const ADJUSTMENT_Y = heightAdjustY
  canvas.width = outW
  canvas.height = outH
  const ctx = canvas.getContext('2d', { alpha: true, colorSpace: 'srgb' })
  if (!ctx) {
    throw new Error('2D canvas context unavailable')
  }
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'

  const scale = Math.max(outW / natW, outH / natH)
  const dw = natW * scale
  const dh = (natH * scale) - ADJUSTMENT_Y
  const dx = (outW - dw) / 2
  const dy = ((outH - dh) / 2) + ADJUSTMENT_Y
  ctx.drawImage(source, dx, dy, dw, dh)

  return canvas.toDataURL('image/png')
}

/**
 * Resamples an uploaded screenshot to the ideal pixel size for the device style (e.g. 2241×4745 for front)
 * so on-canvas scaling matches the frame opening with minimal extra filtering.
 */
export async function bakeScreenshotFileForMetrics(
  file: File,
  metrics: DeviceFrameMetrics,
): Promise<string> {
  const { width: outW, height: outH } = getScreenshotBakeDimensions(metrics)

  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
      try {
        if (bitmap.width === outW && bitmap.height === outH) {
          return readFileDataUrl(file)
        }
        return renderCoverToPngDataUrl(
          bitmap,
          bitmap.width,
          bitmap.height,
          outW,
          outH,
          heightAdjustForMetrics(metrics),
        )
      } finally {
        bitmap.close()
      }
    } catch {
      // Fall through to Image() path (e.g. unsupported type)
    }
  }

  const dataUrl = await readFileDataUrl(file)
  const img = await loadImageFromDataUrl(dataUrl)
  const natW = img.naturalWidth || 1
  const natH = img.naturalHeight || 1
  if (natW === outW && natH === outH) {
    return dataUrl
  }
  return renderCoverToPngDataUrl(img, natW, natH, outW, outH, heightAdjustForMetrics(metrics))
}

function heightAdjustForMetrics(m: DeviceFrameMetrics): number {
  return m.viewW === DEVICE_FRAME_FRONT.viewW && m.viewH === DEVICE_FRAME_FRONT.viewH ? 36 : 20
}

/**
 * Warps a screenshot into a parallelogram defined by {@link ScreenQuad} using a canvas 2D affine
 * transform, producing a PNG the same size as the SVG viewBox (quad.viewW × quad.viewH).
 *
 * The affine maps source rect (0,0)→(natW,natH) onto the quad:
 *   (0,0)   → TL
 *   (natW,0) → TR
 *   (0,natH) → BL
 */
export async function bakeScreenshotToQuad(file: File, quad: ScreenQuad): Promise<string> {
  const outW = quad.viewW
  const outH = quad.viewH

  async function warp(source: CanvasImageSource, natW: number, natH: number): Promise<string> {
    const canvas = document.createElement('canvas')
    canvas.width = outW
    canvas.height = outH
    const ctx = canvas.getContext('2d', { alpha: true, colorSpace: 'srgb' })
    if (!ctx) throw new Error('2D canvas context unavailable')
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'

    const [tlx, tly] = quad.tl
    const [trx, try_] = quad.tr
    const [blx, bly] = quad.bl

    const a = (trx - tlx) / natW
    const b = (try_ - tly) / natW
    const c = (blx - tlx) / natH
    const d = (bly - tly) / natH

    ctx.setTransform(a, b, c, d, tlx, tly)
    ctx.drawImage(source, 0, 0, natW, natH)
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    return canvas.toDataURL('image/png')
  }

  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
      try {
        return await warp(bitmap, bitmap.width, bitmap.height)
      } finally {
        bitmap.close()
      }
    } catch {
      // fall through
    }
  }

  const dataUrl = await readFileDataUrl(file)
  const img = await loadImageFromDataUrl(dataUrl)
  return warp(img, img.naturalWidth || 1, img.naturalHeight || 1)
}

/**
 * Bakes a screenshot into a canvas the same size as the SVG viewBox (region.viewW × region.viewH).
 *
 * The screenshot is cover-scaled to fill the screen opening (the axis-aligned bounding box of the
 * `#screen` path) and drawn at its position within the viewBox. Pixels outside the screen area are
 * transparent — the `#screen` clip path in Fabric will reveal exactly the right region.
 *
 * Used for rectangular/front-facing frames where the screen is axis-aligned.
 */
export async function bakeScreenshotForRegion(file: File, region: ScreenRegion): Promise<string> {
  const { tl, tr, bl, viewW, viewH } = region
  const screenX = tl[0]
  const screenY = tl[1]
  const screenW = tr[0] - tl[0]
  const screenH = bl[1] - tl[1]

  async function draw(source: CanvasImageSource, natW: number, natH: number): Promise<string> {
    const canvas = document.createElement('canvas')
    canvas.width = viewW
    canvas.height = viewH
    const ctx = canvas.getContext('2d', { alpha: true, colorSpace: 'srgb' })
    if (!ctx) throw new Error('2D canvas context unavailable')
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'

    // Cover-scale: fill the screen area without distortion, centred on it
    const scale = Math.max(screenW / natW, screenH / natH)
    const dw = natW * scale
    const dh = natH * scale
    const dx = screenX + (screenW - dw) / 2
    const dy = screenY + (screenH - dh) / 2
    ctx.drawImage(source, dx, dy, dw, dh)
    return canvas.toDataURL('image/png')
  }

  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
      try {
        return await draw(bitmap, bitmap.width, bitmap.height)
      } finally {
        bitmap.close()
      }
    } catch {
      // fall through to Image() path
    }
  }

  const dataUrl = await readFileDataUrl(file)
  const img = await loadImageFromDataUrl(dataUrl)
  return draw(img, img.naturalWidth || 1, img.naturalHeight || 1)
}
