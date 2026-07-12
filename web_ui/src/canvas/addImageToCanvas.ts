import { FabricImage, type Canvas } from 'fabric'

import { getArtboardDimensionsFromConfig, screenshotBucketForConfig } from '../constants/artboardPresets'
import { screenExportRect } from '../constants/appStoreScreens'
import { uploadScreenshotFile } from '../lib/datasourceScreenshotsApi'
import { registerFabricObjectId } from '../lib/fabricObjectRegistry'
import { useDesignStore } from '../store/useDesignStore'
import { useToastStore } from '../store/useToastStore'

export type AddImageToCanvasOptions = {
  left?: number
  top?: number
  /** 0-based panel column to center within when `left`/`top` are omitted. */
  panelIndex?: number
  layerName?: string
  /**
   * Exact display width in document px (uniform scale from natural size).
   * Overrides the default 85%-panel fit clamp — used by the agent
   * `add_image` op / composer importer for pixel-exact placement.
   */
  targetWidth?: number
}

function layerNameFromFilename(filename: string): string {
  const base = filename.replace(/\.[^.]+$/, '').trim()
  return base.length > 0 ? base : 'Image'
}

async function resolveImageUrl(file: File): Promise<string> {
  const readDataUrl = (): Promise<string> =>
    new Promise((resolve, reject) => {
      const fr = new FileReader()
      fr.onload = () => {
        const url = typeof fr.result === 'string' ? fr.result : ''
        if (url) resolve(url)
        else reject(new Error('Could not read image file'))
      }
      fr.onerror = () => reject(new Error('Could not read image file'))
      fr.readAsDataURL(file)
    })

  try {
    const bucket = screenshotBucketForConfig(useDesignStore.getState().config)
    return await uploadScreenshotFile(file, { bucket })
  } catch {
    useToastStore
      .getState()
      .showToast(
        'Saved as embedded image; dev server required to store under datasource.',
        'warning',
      )
    return readDataUrl()
  }
}

function fitImageOnPanel(
  img: FabricImage,
  panelIndex: number,
  gap: number,
  panelW: number,
  panelH: number,
): void {
  const panel = screenExportRect(panelIndex, gap, panelW, panelH)
  const natW = img.width || 1
  const natH = img.height || 1
  const maxW = panelW * 0.85
  const maxH = panelH * 0.85
  const scale = Math.min(1, maxW / natW, maxH / natH)
  img.set({
    originX: 'left',
    originY: 'top',
    scaleX: scale,
    scaleY: scale,
  })
  const scaledW = img.getScaledWidth()
  const scaledH = img.getScaledHeight()
  img.set({
    left: panel.left + (panel.width - scaledW) / 2,
    top: panel.top + (panel.height - scaledH) / 2,
  })
}

/**
 * Adds a user image layer from an uploaded file (datasource URL or embedded data URL fallback).
 */
export async function addImageToCanvasFromFile(
  canvas: Canvas,
  file: File,
  options?: AddImageToCanvasOptions,
): Promise<void> {
  const url = await resolveImageUrl(file)
  await addImageToCanvasFromUrl(canvas, url, {
    ...options,
    layerName: options?.layerName ?? layerNameFromFilename(file.name),
  })
}

/**
 * Adds a user image layer from a URL (same-origin path or `data:` URL).
 */
export async function addImageToCanvasFromUrl(
  canvas: Canvas,
  url: string,
  options?: AddImageToCanvasOptions,
): Promise<void> {
  const crossOrigin = url.startsWith('data:') || url.startsWith('blob:') ? undefined : 'anonymous'
  const img = await FabricImage.fromURL(
    url,
    crossOrigin ? { crossOrigin } : undefined,
    {
      originX: 'left',
      originY: 'top',
    },
  )

  const cfg = useDesignStore.getState().config
  const { width: panelW, height: panelH } = getArtboardDimensionsFromConfig(cfg)
  const gap = cfg.gap
  let panelIndex = options?.panelIndex ?? 0
  if (!Number.isInteger(panelIndex) || panelIndex < 0) panelIndex = 0
  if (panelIndex >= Math.max(1, cfg.screens)) {
    panelIndex = Math.max(0, cfg.screens - 1)
  }

  if (options?.left != null && options?.top != null) {
    const natW = img.width || 1
    const natH = img.height || 1
    let scale: number
    if (options.targetWidth != null && Number.isFinite(options.targetWidth) && options.targetWidth > 0) {
      scale = options.targetWidth / natW
    } else {
      const maxW = panelW * 0.85
      const maxH = panelH * 0.85
      scale = Math.min(1, maxW / natW, maxH / natH)
    }
    img.set({
      left: options.left,
      top: options.top,
      scaleX: scale,
      scaleY: scale,
    })
  } else {
    fitImageOnPanel(img, panelIndex, gap, panelW, panelH)
  }

  const id = crypto.randomUUID()
  registerFabricObjectId(img, id)

  const zIndex =
    useDesignStore.getState().objects.reduce((m, o) => Math.max(m, o.zIndex), -1) + 1

  useDesignStore.getState().upsertObject({
    id,
    kind: 'image',
    name: options?.layerName ?? 'Image',
    zIndex,
  })

  canvas.add(img)
  canvas.setActiveObject(img)
  img.setCoords()
  canvas.requestRenderAll()
  useDesignStore.getState().setSelectedObject(id)

  console.log('[addImageToCanvas] added image layer', { id, url: url.slice(0, 80) })
}
