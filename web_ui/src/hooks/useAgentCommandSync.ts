import { useEffect, useRef } from 'react'

import { applyAgentCommand } from '../canvas/applyAgentCommand'
import { getDisplayFileSlug } from '../constants/artboardPresets'
import { useDesignStore } from '../store/useDesignStore'

async function postCommandResultToDevServer(payload: {
  slug: string
  operation: string
  requestId?: string
  ok: boolean
  error?: string
}): Promise<void> {
  try {
    await fetch('/__api/screenshot-designer/command-result', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
  } catch {
    /* dev server may be unavailable; ignore */
  }
}

/**
 * Subscribes to dev-server agent commands (POST enqueue-command) for the active display slug.
 * Applies operations in-memory on the Fabric canvas (no datasource write).
 */
export function useAgentCommandSync(): void {
  const artboardPresetId = useDesignStore((s) => s.config.artboardPresetId)
  const slug = getDisplayFileSlug(artboardPresetId)
  const slugRef = useRef(slug)
  slugRef.current = slug

  useEffect(() => {
    const url = `/__api/screenshot-designer/command-events?slug=${encodeURIComponent(slug)}`
    const es = new EventSource(url)

    es.onmessage = (ev: MessageEvent<string>) => {
      try {
        const data = JSON.parse(ev.data) as {
          type?: string
          slug?: string
          operation?: string
          args?: Record<string, unknown>
          requestId?: string
        }
        if (data.type === 'hello') return
        if (data.type !== 'agent_command') return
        if (data.slug !== slugRef.current) return
        const op = data.operation
        if (!op) return
        const slug = data.slug
        if (!slug) return
        const requestId = data.requestId
        const canvas = useDesignStore.getState().fabricCanvas
        if (!canvas) {
          console.warn('[useAgentCommandSync] no fabric canvas; skipping', op)
          void postCommandResultToDevServer({
            slug,
            operation: op,
            requestId,
            ok: false,
            error: 'no_fabric_canvas',
          })
          return
        }
        void (async () => {
          try {
            await applyAgentCommand(canvas, op, data.args ?? {})
            await postCommandResultToDevServer({ slug, operation: op, requestId, ok: true })
          } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error)
            console.error('[useAgentCommandSync] applyAgentCommand failed', {
              operation: op,
              args: data.args ?? {},
              message,
            })
            await postCommandResultToDevServer({
              slug,
              operation: op,
              requestId,
              ok: false,
              error: message,
            })
          }
        })()
      } catch {
        /* ignore malformed SSE */
      }
    }

    es.onerror = () => {
      es.close()
    }

    return () => {
      es.close()
    }
  }, [slug])
}
