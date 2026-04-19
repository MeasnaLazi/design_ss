import { create } from 'zustand'

import { setScreenQuadConfigCache } from '../canvas/loadScreenRegion'
import {
  type CatalogDevice,
  type DeviceFrameType,
  DEVICE_FRAME_TYPES,
  loadDeviceFrameRegistry,
} from '../lib/deviceFrameCatalog'

type DeviceFrameRegistryStatus = 'idle' | 'loading' | 'ready' | 'error'

type State = {
  status: DeviceFrameRegistryStatus
  errorMessage: string | null
  devices: CatalogDevice[]
  /** Product category filter (matches manifest `type`). */
  selectedDeviceType: DeviceFrameType
  /** Pack folder id, e.g. `iphone_12_pro`. */
  selectedPackId: string | null
  /** Selected angle / preset: `frames[].name` in the active manifest. */
  selectedFrameName: string
}

type Actions = {
  loadRegistry: () => Promise<void>
  setSelectedDeviceType: (t: DeviceFrameType) => void
  setSelectedPackId: (packId: string) => void
  setSelectedFrameName: (name: string) => void
}

const DEFAULT_FRAME_PRESET = 'front' as const

function devicesOfType(devices: CatalogDevice[], t: DeviceFrameType): CatalogDevice[] {
  return devices.filter((d) => d.manifest.type === t)
}

function firstFrameName(frames: readonly { name: string }[]): string {
  return frames[0]?.name ?? DEFAULT_FRAME_PRESET
}

function pickDefaultForCatalog(devices: CatalogDevice[]): Pick<
  State,
  'selectedDeviceType' | 'selectedPackId' | 'selectedFrameName'
> {
  if (devices.length === 0) {
    return {
      selectedDeviceType: 'iphone',
      selectedPackId: null,
      selectedFrameName: DEFAULT_FRAME_PRESET,
    }
  }
  for (const t of DEVICE_FRAME_TYPES) {
    const list = devicesOfType(devices, t)
    if (list.length > 0) {
      const first = list[0]
      return {
        selectedDeviceType: t,
        selectedPackId: first.id,
        selectedFrameName: firstFrameName(first.manifest.frames),
      }
    }
  }
  const any = devices[0]
  return {
    selectedDeviceType: any.manifest.type,
    selectedPackId: any.id,
    selectedFrameName: firstFrameName(any.manifest.frames),
  }
}

/** Dedupes overlapping `loadRegistry` calls (e.g. React StrictMode double mount). */
let registryLoadInflight: Promise<void> | null = null

export const useDeviceFramePackStore = create<State & Actions>((set, get) => ({
  status: 'idle',
  errorMessage: null,
  devices: [],
  selectedDeviceType: 'iphone',
  selectedPackId: null,
  selectedFrameName: DEFAULT_FRAME_PRESET,

  loadRegistry: async () => {
    const { status, devices } = get()
    if (status === 'ready' && devices.length > 0) return
    if (!registryLoadInflight) {
      registryLoadInflight = (async () => {
        set({ status: 'loading', errorMessage: null })
        try {
          const { devices: nextDevices, quadConfigRows } = await loadDeviceFrameRegistry()
          setScreenQuadConfigCache(quadConfigRows)
          const defaults = pickDefaultForCatalog(nextDevices)
          set({
            devices: nextDevices,
            status: 'ready',
            ...defaults,
          })
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e)
          setScreenQuadConfigCache([])
          set({
            status: 'error',
            errorMessage: msg,
            devices: [],
            selectedPackId: null,
          })
        }
      })().finally(() => {
        registryLoadInflight = null
      })
    }
    await registryLoadInflight
  },

  setSelectedDeviceType: (t) => {
    const { devices } = get()
    const list = devicesOfType(devices, t)
    const first = list[0]
    set({
      selectedDeviceType: t,
      selectedPackId: first?.id ?? null,
      selectedFrameName: first ? firstFrameName(first.manifest.frames) : DEFAULT_FRAME_PRESET,
    })
  },

  setSelectedPackId: (packId) => {
    const { devices, selectedFrameName } = get()
    const dev = devices.find((d) => d.id === packId)
    if (!dev) return
    const names = new Set(dev.manifest.frames.map((f) => f.name))
    const nextFrame = names.has(selectedFrameName)
      ? selectedFrameName
      : firstFrameName(dev.manifest.frames)
    set({
      selectedPackId: packId,
      selectedDeviceType: dev.manifest.type,
      selectedFrameName: nextFrame,
    })
  },

  setSelectedFrameName: (name) => {
    set({ selectedFrameName: name })
  },
}))
