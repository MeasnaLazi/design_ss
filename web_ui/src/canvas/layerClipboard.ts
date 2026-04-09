import {
  ActiveSelection,
  type Canvas,
  type FabricObject,
  IText,
  Group,
  util,
} from 'fabric'

import {
  getFabricObjectId,
  registerFabricObjectId,
} from '../lib/fabricObjectRegistry'
import type { DesignObjectRecord } from '../store/designTypes'
import { useDesignStore } from '../store/useDesignStore'

import { isDesignSystemCanvasObject } from './canvasObjectMarks'
import { reindexLayersFromCanvas } from './reindexLayersFromCanvas'

const PASTE_OFFSET = 24

export type LayerClipboardItem = {
  fabricPlain: Record<string, unknown>
  designRecord: DesignObjectRecord
}

type LayerClipboardPayload = {
  items: LayerClipboardItem[]
}

let clipboard: LayerClipboardPayload | null = null

function inferDesignRecordFallback(obj: FabricObject, id: string): DesignObjectRecord {
  if (obj instanceof IText) {
    return { id, kind: 'text', name: 'Text', zIndex: 0 }
  }
  if (obj instanceof Group) {
    return { id, kind: 'device', name: 'Device', zIndex: 0 }
  }
  return { id, kind: 'shape', name: 'Layer', zIndex: 0 }
}

function collectCopyTargets(canvas: Canvas): FabricObject[] {
  const active = canvas.getActiveObject()
  if (!active) return []

  if (active instanceof ActiveSelection) {
    return active
      .getObjects()
      .filter((o) => !isDesignSystemCanvasObject(o) && getFabricObjectId(o))
  }

  if (isDesignSystemCanvasObject(active)) return []
  const id = getFabricObjectId(active)
  if (!id) return []
  return [active]
}

function snapshotItemForObject(obj: FabricObject): LayerClipboardItem | null {
  const id = getFabricObjectId(obj)
  if (!id) return null

  const { objects } = useDesignStore.getState()
  const designRecord =
    objects.find((o) => o.id === id) ?? inferDesignRecordFallback(obj, id)

  const fabricPlain = obj.toObject() as Record<string, unknown>
  fabricPlain.appObjectId = id

  return {
    fabricPlain: JSON.parse(JSON.stringify(fabricPlain)) as Record<string, unknown>,
    designRecord: { ...designRecord },
  }
}

/**
 * Copies the current canvas selection (single object or {@link ActiveSelection}) into an in-memory clipboard.
 * Returns whether anything was copied.
 */
export function copySelectedLayersToClipboard(): boolean {
  const canvas = useDesignStore.getState().fabricCanvas
  if (!canvas) return false

  const targets = collectCopyTargets(canvas)
  if (targets.length === 0) return false

  const items: LayerClipboardItem[] = []
  for (const obj of targets) {
    const item = snapshotItemForObject(obj)
    if (item) items.push(item)
  }

  if (items.length === 0) return false

  clipboard = { items }
  console.log('[layerClipboard] copied', items.length, 'layer(s)')
  return true
}

export function hasLayerClipboard(): boolean {
  return clipboard !== null && (clipboard?.items.length ?? 0) > 0
}

/**
 * Duplicates clipboard layers with new ids, nudged position, and store metadata. Re-selects the pasted objects.
 */
export async function pasteLayersFromClipboard(): Promise<boolean> {
  const canvas = useDesignStore.getState().fabricCanvas
  const payload = clipboard
  if (!canvas || !payload?.items.length) return false

  const baseZ =
    useDesignStore.getState().objects.reduce((m, o) => Math.max(m, o.zIndex), -1) + 1

  const instances: FabricObject[] = []

  for (let i = 0; i < payload.items.length; i++) {
    const { fabricPlain, designRecord } = payload.items[i]
    const plain = JSON.parse(JSON.stringify(fabricPlain)) as Record<string, unknown>

    const newId = crypto.randomUUID()
    plain.appObjectId = newId

    const left = Number(plain.left)
    const top = Number(plain.top)
    if (Number.isFinite(left)) plain.left = left + PASTE_OFFSET
    if (Number.isFinite(top)) plain.top = top + PASTE_OFFSET

    const [enlivened] = await util.enlivenObjects<FabricObject>([plain], {
      reviver: (serialized, instance) => {
        const id = serialized?.appObjectId
        if (typeof id === 'string') {
          registerFabricObjectId(instance as FabricObject, id)
        }
      },
    })

    if (!enlivened) continue

    const nextRecord: DesignObjectRecord = {
      ...designRecord,
      id: newId,
      zIndex: baseZ + i,
    }

    useDesignStore.getState().upsertObject(nextRecord)
    canvas.add(enlivened)
    instances.push(enlivened)
  }

  if (instances.length === 0) return false

  reindexLayersFromCanvas()

  if (instances.length === 1) {
    canvas.setActiveObject(instances[0])
    const id = getFabricObjectId(instances[0])
    useDesignStore.getState().setSelectedObject(id ?? null)
  } else {
    const sel = new ActiveSelection(instances, { canvas })
    canvas.setActiveObject(sel)
    useDesignStore.getState().setSelectedObject(null)
  }

  canvas.requestRenderAll()
  console.log('[layerClipboard] pasted', instances.length, 'layer(s)')
  return true
}
