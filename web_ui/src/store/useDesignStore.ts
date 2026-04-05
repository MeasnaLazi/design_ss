import type { Canvas } from 'fabric'
import { create } from 'zustand'
import type { DesignConfig, DesignObjectRecord } from './designTypes'

const defaultConfig: DesignConfig = {
  screens: 5,
  gap: 40,
  background: '#1a1a1a',
  backgroundImageUrl: null,
}

export const CANVAS_ZOOM_MIN = 0.25
export const CANVAS_ZOOM_MAX = 4
const CANVAS_ZOOM_STEP_RATIO = 1.15

function clampCanvasZoom(value: number): number {
  const n = Math.round(value * 100) / 100
  return Math.min(CANVAS_ZOOM_MAX, Math.max(CANVAS_ZOOM_MIN, n))
}

export interface DesignStoreState {
  config: DesignConfig
  objects: DesignObjectRecord[]
  /** Fabric object id (or app layer id) of the current selection; null when nothing selected */
  selectedObject: string | null
  /** Singleton Fabric canvas; set by CanvasWorkspace only */
  fabricCanvas: Canvas | null
  /** Viewport zoom for the design canvas (1 = 100%). Applied by CanvasWorkspace to Fabric only. */
  canvasZoom: number
}

export interface DesignStoreActions {
  setConfig: (partial: Partial<DesignConfig>) => void
  setObjects: (objects: DesignObjectRecord[]) => void
  upsertObject: (object: DesignObjectRecord) => void
  removeObject: (id: string) => void
  setSelectedObject: (id: string | null) => void
  setFabricCanvas: (canvas: Canvas | null) => void
  zoomCanvasIn: () => void
  zoomCanvasOut: () => void
  resetCanvasZoom: () => void
}

export type DesignStore = DesignStoreState & DesignStoreActions

export const useDesignStore = create<DesignStore>((set) => ({
  config: { ...defaultConfig },
  objects: [],
  selectedObject: null,
  fabricCanvas: null,
  canvasZoom: 1,

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

  zoomCanvasIn: () =>
    set((state) => ({
      canvasZoom: clampCanvasZoom(state.canvasZoom * CANVAS_ZOOM_STEP_RATIO),
    })),

  zoomCanvasOut: () =>
    set((state) => ({
      canvasZoom: clampCanvasZoom(state.canvasZoom / CANVAS_ZOOM_STEP_RATIO),
    })),

  resetCanvasZoom: () => set({ canvasZoom: 1 }),
}))
