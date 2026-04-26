import { create } from 'zustand'

export type ToastVariant = 'success' | 'error' | 'info' | 'warning'

export interface ToastStoreState {
  toast: { message: string; variant: ToastVariant } | null
  showToast: (message: string, variant?: ToastVariant) => void
  clearToast: () => void
}

export const useToastStore = create<ToastStoreState>((set) => ({
  toast: null,

  showToast: (message, variant = 'info') => {
    const tag = '[agent-ui]'
    if (variant === 'error' || variant === 'warning') {
      console.warn(`${tag} ${variant}: ${message}`)
    } else if (variant === 'success') {
      console.info(`${tag} success: ${message}`)
    } else {
      console.log(`${tag} info: ${message}`)
    }
    set({ toast: { message, variant } })
  },

  clearToast: () => set({ toast: null }),
}))
