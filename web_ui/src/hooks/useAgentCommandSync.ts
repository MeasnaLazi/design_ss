import { useEffect, useRef } from 'react'

import { applyAgentCommand } from '../canvas/applyAgentCommand'
import { getDisplayFileSlug } from '../constants/artboardPresets'
import { useDesignStore } from '../store/useDesignStore'

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
        }
        if (data.type === 'hello') return
        if (data.type !== 'agent_command') return
        if (data.slug !== slugRef.current) return
        const op = data.operation
        if (!op) return
        const canvas = useDesignStore.getState().fabricCanvas
        if (!canvas) {
          console.warn('[useAgentCommandSync] no fabric canvas; skipping', op)
          return
        }
        void applyAgentCommand(canvas, op, data.args ?? {})
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
