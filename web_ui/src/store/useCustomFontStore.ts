import { create } from 'zustand'

import { rewireTextsFontFamily } from '../canvas/rewireTextsFontFamily'
import {
  idbDeleteCustomFont,
  idbListCustomFonts,
  idbPutCustomFont,
  type CustomFontStoredRecord,
} from '../lib/customFontsIndexedDb'
import { useDesignStore } from './useDesignStore'

/** Single-flight so React StrictMode / double mount does not register fonts twice. */
let hydrateInflight: Promise<void> | null = null

export type RegisteredCustomFont = {
  id: string
  familyName: string
  label: string
  fontFace: FontFace
}

type CustomFontStoreState = {
  fonts: RegisteredCustomFont[]
  status: 'idle' | 'loading' | 'ready' | 'error'
  errorMessage: string | null
  hydrateFromIndexedDb: () => Promise<void>
  addFromFile: (file: File) => Promise<void>
  removeById: (id: string) => Promise<void>
}

function isAllowedFontFile(file: File): boolean {
  return /\.(woff2|woff|ttf|otf)$/i.test(file.name)
}

function inferMimeType(file: File): string {
  if (file.type && file.type.startsWith('font/')) return file.type
  const n = file.name.toLowerCase()
  if (n.endsWith('.woff2')) return 'font/woff2'
  if (n.endsWith('.woff')) return 'font/woff'
  if (n.endsWith('.ttf')) return 'font/ttf'
  if (n.endsWith('.otf')) return 'font/otf'
  return 'application/octet-stream'
}

async function registerFontFace(familyName: string, buffer: ArrayBuffer): Promise<FontFace> {
  const face = new FontFace(familyName, buffer)
  await face.load()
  document.fonts.add(face)
  return face
}

export const useCustomFontStore = create<CustomFontStoreState>((set, get) => ({
  fonts: [],
  status: 'idle',
  errorMessage: null,

  hydrateFromIndexedDb: async () => {
    if (hydrateInflight) {
      await hydrateInflight
      return
    }
    hydrateInflight = (async () => {
      set({ status: 'loading', errorMessage: null })
      try {
        const rows = await idbListCustomFonts()
        rows.sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }))
        const fonts: RegisteredCustomFont[] = []
        for (const row of rows) {
          try {
            const fontFace = await registerFontFace(row.familyName, row.data)
            fonts.push({
              id: row.id,
              familyName: row.familyName,
              label: row.label,
              fontFace,
            })
          } catch (e) {
            console.warn('[customFonts] failed to register stored font', row.id, e)
          }
        }
        set({ fonts, status: 'ready', errorMessage: null })
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e)
        console.error('[customFonts] hydrate failed', e)
        set({ status: 'error', errorMessage: message })
        hydrateInflight = null
      }
    })()
    await hydrateInflight
  },

  addFromFile: async (file: File) => {
    if (!isAllowedFontFile(file)) {
      throw new Error('Use .woff2, .woff, .ttf, or .otf')
    }
    const id = crypto.randomUUID()
    const familyName = `AppPubFont_${id.replace(/-/g, '')}`
    const label = file.name
    const mimeType = inferMimeType(file)
    const buffer = await file.arrayBuffer()

    const record: CustomFontStoredRecord = {
      id,
      familyName,
      label,
      mimeType,
      createdAt: Date.now(),
      data: buffer.slice(0),
    }

    try {
      await idbPutCustomFont(record)
    } catch (e) {
      console.error('[customFonts] idb put failed', e)
      throw e instanceof Error ? e : new Error('Could not save font')
    }

    try {
      const fontFace = await registerFontFace(familyName, buffer)
      const entry: RegisteredCustomFont = { id, familyName, label, fontFace }
      set((s) => ({
        fonts: [...s.fonts, entry].sort((a, b) =>
          a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }),
        ),
      }))
    } catch (e) {
      await idbDeleteCustomFont(id).catch(() => {})
      throw e instanceof Error ? e : new Error('Could not load font')
    }
  },

  removeById: async (id: string) => {
    const entry = get().fonts.find((f) => f.id === id)
    if (!entry) return

    try {
      document.fonts.delete(entry.fontFace)
    } catch {
      /* ignore if delete unsupported */
    }

    await idbDeleteCustomFont(id)
    set((s) => ({ fonts: s.fonts.filter((f) => f.id !== id) }))
    rewireTextsFontFamily(useDesignStore.getState().fabricCanvas, entry.familyName)
  },
}))
