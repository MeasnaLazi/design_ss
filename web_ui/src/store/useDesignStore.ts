import type { Canvas } from 'fabric'
import { create } from 'zustand'
import type { DesignConfig, DesignObjectRecord } from './designTypes'

const defaultConfig: DesignConfig = {
  screens: 5,
  gap: 40,
  background: '#1a1a1a',
  backgroundImageUrl: null,
}

export interface DesignStoreState {
  config: DesignConfig
  objects: DesignObjectRecord[]
  /** Fabric object id (or app layer id) of the current selection; null when nothing selected */
  selectedObject: string | null
  /** Singleton Fabric canvas; set by CanvasWorkspace only */
  fabricCanvas: Canvas | null
}

export interface DesignStoreActions {
  setConfig: (partial: Partial<DesignConfig>) => void
  setObjects: (objects: DesignObjectRecord[]) => void
  upsertObject: (object: DesignObjectRecord) => void
  removeObject: (id: string) => void
  setSelectedObject: (id: string | null) => void
  setFabricCanvas: (canvas: Canvas | null) => void
}

export type DesignStore = DesignStoreState & DesignStoreActions

export const useDesignStore = create<DesignStore>((set) => ({
  config: { ...defaultConfig },
  objects: [],
  selectedObject: null,
  fabricCanvas: null,

  setConfig: (partial) =>
    set((state) => ({
      config: { ...state.config, ...partial },
    })),

  setObjects: (objects) => set({ objects }),

  upsertObject: (object) =>
    set((state) => {
      const idx = state.objects.findIndex((o) => o.id === object.id)
      if (idx === -1) {
        return { objects: [...state.objects, object] }
      }
      const next = [...state.objects]
      next[idx] = object
      return { objects: next }
    }),

  removeObject: (id) =>
    set((state) => ({
      objects: state.objects.filter((o) => o.id !== id),
      selectedObject: state.selectedObject === id ? null : state.selectedObject,
    })),

  setSelectedObject: (selectedObject) => set({ selectedObject }),

  setFabricCanvas: (fabricCanvas) => set({ fabricCanvas }),
}))
