import { Textbox, type Canvas } from 'fabric'

import { DEFAULT_TEXT_FONT_FAMILY } from '../constants/textFonts'
import { registerFabricObjectId } from '../lib/fabricObjectRegistry'
import { useDesignStore } from '../store/useDesignStore'

const DEFAULT_LEFT = 120
const DEFAULT_TOP = 160
const DEFAULT_WIDTH = 520
/** Default font size for new text (sidebar click or drag-drop unless overridden). */
export const DEFAULT_TEXT_FONT_SIZE = 100

export type AddTextboxToCanvasOptions = {
  left?: number
  top?: number
  fontSize?: number
  width?: number
}

/**
 * Adds an editable Textbox to the canvas and selects it.
 */
export function addTextboxToCanvas(
  canvas: Canvas,
  options?: AddTextboxToCanvasOptions,
): void {
  const id = crypto.randomUUID()
  const left = options?.left ?? DEFAULT_LEFT
  const top = options?.top ?? DEFAULT_TOP
  const fontSize = options?.fontSize ?? DEFAULT_TEXT_FONT_SIZE
  const width = options?.width ?? DEFAULT_WIDTH

  const text = new Textbox('Double-click to edit', {
    left,
    top,
    width,
    fontSize,
    fill: '#f4f4f5',
    fontFamily: DEFAULT_TEXT_FONT_FAMILY,
    fontWeight: '600',
  })

  registerFabricObjectId(text, id)

  const zIndex =
    useDesignStore.getState().objects.reduce((m, o) => Math.max(m, o.zIndex), -1) + 1

  useDesignStore.getState().upsertObject({
    id,
    kind: 'text',
    name: 'Text',
    zIndex,
  })

  canvas.add(text)
  canvas.setActiveObject(text)
  canvas.requestRenderAll()

  useDesignStore.getState().setSelectedObject(id)
  console.log('[addTextboxToCanvas] added Textbox', { id })
}
