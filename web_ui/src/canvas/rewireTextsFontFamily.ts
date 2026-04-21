import { Group, IText, type Canvas, type FabricObject } from 'fabric'

import { DEFAULT_TEXT_FONT_FAMILY } from '../constants/textFonts'

function walkFabricObjects(objects: FabricObject[], visit: (o: FabricObject) => void): void {
  for (const o of objects) {
    visit(o)
    if (o instanceof Group) {
      walkFabricObjects(o.getObjects(), visit)
    }
  }
}

/**
 * Replaces `fontFamily` on all text objects (including inside groups) when a custom font is removed.
 */
export function rewireTextsFontFamily(
  canvas: Canvas | null,
  fromFamily: string,
  toFamily: string = DEFAULT_TEXT_FONT_FAMILY,
): void {
  if (!canvas) return
  walkFabricObjects(canvas.getObjects(), (o) => {
    if (o instanceof IText && o.fontFamily === fromFamily) {
      o.set({ fontFamily: toFamily, dirty: true })
    }
  })
  canvas.requestRenderAll()
}
