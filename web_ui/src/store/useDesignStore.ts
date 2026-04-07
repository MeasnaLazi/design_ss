import type {
  DesignConfig,
  DesignConfigPartial,
  DesignObjectRecord,
} from './designTypes'
import {
  SCREEN_LAYOUT_COUNT_MAX,
  SCREEN_LAYOUT_COUNT_MIN,
  SCREEN_LAYOUT_GAP_MAX,
  SCREEN_LAYOUT_GAP_MIN,
} from '../constants/appStoreScreens'

import type { Canvas } from 'fabric'
import { create } from 'zustand'

function clampLayoutScreens(value: number): number {
  const n = Math.round(Number.isFinite(value) ? value : SCREEN_LAYOUT_COUNT_MIN)
  return Math.min(SCREEN_LAYOUT_COUNT_MAX, Math.max(SCREEN_LAYOUT_COUNT_MIN, n))
}

function clampLayoutGap(value: number): number {
  const n = Math.round(Number.isFinite(value) ? value : SCREEN_LAYOUT_GAP_MIN)
  return Math.min(SCREEN_LAYOUT_GAP_MAX, Math.max(SCREEN_LAYOUT_GAP_MIN, n))
}

const defaultConfig: DesignConfig = {
  screens: 5,
  gap: 40,
  background: '#1a1a1a',
  backgroundMode: 'solid',
  backgroundGradient: {
    colorFrom: '#0f172a',
    colorTo: '#1e293b',
    angleDeg: 135,
  },
  backgroundImageUrl: null,
}

/** Default / reset zoom: 20% on-screen vs full App Store artboard (CSS scale; backstore stays 1:1). */
export const CANVAS_ZOOM_DEFAULT = 0.2

export const CANVAS_ZOOM_MIN = 0.1
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
  /** On-screen scale vs full artboard (0.2 = 20%). CSS-only; backstore stays native pixels. */
  canvasZoom: number
}

export interface DesignStoreActions {
  setConfig: (partial: DesignConfigPartial) => void
  /** Clears the canvas background image URL (explicit null merge). */
  clearCanvasBackgroundImage: () => void
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
  canvasZoom: CANVAS_ZOOM_DEFAULT,

  setConfig: (partial: DesignConfigPartial) =>
    set((state) => {
      const { backgroundGradient: partialGradient, ...restPartial } = partial
      const next: DesignConfig = { ...state.config, ...restPartial }
      if (partialGradient !== undefined) {
        next.backgroundGradient = {
          ...state.config.backgroundGradient,
          ...partialGradient,
        }
      }
      if (partial.screens !== undefined) {
        next.screens = clampLayoutScreens(next.screens)
      }
      if (partial.gap !== undefined) {
        next.gap = clampLayoutGap(next.gap)
      }
      return { config: next }
    }),

  clearCanvasBackgroundImage: () =>
    set((state) => ({
      config: { ...state.config, backgroundImageUrl: null },
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

  setSelectedObject: (selectedObject) =>
    set((state) =>
      state.selectedObject === selectedObject ? state : { selectedObject },
    ),

  setFabricCanvas: (fabricCanvas) => set({ fabricCanvas }),

  zoomCanvasIn: () =>
    set((state) => ({
      canvasZoom: clampCanvasZoom(state.canvasZoom * CANVAS_ZOOM_STEP_RATIO),
    })),

  zoomCanvasOut: () =>
    set((state) => ({
      canvasZoom: clampCanvasZoom(state.canvasZoom / CANVAS_ZOOM_STEP_RATIO),
    })),

  resetCanvasZoom: () => set({ canvasZoom: CANVAS_ZOOM_DEFAULT }),
}))
