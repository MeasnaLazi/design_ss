import type { DesignConfig, DesignObjectRecord } from '../store/designTypes'

/** Root file written to `datasource/display.json` and portable copies. */
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
 * `design.config.backgroundImageUrl` may be a same-origin path such as
 * `/__api/datasource/screenshots/<uuid>.png` when images were stored via the Vite dev upload API.
 */
export interface DisplayDocumentV1 {
  version: typeof DISPLAY_DOCUMENT_VERSION
  savedAt: string
  design: DisplayDesignSnapshot
  /** Top-level Fabric object specs (user layers only); `appObjectId` is added by our serializer. */
  fabricObjects: Record<string, unknown>[]
}
