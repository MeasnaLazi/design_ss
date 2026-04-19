import { create } from 'zustand'

import { setScreenQuadConfigCache } from '../canvas/loadScreenRegion'
import {
  type CatalogDevice,
  type DeviceFrameType,
  DEVICE_FRAME_TYPES,
  loadDeviceCatalog,
  mergeQuadRowsFromDevices,
} from '../lib/deviceFrameCatalog'

export type DeviceFrameRegistryStatus = 'idle' | 'loading' | 'ready' | 'error'

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

const TYPE_ORDER: readonly DeviceFrameType[] = DEVICE_FRAME_TYPES

function devicesOfType(devices: CatalogDevice[], t: DeviceFrameType): CatalogDevice[] {
  return devices.filter((d) => d.manifest.type === t)
}

function pickDefaultForCatalog(devices: CatalogDevice[]): Pick<
  State,
  'selectedDeviceType' | 'selectedPackId' | 'selectedFrameName'
> {
  if (devices.length === 0) {
    return {
      selectedDeviceType: 'iphone',
      selectedPackId: null,
      selectedFrameName: 'front',
    }
  }
  for (const t of TYPE_ORDER) {
    const list = devicesOfType(devices, t)
    if (list.length > 0) {
      const first = list[0]
      const frameName = first.manifest.frames[0]?.name ?? 'front'
      return { selectedDeviceType: t, selectedPackId: first.id, selectedFrameName: frameName }
    }
  }
  const any = devices[0]
  return {
    selectedDeviceType: any.manifest.type,
    selectedPackId: any.id,
    selectedFrameName: any.manifest.frames[0]?.name ?? 'front',
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
  selectedFrameName: 'front',

  loadRegistry: async () => {
    const { status, devices } = get()
    if (status === 'ready' && devices.length > 0) return
    if (!registryLoadInflight) {
      registryLoadInflight = (async () => {
        set({ status: 'loading', errorMessage: null })
        try {
          const nextDevices = await loadDeviceCatalog()
          const merged = mergeQuadRowsFromDevices(nextDevices)
          setScreenQuadConfigCache(merged)
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
      selectedFrameName: first?.manifest.frames[0]?.name ?? 'front',
    })
  },

  setSelectedPackId: (packId) => {
    const { devices, selectedFrameName } = get()
    const dev = devices.find((d) => d.id === packId)
    if (!dev) return
    const names = new Set(dev.manifest.frames.map((f) => f.name))
    const nextFrame = names.has(selectedFrameName)
      ? selectedFrameName
      : (dev.manifest.frames[0]?.name ?? 'front')
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
