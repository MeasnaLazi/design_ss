import { useEffect, useRef } from 'react'

import { getDisplayFileSlug } from '../constants/artboardPresets'
import { reloadDisplayFromDatasource } from '../lib/reloadDisplayFromDatasource'
import { useDesignStore } from '../store/useDesignStore'

/**
 * Subscribes to server push when `display_<slug>.json` is updated (save-display, PUT, or legacy writes).
 * Client-authoritative agent edits use {@link useAgentCommandSync} and do not touch disk until Save.
 * Reloads the canvas in-place without a full page refresh.
 */
export function useDisplayRemoteSync(): void {
  const artboardPresetId = useDesignStore((s) => s.config.artboardPresetId)
  const slug = getDisplayFileSlug(artboardPresetId)
  const slugRef = useRef(slug)
  slugRef.current = slug

  useEffect(() => {
    const url = `/__api/datasource/display-events?slug=${encodeURIComponent(slug)}`
    const es = new EventSource(url)

    es.onmessage = (ev: MessageEvent<string>) => {
      try {
        const data = JSON.parse(ev.data) as {
          type?: string
          slug?: string
          savedAt?: string
        }
        if (data.type === 'hello') return
        if (data.type !== 'display_updated') return
        if (data.slug !== slugRef.current) return
        void reloadDisplayFromDatasource()
      } catch {
        /* ignore malformed SSE payloads */
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
