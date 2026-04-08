import type { Canvas } from 'fabric'

import { getFabricObjectId } from '../lib/fabricObjectRegistry'
import type { DisplayDocumentV1 } from '../types/displayDocument'
import { DISPLAY_DOCUMENT_VERSION } from '../types/displayDocument'
import { useDesignStore } from '../store/useDesignStore'

import { isDesignSystemCanvasObject } from './canvasObjectMarks'

export function buildDisplayDocumentFromCanvas(canvas: Canvas): DisplayDocumentV1 {
  const { config, objects, canvasZoom } = useDesignStore.getState()

  const fabricObjects = canvas
    .getObjects()
    .filter((o) => !isDesignSystemCanvasObject(o))
    .map((o) => {
      const plain = o.toObject() as Record<string, unknown>
      const id = getFabricObjectId(o)
      if (id) plain.appObjectId = id
      return plain
    })

  return {
    version: DISPLAY_DOCUMENT_VERSION,
    savedAt: new Date().toISOString(),
    design: {
      config: JSON.parse(JSON.stringify(config)) as typeof config,
      objects: objects.map((o) => ({ ...o })),
      canvasZoom,
    },
    fabricObjects,
  }
}
