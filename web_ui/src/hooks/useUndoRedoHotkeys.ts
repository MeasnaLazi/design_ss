import { useEffect } from 'react'

import { isFabricTextEditing } from '../canvas/deleteLayerById'
import {
  canRedoDesignHistory,
  canUndoDesignHistory,
  redoDesignHistory,
  undoDesignHistory,
} from '../history/designHistory'
import { useDesignStore } from '../store/useDesignStore'

function isTypingInField(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
}

/**
 * Cmd/Ctrl+Z undo, Cmd/Ctrl+Shift+Z and Ctrl+Y redo. Skips while editing Fabric IText or focused form fields.
 */
export function useUndoRedoHotkeys(): void {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return
      if (e.altKey) return

      const canvas = useDesignStore.getState().fabricCanvas
      if (isFabricTextEditing(canvas)) return

      const key = e.key
      const isUndo =
        (key === 'z' || key === 'Z') && !e.shiftKey && (e.ctrlKey || e.metaKey)
      const isRedoChord =
        (key === 'z' || key === 'Z') && e.shiftKey && (e.ctrlKey || e.metaKey)
      const isRedoY = (key === 'y' || key === 'Y') && e.ctrlKey && !e.metaKey

      if (isUndo) {
        if (isTypingInField(e.target)) return
        if (!canUndoDesignHistory()) return
        e.preventDefault()
        void undoDesignHistory()
        return
      }

      if (isRedoChord || isRedoY) {
        if (isTypingInField(e.target)) return
        if (!canRedoDesignHistory()) return
        e.preventDefault()
        void redoDesignHistory()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])
}
