import { useEffect } from 'react'

import { useDesignerModeStore } from '../store/useDesignerModeStore'

const POLL_MS = 3000

/**
 * Polls /__api/screenshot-designer/mode and mirrors it into
 * {@link useDesignerModeStore}. While mode is `agent`, a window-capture
 * keydown blocker disables all canvas hotkeys (delete, nudge, undo, paste…)
 * so the read-only overlay cannot be bypassed from the keyboard.
 */
export function useDesignerModeSync(): void {
  const applyServerMode = useDesignerModeStore((s) => s.applyServerMode)

  useEffect(() => {
    let stopped = false
    const poll = async () => {
      try {
        const res = await fetch('/__api/screenshot-designer/mode')
        if (!res.ok) return
        const data = (await res.json()) as { mode?: 'human' | 'agent'; since?: string; holder?: string | null }
        if (!stopped && (data.mode === 'human' || data.mode === 'agent')) {
          applyServerMode(data.mode, data.since ?? null, data.holder ?? null)
        }
      } catch {
        /* dev server not reachable — keep previous state (defaults to human) */
      }
    }
    void poll()
    const id = window.setInterval(() => void poll(), POLL_MS)
    return () => {
      stopped = true
      window.clearInterval(id)
    }
  }, [applyServerMode])

  useEffect(() => {
    const blockKeys = (e: KeyboardEvent) => {
      if (useDesignerModeStore.getState().mode !== 'agent') return
      // Allow browser-level combos (e.g. devtools, tab switching) — only stop
      // propagation so app hotkey listeners (window, bubble phase) never fire.
      e.stopImmediatePropagation()
    }
    window.addEventListener('keydown', blockKeys, { capture: true })
    return () => window.removeEventListener('keydown', blockKeys, { capture: true })
  }, [])
}
