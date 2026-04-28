import { create } from 'zustand'

export type SaveToolbarStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error'

type SaveStatusState = {
  status: SaveToolbarStatus
  message: string
  lastSavedAt: number | null
  lastPersistedFingerprint: string | null
}

type SaveStatusActions = {
  setPending: (message?: string) => void
  setSaving: (message: string) => void
  setSaved: (message: string, fingerprint: string) => void
  setError: (message: string) => void
  setIdle: (message?: string) => void
  /** Same document as last successful save — no PUT (manual or auto). */
  setSavedUnchanged: (message: string) => void
  /** Call when artboard slug changes so auto-save does not compare across presets. */
  clearPersistedFingerprint: () => void
}

const initial: SaveStatusState = {
  status: 'idle',
  message: '',
  lastSavedAt: null,
  lastPersistedFingerprint: null,
}

export const useSaveStatusStore = create<SaveStatusState & SaveStatusActions>((set) => ({
  ...initial,

  setPending: (message) =>
    set({
      status: 'pending',
      message: message ?? 'Unsaved changes…',
    }),

  setSaving: (message) =>
    set({
      status: 'saving',
      message,
    }),

  setSaved: (message, fingerprint) =>
    set({
      status: 'saved',
      message,
      lastSavedAt: Date.now(),
      lastPersistedFingerprint: fingerprint,
    }),

  setError: (message) =>
    set({
      status: 'error',
      message,
    }),

  setIdle: (message) =>
    set({
      status: 'idle',
      message: message ?? '',
    }),

  setSavedUnchanged: (message) =>
    set((s) => ({
      status: 'saved',
      message,
      lastSavedAt: s.lastSavedAt,
      lastPersistedFingerprint: s.lastPersistedFingerprint,
    })),

  clearPersistedFingerprint: () => set({ lastPersistedFingerprint: null }),
}))
