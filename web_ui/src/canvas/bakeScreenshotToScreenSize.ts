import {
  DEVICE_FRAME_FRONT,
  getScreenshotBakeDimensions,
  type DeviceFrameMetrics,
} from '../constants/deviceFrame'

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
