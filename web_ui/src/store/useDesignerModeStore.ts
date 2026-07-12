import { create } from 'zustand'

/**
 * One-way exclusive design mode (docs/implementation-plan.md Phase 4).
 * Mirrors GET/POST /__api/screenshot-designer/mode:
 * - `agent`: agent is designing → canvas is read-only (overlay + banner).
 * - `human`: human is designing → server refuses mutating agent enqueue ops.
 */
export interface DesignerModeState {
  mode: 'human' | 'agent'
  since: string | null
  holder: string | null
  /** Last successful sync with the server (null until first poll). */
  syncedAt: number | null
  applyServerMode: (mode: 'human' | 'agent', since: string | null, holder: string | null) => void
  /** POST mode=human (the "Take over" button). */
  takeOver: () => Promise<void>
}

export const useDesignerModeStore = create<DesignerModeState>((set) => ({
  mode: 'human',
  since: null,
  holder: null,
  syncedAt: null,

  applyServerMode: (mode, since, holder) =>
    set({ mode, since, holder, syncedAt: Date.now() }),

  takeOver: async () => {
    try {
      const res = await fetch('/__api/screenshot-designer/mode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'human', holder: 'web_ui' }),
      })
      const data = (await res.json()) as { mode?: 'human' | 'agent'; since?: string; holder?: string | null }
      if (data.mode === 'human' || data.mode === 'agent') {
        set({ mode: data.mode, since: data.since ?? null, holder: data.holder ?? null, syncedAt: Date.now() })
      }
    } catch {
      // Dev server unreachable — treat as human (unlocked) so the UI never traps the user.
      set({ mode: 'human', syncedAt: Date.now() })
    }
  },
}))
