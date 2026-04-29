import type { FabricObject } from 'fabric'
import { FabricImage, IText, Line, Rect } from 'fabric'

import { isGutterOverlayRect } from './gutterOverlayRects'
import { LAYER_NAME_OVERLAY_MARK } from './layerNameOverlays'

/** Panel slot rects drawn under user content in {@link CanvasWorkspace}. */
export const PANEL_SLOT_MARK = '__appsPublisherPanelSlot' as const
export type PanelSlotRect = Rect & { [PANEL_SLOT_MARK]?: true }

export function isPanelSlotRect(o: unknown): o is PanelSlotRect {
  return o instanceof Rect && !!(o as PanelSlotRect)[PANEL_SLOT_MARK]
}

/** Full-strip solid/gradient layer behind panel slot outlines (one rect for the whole artboard row). */
export const STRIP_BACKGROUND_FILL_MARK = '__appsPublisherStripBackgroundFill' as const
export type StripBackgroundFillRect = Rect & { [STRIP_BACKGROUND_FILL_MARK]?: true }

export function isStripBackgroundFillRect(o: unknown): o is StripBackgroundFillRect {
  return o instanceof Rect && !!(o as StripBackgroundFillRect)[STRIP_BACKGROUND_FILL_MARK]
}

/** Strip-wide cover image from {@link DesignConfig#backgroundImageUrl} (one object, clip to canvas). */
export const PANEL_BG_MARK = '__appsPublisherPanelBg' as const
export type PanelBgImage = FabricImage & { [PANEL_BG_MARK]?: true }

export function isPanelBackgroundImage(o: unknown): o is PanelBgImage {
  return o instanceof FabricImage && !!(o as PanelBgImage)[PANEL_BG_MARK]
}

/**
 * True for layout/system objects that are recreated from Zustand config and must not be persisted
 * in display documents.
 */
export function isDesignSystemCanvasObject(o: FabricObject): boolean {
  if (o instanceof Line && o.excludeFromExport === true) return true
  if (isStripBackgroundFillRect(o)) return true
  if (isPanelSlotRect(o)) return true
  if (isPanelBackgroundImage(o)) return true
  if (isGutterOverlayRect(o)) return true
  if (o instanceof IText && !!(o as IText & { [LAYER_NAME_OVERLAY_MARK]?: true })[LAYER_NAME_OVERLAY_MARK]) {
    return true
  }
  return false
}
