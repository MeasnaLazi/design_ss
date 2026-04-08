import { useEffect } from 'react'

import { useToastStore, type ToastVariant } from '../../store/useToastStore'

const VARIANT_STYLES: Record<
  ToastVariant,
  { border: string; bg: string; text: string }
> = {
  success: {
    border: 'border-emerald-600/50',
    bg: 'bg-emerald-950/95',
    text: 'text-emerald-50',
  },
  error: {
    border: 'border-red-600/50',
    bg: 'bg-red-950/95',
    text: 'text-red-50',
  },
  warning: {
    border: 'border-amber-600/50',
    bg: 'bg-amber-950/95',
    text: 'text-amber-50',
  },
  info: {
    border: 'border-zinc-600/50',
    bg: 'bg-zinc-900/95',
    text: 'text-zinc-100',
  },
}

export function ToastHost() {
  const toast = useToastStore((s) => s.toast)
  const clearToast = useToastStore((s) => s.clearToast)

  useEffect(() => {
    if (!toast) return
    const id = window.setTimeout(clearToast, 4500)
    return () => window.clearTimeout(id)
  }, [toast, clearToast])

  if (!toast) return null

  const styles = VARIANT_STYLES[toast.variant]

  return (
    <div
      className="pointer-events-none fixed bottom-4 left-1/2 z-[200] flex max-w-[min(24rem,calc(100vw-2rem))] -translate-x-1/2 justify-center px-2"
      aria-live="polite"
    >
      <button
        type="button"
        onClick={clearToast}
        className={`pointer-events-auto w-full cursor-pointer rounded-md border px-3 py-2 text-left text-xs leading-snug shadow-lg backdrop-blur-sm transition-opacity hover:opacity-95 ${styles.border} ${styles.bg} ${styles.text}`}
      >
        {toast.message}
      </button>
    </div>
  )
}
