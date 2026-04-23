import { useEffect, useLayoutEffect } from 'react'

import {
  parseArtboardUrlParam,
  replaceArtboardQueryParam,
  writeArtboardSessionCookie,
} from '../lib/artboardUrlParam'
import { useDesignStore } from '../store/useDesignStore'

/**
 * - Applies `?artboard=` from the page URL to the design store on load.
 * - Writes a session cookie immediately (Referer often drops `?artboard=` on same-origin API calls).
 * - Keeps URL + cookie in sync when the artboard preset changes.
 */
export function useArtboardUrlQuerySync(): void {
  const artboardPresetId = useDesignStore((s) => s.config.artboardPresetId)
  const setConfig = useDesignStore((s) => s.setConfig)

  useLayoutEffect(() => {
    const fromUrl = parseArtboardUrlParam(new URLSearchParams(window.location.search).get('artboard'))
    if (fromUrl) {
      setConfig({ artboardPresetId: fromUrl })
      writeArtboardSessionCookie(fromUrl)
    }
  }, [setConfig])

  useEffect(() => {
    replaceArtboardQueryParam(artboardPresetId)
  }, [artboardPresetId])

  useEffect(() => {
    const onPopState = (): void => {
      const fromUrl = parseArtboardUrlParam(new URLSearchParams(window.location.search).get('artboard'))
      if (fromUrl) {
        setConfig({ artboardPresetId: fromUrl })
        writeArtboardSessionCookie(fromUrl)
      }
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [setConfig])
}
