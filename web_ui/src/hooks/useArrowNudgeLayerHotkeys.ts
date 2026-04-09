import { useEffect } from 'react'

import { nudgeSelectedLayersOnCanvas } from '../canvas/nudgeSelectedLayersOnCanvas'
import { isFabricTextEditing } from '../canvas/deleteLayerById'
import { useDesignStore } from '../store/useDesignStore'

function isTypingInField(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
}

const NUDGE_PX = 1
const NUDGE_SHIFT_PX = 10

/**
 * Arrow keys nudge the selected canvas layer(s). Shift + arrow uses a larger step.
 * Ignored while typing in a control or editing canvas text.
 */
export function useArrowNudgeLayerHotkeys(): void {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown' && e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') {
        return
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return
      if (isTypingInField(e.target)) return

      const canvas = useDesignStore.getState().fabricCanvas
      if (!canvas || isFabricTextEditing(canvas)) return

      const step = e.shiftKey ? NUDGE_SHIFT_PX : NUDGE_PX
      let dx = 0
      let dy = 0
      if (e.key === 'ArrowLeft') dx = -step
      if (e.key === 'ArrowRight') dx = step
      if (e.key === 'ArrowUp') dy = -step
      if (e.key === 'ArrowDown') dy = step

      if (nudgeSelectedLayersOnCanvas(canvas, dx, dy)) {
        e.preventDefault()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])
}
