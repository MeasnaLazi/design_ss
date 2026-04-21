import { ActiveSelection, type FabricObject } from 'fabric'
import { useEffect, useRef } from 'react'

import { isDesignSystemCanvasObject } from '../canvas/canvasObjectMarks'
import { getFabricObjectId } from '../lib/fabricObjectRegistry'
import {
  pushDesignHistoryCommit,
} from '../history/designHistory'
import { useDesignStore } from '../store/useDesignStore'

const DEBOUNCE_MS = 320

function isUserHistoryTarget(target: FabricObject | undefined | null): boolean {
  if (!target) return false
  if (isDesignSystemCanvasObject(target)) return false
  if (target instanceof ActiveSelection) {
    return target
      .getObjects()
      .some((o) => !isDesignSystemCanvasObject(o) && getFabricObjectId(o))
  }
  return typeof getFabricObjectId(target) === 'string'
}

/**
 * Pushes undo steps after canvas gestures and debounced store-only edits (sidebar layout, etc.).
 */
export function useDesignHistoryRecorder(): void {
  const fabricCanvas = useDesignStore((s) => s.fabricCanvas)
  const config = useDesignStore((s) => s.config)
  const objects = useDesignStore((s) => s.objects)
  const canvasZoom = useDesignStore((s) => s.canvasZoom)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const canvas = fabricCanvas
    if (!canvas) return

    const onCommit = () => {
      pushDesignHistoryCommit()
    }

    const onModified = (opt: { target?: FabricObject }) => {
      if (isUserHistoryTarget(opt.target)) onCommit()
    }

    const onAdded = (opt: { target?: FabricObject }) => {
      if (isUserHistoryTarget(opt.target)) onCommit()
    }

    const onRemoved = (opt: { target?: FabricObject }) => {
      if (isUserHistoryTarget(opt.target)) onCommit()
    }

    canvas.on('object:modified', onModified)
    canvas.on('object:added', onAdded)
    canvas.on('object:removed', onRemoved)

    return () => {
      canvas.off('object:modified', onModified)
      canvas.off('object:added', onAdded)
      canvas.off('object:removed', onRemoved)
    }
  }, [fabricCanvas])

  useEffect(() => {
    if (!fabricCanvas) return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null
      pushDesignHistoryCommit()
    }, DEBOUNCE_MS)
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
        debounceRef.current = null
      }
    }
    // Intentionally depend on serializable design fields so sidebar edits schedule one debounced step.
  }, [fabricCanvas, config, objects, canvasZoom])
}
