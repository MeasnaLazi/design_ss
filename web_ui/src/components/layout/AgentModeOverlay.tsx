import { useDesignerModeStore } from '../../store/useDesignerModeStore'

/**
 * Read-only lock shown while the agent is designing (mode = `agent`).
 * Blocks all pointer interaction with the app; "Take over" switches the
 * server mode to `human`, which makes the agent halt at its next mutating
 * canvas call (server returns 409 human_mode).
 */
export function AgentModeOverlay() {
  const mode = useDesignerModeStore((s) => s.mode)
  const holder = useDesignerModeStore((s) => s.holder)
  const takeOver = useDesignerModeStore((s) => s.takeOver)

  if (mode !== 'agent') return null

  return (
    <div
      className="fixed inset-0 z-[90] flex flex-col items-center bg-zinc-950/45"
      role="dialog"
      aria-label="Agent is designing"
    >
      <div className="mt-4 flex items-center gap-4 rounded-xl border border-amber-400/40 bg-zinc-900/95 px-5 py-3 shadow-2xl">
        <span className="relative flex h-2.5 w-2.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-60" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-amber-400" />
        </span>
        <div className="text-sm">
          <div className="font-medium text-zinc-100">
            Agent is designing{holder ? ` (${holder})` : ''} — canvas is read-only
          </div>
          <div className="text-xs text-zinc-400">
            Taking over stops the agent at its next canvas operation.
          </div>
        </div>
        <button
          type="button"
          onClick={() => void takeOver()}
          className="rounded-lg bg-amber-400 px-4 py-1.5 text-sm font-semibold text-zinc-950 transition hover:bg-amber-300"
        >
          Take over
        </button>
      </div>
    </div>
  )
}
