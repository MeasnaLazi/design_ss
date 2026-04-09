import { useEffect } from 'react'

import {
  copySelectedLayersToClipboard,
  hasLayerClipboard,
  pasteLayersFromClipboard,
} from '../canvas/layerClipboard'
import { isFabricTextEditing } from '../canvas/deleteLayerById'
import { useDesignStore } from '../store/useDesignStore'

function isTypingInField(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
}

/**
 * Cmd/Ctrl+C copies the selected layer(s); Cmd/Ctrl+V pastes with new ids and a small offset.
 * When editing canvas text or typing in a control, native copy/paste is left to the browser.
 */
export function useCopyPasteLayerHotkeys(): void {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey
      if (!mod) return
      if (e.key !== 'c' && e.key !== 'v') return
      if (isTypingInField(e.target)) return

      const canvas = useDesignStore.getState().fabricCanvas
      if (isFabricTextEditing(canvas)) return

      if (e.key === 'c') {
        if (copySelectedLayersToClipboard()) {
          e.preventDefault()
        }
        return
      }

      if (e.key === 'v') {
        if (!hasLayerClipboard()) return
        e.preventDefault()
        void pasteLayersFromClipboard()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])
}
