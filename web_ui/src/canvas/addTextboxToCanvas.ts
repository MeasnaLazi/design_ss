import { Textbox, type Canvas } from 'fabric'
import { registerFabricObjectId } from '../lib/fabricObjectRegistry'
import { useDesignStore } from '../store/useDesignStore'

/**
 * Adds an editable Textbox to the canvas and selects it.
 */
export function addTextboxToCanvas(canvas: Canvas): void {
  const id = crypto.randomUUID()

  const text = new Textbox('Double-click to edit', {
    left: 120,
    top: 160,
    width: 520,
    fontSize: 42,
    fill: '#f4f4f5',
    fontFamily: 'system-ui, -apple-system, sans-serif',
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
