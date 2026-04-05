import { Canvas, Line, type FabricObject } from 'fabric'
import JSZip from 'jszip'
import { screenExportRect } from '../constants/appStoreScreens'

function isScreenGuideLine(o: FabricObject): o is Line {
  return o instanceof Line && o.excludeFromExport === true
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

/**
 * Hides guide lines, exports each screen slice at App Store pixel size, zips PNGs, then restores the canvas.
 */
export async function exportAppStoreScreensToZip(
  canvas: Canvas,
  screens: number,
  gap: number,
): Promise<void> {
  console.log('[export] start', { screens, gap })

  const guides = canvas.getObjects().filter(isScreenGuideLine)
  const prevVisible = guides.map((g) => g.visible)
  const prevActive = canvas.getActiveObject() ?? undefined

  guides.forEach((g) => g.set('visible', false))
  canvas.discardActiveObject()
  canvas.requestRenderAll()

  try {
    const zip = new JSZip()

    for (let i = 0; i < screens; i++) {
      const { left, top, width, height } = screenExportRect(i, gap)
      console.log('[export] slice', i + 1, { left, top, width, height })

      const dataUrl = canvas.toDataURL({
        format: 'png',
        multiplier: 1,
        left,
        top,
        width,
        height,
        enableRetinaScaling: false,
      })

      const comma = dataUrl.indexOf(',')
      const base64 = comma >= 0 ? dataUrl.slice(comma + 1) : ''
      if (!base64) throw new Error('Empty export data URL')

      zip.file(`screen-${String(i + 1).padStart(2, '0')}.png`, base64, {
        base64: true,
      })
    }

    const blob = await zip.generateAsync({ type: 'blob' })
    downloadBlob(blob, `app-store-screens-${screens}up.zip`)
    console.log('[export] zip downloaded')
  } finally {
    guides.forEach((g, idx) => g.set('visible', prevVisible[idx] ?? true))
    if (prevActive) {
      try {
        canvas.setActiveObject(prevActive)
      } catch (e) {
        console.warn('[export] could not restore selection', e)
      }
    }
    canvas.requestRenderAll()
    console.log('[export] guides and selection restored')
  }
}
