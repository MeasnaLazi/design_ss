import { useEffect, useLayoutEffect, useRef } from 'react'

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
 *
 * Note: The first passive `useEffect` can see the store default (`iphone`) while `useLayoutEffect`
 * is still applying `?artboard=ipad` — mirroring that into the URL would clobber the query. We sync
 * URL + cookie in `useLayoutEffect`, then skip one passive run before mirroring further changes.
 */
export function useArtboardUrlQuerySync(): void {
  const artboardPresetId = useDesignStore((s) => s.config.artboardPresetId)
  const setConfig = useDesignStore((s) => s.setConfig)
  const skipPassiveUrlSyncOnce = useRef(true)

  useLayoutEffect(() => {
    const fromUrl = parseArtboardUrlParam(new URLSearchParams(window.location.search).get('artboard'))
    if (fromUrl) {
      setConfig({ artboardPresetId: fromUrl })
      writeArtboardSessionCookie(fromUrl)
    }
    const id = useDesignStore.getState().config.artboardPresetId
    replaceArtboardQueryParam(id)
  }, [setConfig])

  useEffect(() => {
    if (skipPassiveUrlSyncOnce.current) {
      skipPassiveUrlSyncOnce.current = false
      return
    }
    replaceArtboardQueryParam(artboardPresetId)
  }, [artboardPresetId])

  useEffect(() => {
    const onPopState = (): void => {
      const fromUrl = parseArtboardUrlParam(new URLSearchParams(window.location.search).get('artboard'))
      if (fromUrl) {
        setConfig({ artboardPresetId: fromUrl })
        writeArtboardSessionCookie(fromUrl)
        replaceArtboardQueryParam(fromUrl)
      }
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [setConfig])
}
