import type { FabricObject } from 'fabric'
import { useCallback, useEffect, useRef } from 'react'

import { isUserLayerFabricTarget } from '../canvas/fabricUserLayerTarget'
import { isDocumentApplyActive } from '../history/documentApplyDepth'
import { persistDisplayDocumentToDatasource } from '../lib/saveDisplayToDatasource'
import { useDesignStore } from '../store/useDesignStore'
import { useSaveStatusStore } from '../store/useSaveStatusStore'

const AUTOSAVE_DEBOUNCE_MS = 2000

/**
 * Debounced auto-save to datasource after canvas or design-store edits.
 * Cancels an in-flight PUT when a newer edit is scheduled (AbortSignal).
 */
export function useDatasourceAutoSave(): void {
  const fabricCanvas = useDesignStore((s) => s.fabricCanvas)
  const config = useDesignStore((s) => s.config)
  const objects = useDesignStore((s) => s.objects)
  const canvasZoom = useDesignStore((s) => s.canvasZoom)
  const artboardPresetId = config.artboardPresetId

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const bumpSchedule = useCallback(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
      debounceRef.current = null
    }
    abortRef.current?.abort()
    abortRef.current = null

    debounceRef.current = setTimeout(() => {
      debounceRef.current = null
      void (async () => {
        if (isDocumentApplyActive()) {
          return
        }

        const ac = new AbortController()
        abortRef.current = ac

        await persistDisplayDocumentToDatasource({
          source: 'auto',
          skipIfUnchanged: true,
          signal: ac.signal,
        })

        if (abortRef.current === ac) {
          abortRef.current = null
        }
      })()
    }, AUTOSAVE_DEBOUNCE_MS)
  }, [])

  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
        debounceRef.current = null
      }
      abortRef.current?.abort()
      abortRef.current = null
    }
  }, [])

  useEffect(() => {
    const canvas = fabricCanvas
    if (!canvas) return

    const onFabric = (opt: { target?: FabricObject }) => {
      if (isUserLayerFabricTarget(opt.target)) bumpSchedule()
    }

    canvas.on('object:modified', onFabric)
    canvas.on('object:added', onFabric)
    canvas.on('object:removed', onFabric)

    return () => {
      canvas.off('object:modified', onFabric)
      canvas.off('object:added', onFabric)
      canvas.off('object:removed', onFabric)
    }
  }, [fabricCanvas, bumpSchedule])

  useEffect(() => {
    if (!fabricCanvas) return
    bumpSchedule()
  }, [fabricCanvas, config, objects, canvasZoom, bumpSchedule])

  const prevPresetRef = useRef(artboardPresetId)
  useEffect(() => {
    if (prevPresetRef.current !== artboardPresetId) {
      prevPresetRef.current = artboardPresetId
      useSaveStatusStore.getState().clearPersistedFingerprint()
    }
  }, [artboardPresetId])
}
