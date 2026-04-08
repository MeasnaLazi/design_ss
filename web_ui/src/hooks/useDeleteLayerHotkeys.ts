import { useEffect } from 'react'

import { deleteLayerById, isFabricTextEditing } from '../canvas/deleteLayerById'
import { useDesignStore } from '../store/useDesignStore'

function isTypingInField(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
}

/**
 * Delete / Backspace removes the selected canvas layer when not editing text or typing in a control.
 */
export function useDeleteLayerHotkeys(): void {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return
      if (isTypingInField(e.target)) return

      const selectedObject = useDesignStore.getState().selectedObject
      if (!selectedObject) return

      const canvas = useDesignStore.getState().fabricCanvas
      if (isFabricTextEditing(canvas)) return

      e.preventDefault()
      deleteLayerById(selectedObject)
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])
}
