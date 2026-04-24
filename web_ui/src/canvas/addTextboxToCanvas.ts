import { Textbox, type Canvas } from 'fabric'

import { DEFAULT_TEXT_FONT_FAMILY } from '../constants/textFonts'
import type { TextStylePresetId } from '../constants/textStylePresets'
import { getTextStylePreset } from '../constants/textStylePresets'
import { registerFabricObjectId } from '../lib/fabricObjectRegistry'
import { useDesignStore } from '../store/useDesignStore'

const DEFAULT_LEFT = 120
const DEFAULT_TOP = 160
/** Default textbox width for new plain text (sidebar or canvas drop). */
export const DEFAULT_TEXTBOX_WIDTH = 520
/** Default font size for new text (sidebar click unless overridden). */
export const DEFAULT_TEXT_FONT_SIZE = 100

export type AddTextboxToCanvasOptions = {
  left?: number
  top?: number
  fontSize?: number
  width?: number
  /** Text fill (hex). */
  fill?: string
  /** CSS font family (e.g. Inter). */
  fontFamily?: string
  /** Apply text style quick presets (layer name, size, weight, width, sample copy). */
  preset?: TextStylePresetId
  /** Overrides preset when set explicitly */
  layerName?: string
  text?: string
  fontWeight?: string | number
  fontStyle?: 'normal' | 'italic'
  textAlign?: 'left' | 'center' | 'right'
}

/**
 * Adds an editable Textbox to the canvas and selects it.
 */
export function addTextboxToCanvas(
  canvas: Canvas,
  options?: AddTextboxToCanvasOptions,
): void {
  const id = crypto.randomUUID()
  const presetDef = options?.preset != null ? getTextStylePreset(options.preset) : null

  const left = options?.left ?? DEFAULT_LEFT
  const top = options?.top ?? presetDef?.top ?? DEFAULT_TOP
  const fontSize = options?.fontSize ?? presetDef?.fontSize ?? DEFAULT_TEXT_FONT_SIZE
  const width = options?.width ?? presetDef?.width ?? DEFAULT_TEXTBOX_WIDTH

  const initialText = options?.text ?? presetDef?.initialText ?? 'Double-click to edit'
  const fontWeight = options?.fontWeight ?? presetDef?.fontWeight ?? '600'
  const fontStyle = options?.fontStyle ?? presetDef?.fontStyle ?? 'normal'
  const textAlign = options?.textAlign ?? presetDef?.textAlign ?? 'left'
  const layerName = options?.layerName ?? presetDef?.layerName ?? 'Text'

  const text = new Textbox(initialText, {
    left,
    top,
    width,
    fontSize,
    fill: options?.fill ?? '#f4f4f5',
    fontFamily: options?.fontFamily ?? DEFAULT_TEXT_FONT_FAMILY,
    fontWeight,
    fontStyle,
    textAlign,
  })

  registerFabricObjectId(text, id)

  const zIndex =
    useDesignStore.getState().objects.reduce((m, o) => Math.max(m, o.zIndex), -1) + 1

  useDesignStore.getState().upsertObject({
    id,
    kind: 'text',
    name: layerName,
    zIndex,
  })

  canvas.add(text)
  canvas.setActiveObject(text)
  canvas.requestRenderAll()

  useDesignStore.getState().setSelectedObject(id)
  console.log('[addTextboxToCanvas] added Textbox', { id })
}
