import type { Canvas, FabricObject } from 'fabric'
import { util } from 'fabric'

import { registerFabricObjectId } from '../lib/fabricObjectRegistry'
import type { ArtboardPresetId } from '../constants/artboardPresets'
import { suppressArtboardPresetDatasourceSyncOnce } from '../hooks/useArtboardPresetDisplaySync'
import { beginDocumentApply, endDocumentApply } from '../history/documentApplyDepth'
import type { DisplayDocumentV1 } from '../types/displayDocument'
import {
  createDefaultDesignSnapshotForPreset,
  useDesignStore,
} from '../store/useDesignStore'
import { useCustomFontStore } from '../store/useCustomFontStore'

import { isDesignSystemCanvasObject } from './canvasObjectMarks'
import { parseDisplayDocument } from './parseDisplayDocument'

export type LoadDisplayDocumentOptions = {
  /**
   * When true, the next `useArtboardPresetDisplaySync` run will not refetch datasource
   * (used when applying an in-memory document that may change `artboardPresetId`, e.g. undo/redo or templates).
   */
  skipPresetDatasourceSync?: boolean
}

function waitTwoFrames(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve())
    })
  })
}

function removeUserObjectsFromCanvas(canvas: Canvas): void {
  const victims = canvas.getObjects().filter((o) => !isDesignSystemCanvasObject(o))
  for (const o of victims) {
    canvas.remove(o)
    o.dispose()
  }
}

/**
 * Applies store snapshot + user Fabric layers from a {@link DisplayDocumentV1}.
 * Waits for {@link CanvasWorkspace} to rebuild panel/guides from `design.config` before enlivening objects.
 */
export async function loadDisplayDocumentIntoCanvas(
  doc: DisplayDocumentV1,
  options?: LoadDisplayDocumentOptions,
): Promise<void> {
  if (options?.skipPresetDatasourceSync) {
    suppressArtboardPresetDatasourceSyncOnce()
  }

  await useCustomFontStore.getState().hydrateFromIndexedDb()

  beginDocumentApply()
  try {
    const { loadDesignSnapshot } = useDesignStore.getState()
    loadDesignSnapshot(doc.design)

    await waitTwoFrames()

    const canvas = useDesignStore.getState().fabricCanvas
    if (!canvas) {
      console.warn('[loadDisplayDocument] no fabric canvas after layout wait')
      return
    }

    canvas.discardActiveObject()
    removeUserObjectsFromCanvas(canvas)

    const instances = await util.enlivenObjects<FabricObject>(doc.fabricObjects, {
      reviver: (serialized, instance) => {
        const id = serialized?.appObjectId
        if (typeof id === 'string') {
          registerFabricObjectId(instance as FabricObject, id)
        }
      },
    })

    for (const obj of instances) {
      canvas.add(obj)
    }

    useDesignStore.getState().setSelectedObject(null)
    canvas.requestRenderAll()
    console.log('[loadDisplayDocument] applied', {
      objects: doc.design.objects.length,
      fabricObjects: doc.fabricObjects.length,
    })
  } finally {
    endDocumentApply()
  }
}

export async function loadDisplayDocumentFromJsonText(text: string): Promise<void> {
  const raw: unknown = JSON.parse(text)
  const doc = parseDisplayDocument(raw)
  await loadDisplayDocumentIntoCanvas(doc)
}

/** Resets store + canvas to default layout for a preset when no `display_*.json` exists. */
export async function applyEmptyDesignForPreset(presetId: ArtboardPresetId): Promise<void> {
  beginDocumentApply()
  try {
    useDesignStore.getState().loadDesignSnapshot(createDefaultDesignSnapshotForPreset(presetId))
    await waitTwoFrames()
    const canvas = useDesignStore.getState().fabricCanvas
    if (!canvas) {
      console.warn('[applyEmptyDesignForPreset] no fabric canvas after layout wait')
      return
    }
    canvas.discardActiveObject()
    removeUserObjectsFromCanvas(canvas)
    useDesignStore.getState().setSelectedObject(null)
    canvas.requestRenderAll()
    console.log('[applyEmptyDesignForPreset] reset', presetId)
  } finally {
    endDocumentApply()
  }
}
