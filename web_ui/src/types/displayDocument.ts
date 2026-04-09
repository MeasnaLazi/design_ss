import type { DesignConfig, DesignObjectRecord } from '../store/designTypes'

/**
 * Design snapshot shape. Persisted per artboard as `datasource/display_<slug>.json` (see
 * `artboardPresets.ts` `displayFileSlug`), or legacy `datasource/display.json`.
 */
export const DISPLAY_DOCUMENT_VERSION = 1 as const

export interface DisplayDesignSnapshot {
  config: DesignConfig
  objects: DesignObjectRecord[]
  canvasZoom: number
}

/**
 * @example
 * ```json
 * {
 *   "version": 1,
 *   "savedAt": "2026-04-07T12:00:00.000Z",
 *   "design": {
 *     "config": {
 *       "artboardPresetId": "appstore_iphone_67",
 *       "screens": 5,
 *       "gap": 40,
 *       "background": "#1a1a1a",
 *       "backgroundMode": "solid",
 *       "backgroundGradient": { "colorFrom": "#0f172a", "colorTo": "#1e293b", "angleDeg": 135 },
 *       "backgroundImageUrl": null
 *     },
 *     "objects": [
 *       { "id": "…", "kind": "text", "name": "Text", "zIndex": 0 }
 *     ],
 *     "canvasZoom": 0.2
 *   },
 *   "fabricObjects": [
 *     { "type": "Textbox", "appObjectId": "…", "left": 120, "top": 160, … }
 *   ]
 * }
 * ```
 *
 * `design.config` includes `artboardPresetId` (defaults when missing on load). Images may use
 * `/__api/datasource/screenshots/<uuid>.png` (legacy flat) or
 * `/__api/datasource/screenshots/<artboardPresetId>/<uuid>.png` from the dev upload API.
 */
export interface DisplayDocumentV1 {
  version: typeof DISPLAY_DOCUMENT_VERSION
  savedAt: string
  design: DisplayDesignSnapshot
  /** Top-level Fabric object specs (user layers only); `appObjectId` is added by our serializer. */
  fabricObjects: Record<string, unknown>[]
}
