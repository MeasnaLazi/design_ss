import { useEffect } from 'react'

import { deleteSelectedCanvasLayers } from '../canvas/deleteLayerById'

function isTypingInField(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
}

/**
 * Delete (and Backspace) removes the selected canvas layer(s) when not editing text or typing in a control.
 * Uses Fabric’s active object so deletion matches what is selected on the canvas, including multi-select.
 */
export function useDeleteLayerHotkeys(): void {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return
      if (isTypingInField(e.target)) return

      if (deleteSelectedCanvasLayers()) {
        e.preventDefault()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])
}
