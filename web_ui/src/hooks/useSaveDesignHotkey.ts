import { useEffect } from 'react'

import { isFabricTextEditing } from '../canvas/deleteLayerById'
import { saveDisplayToDatasource } from '../lib/saveDisplayToDatasource'
import { useDesignStore } from '../store/useDesignStore'

function isTypingInField(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
}

/**
 * Ctrl/Cmd+S saves the current design to datasource (same as the toolbar Save button).
 * Still runs while editing canvas text (Fabric’s hidden textarea); skips real app form fields.
 */
export function useSaveDesignHotkey(): void {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return
      if (e.key !== 's' && e.key !== 'S') return
      if (e.shiftKey || e.altKey) return
      if (isTypingInField(e.target)) {
        const canvas = useDesignStore.getState().fabricCanvas
        if (!isFabricTextEditing(canvas)) return
      }

      e.preventDefault()
      void saveDisplayToDatasource()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])
}
