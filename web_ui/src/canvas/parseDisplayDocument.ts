import { normalizeArtboardPresetId } from '../constants/artboardPresets'
import type { DesignConfig, DesignObjectRecord } from '../store/designTypes'
import type { DisplayDesignSnapshot, DisplayDocumentV1 } from '../types/displayDocument'
import { DISPLAY_DOCUMENT_VERSION } from '../types/displayDocument'

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x)
}

function isDesignConfigShape(x: unknown): boolean {
  if (!isRecord(x)) return false
  return (
    (x.artboardPresetId === undefined || typeof x.artboardPresetId === 'string') &&
    typeof x.screens === 'number' &&
    typeof x.gap === 'number' &&
    typeof x.background === 'string' &&
    (x.backgroundMode === 'solid' || x.backgroundMode === 'gradient') &&
    isRecord(x.backgroundGradient) &&
    typeof (x.backgroundGradient as { colorFrom?: unknown }).colorFrom === 'string' &&
    typeof (x.backgroundGradient as { colorTo?: unknown }).colorTo === 'string' &&
    typeof (x.backgroundGradient as { angleDeg?: unknown }).angleDeg === 'number' &&
    (x.backgroundImageUrl === null || typeof x.backgroundImageUrl === 'string')
  )
}

function isDesignObjectRecord(x: unknown): x is DesignObjectRecord {
  if (!isRecord(x)) return false
  const kind = x.kind
  if (
    typeof x.id !== 'string' ||
    typeof x.name !== 'string' ||
    typeof x.zIndex !== 'number' ||
    (kind !== 'text' &&
      kind !== 'image' &&
      kind !== 'device' &&
      kind !== 'shape' &&
      kind !== 'group')
  ) {
    return false
  }
  if (x.deviceFrameStyleId !== undefined && typeof x.deviceFrameStyleId !== 'string') {
    return false
  }
  return true
}

export function parseDisplayDocument(raw: unknown): DisplayDocumentV1 {
  if (!isRecord(raw)) {
    throw new Error('Display document must be a JSON object')
  }
  if (raw.version !== DISPLAY_DOCUMENT_VERSION) {
    throw new Error(`Unsupported display document version: ${String(raw.version)}`)
  }
  if (typeof raw.savedAt !== 'string') {
    throw new Error('Display document missing savedAt')
  }
  if (!isRecord(raw.design)) {
    throw new Error('Display document missing design')
  }
  const { design } = raw
  if (!isDesignConfigShape(design.config)) {
    throw new Error('Display document has invalid design.config')
  }
  if (!Array.isArray(design.objects) || !design.objects.every(isDesignObjectRecord)) {
    throw new Error('Display document has invalid design.objects')
  }
  if (typeof design.canvasZoom !== 'number' || !Number.isFinite(design.canvasZoom)) {
    throw new Error('Display document has invalid design.canvasZoom')
  }
  if (!Array.isArray(raw.fabricObjects)) {
    throw new Error('Display document missing fabricObjects array')
  }

  const rawCfg = design.config as Record<string, unknown>
  const snapshot: DisplayDesignSnapshot = {
    config: {
      ...(design.config as DesignConfig),
      artboardPresetId: normalizeArtboardPresetId(
        typeof rawCfg.artboardPresetId === 'string' ? rawCfg.artboardPresetId : undefined,
      ),
    },
    objects: design.objects,
    canvasZoom: design.canvasZoom,
  }

  return {
    version: DISPLAY_DOCUMENT_VERSION,
    savedAt: raw.savedAt,
    design: snapshot,
    fabricObjects: raw.fabricObjects as Record<string, unknown>[],
  }
}
