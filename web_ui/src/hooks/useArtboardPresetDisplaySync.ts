import { useEffect, useRef } from 'react'

import { applyEmptyDesignForPreset, loadDisplayDocumentIntoCanvas } from '../canvas/loadDisplayDocument'
import { resetDesignHistoryFromCurrentCanvas } from '../history/designHistory'
import { parseDisplayDocument } from '../canvas/parseDisplayDocument'
import { getDisplayFileSlug } from '../constants/artboardPresets'
import { tryFetchDisplayDocument } from '../lib/datasourceApi'
import { useDesignStore } from '../store/useDesignStore'
import { useToastStore } from '../store/useToastStore'

let suppressNextPresetDatasourceSync = false

/** Call before applying a design from disk or the Design menu so the hook does not duplicate-fetch. */
export function suppressArtboardPresetDatasourceSyncOnce(): void {
  suppressNextPresetDatasourceSync = true
}

/** If no effect ran to consume the suppress flag, reset it (e.g. import without preset change). */
export function clearArtboardPresetDatasourceSyncSuppress(): void {
  suppressNextPresetDatasourceSync = false
}

/**
 * When the artboard preset (device type) changes — or when the Fabric canvas first mounts — loads
 * `datasource/display_<slug>.json` for that preset. If the file is missing, applies an empty default layout.
 */
export function useArtboardPresetDisplaySync(): void {
  const fabricCanvas = useDesignStore((s) => s.fabricCanvas)
  const artboardPresetId = useDesignStore((s) => s.config.artboardPresetId)
  const genRef = useRef(0)

  useEffect(() => {
    if (!fabricCanvas) return

    if (suppressNextPresetDatasourceSync) {
      suppressNextPresetDatasourceSync = false
      return
    }

    const myGen = ++genRef.current
    const slug = getDisplayFileSlug(artboardPresetId)
    const preset = artboardPresetId

    void (async () => {
      try {
        const raw = await tryFetchDisplayDocument(slug)
        if (myGen !== genRef.current) return
        if (raw !== null) {
          const doc = parseDisplayDocument(raw)
          await loadDisplayDocumentIntoCanvas(doc)
        } else {
          await applyEmptyDesignForPreset(preset)
        }
        if (myGen !== genRef.current) return
        resetDesignHistoryFromCurrentCanvas()
      } catch (e) {
        if (myGen !== genRef.current) return
        console.error('[useArtboardPresetDisplaySync] load failed', e)
        useToastStore
          .getState()
          .showToast(
            'Could not load preset file from datasource — starting with an empty layout.',
            'warning',
          )
        await applyEmptyDesignForPreset(preset)
        if (myGen !== genRef.current) return
        resetDesignHistoryFromCurrentCanvas()
      }
    })()
  }, [fabricCanvas, artboardPresetId])
}
