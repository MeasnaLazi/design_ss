import { create } from 'zustand'

import type { BlockNode, BlockReadout } from '../editor/blockRegistry'
import type { StripFile } from '../lib/api'
import type { StripGeometry } from '../editor/iframeBridge'

export type LoadStatus = 'idle' | 'loading' | 'ready' | 'error'

/**
 * Fit-width for a five-panel App Store strip (~6.6k px) lands near 0.15, well
 * under the 25% floor the plan sketched — so the usable range starts lower.
 */
export const ZOOM_MIN = 0.04
export const ZOOM_MAX = 2
export const ZOOM_STEPS = [0.05, 0.1, 0.15, 0.25, 0.5, 0.75, 1, 1.5, 2] as const

export function clampZoom(z: number): number {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z))
}

type EditorState = {
  files: StripFile[]
  filesLoaded: boolean
  /** Repo-relative path of the open strip, or null on the picker screen. */
  filePath: string | null
  /** Bumped to force a fresh iframe document (reload). */
  loadToken: number
  status: LoadStatus
  error: string | null
  /** Non-fatal device-build failures reported by device-frames.mjs. */
  composerErrors: string[]
  geometry: StripGeometry | null

  /**
   * The file exactly as read from disk. Saves are produced by patching this
   * text, never by serializing the live DOM — see `editor/serializeStrip.ts`.
   */
  originalHtml: string | null
  /** mtime of `originalHtml`, sent as the save precondition. */
  mtime: string | null
  saving: boolean
  saveError: string | null
  /** Set when the file changed on disk under us; the user picks how to resolve. */
  conflict: { expected: string; actual: string } | null

  /**
   * Who currently owns the document. While `agent`, the editing surface is
   * read-only — the same one-way lock web_ui uses, so an agent turn is never
   * interleaved with human edits on the same file.
   */
  mode: 'human' | 'agent'
  modeSince: string | null
  modeHolder: string | null
  /** When the agent lease lapses; the editor unlocks itself at that point. */
  modeExpiresAt: string | null
  /** The file changed on disk and the editor has unsaved work to reconcile. */
  externalChange: { mtime: string } | null
  /** Last export result, for the toolbar panel. */
  exporting: boolean
  /**
   * Whether the file-watch stream is connected. Shown in the toolbar because a
   * watcher that silently stopped working looks exactly like a watcher that has
   * nothing to report.
   */
  watchState: 'connecting' | 'live' | 'offline'
  /** Transient toolbar message (saved, exported, reloaded). */
  notice: string | null

  /** Selectable nodes of the open document, panels and layers interleaved. */
  nodes: BlockNode[]
  selectedId: string | null
  hoveredId: string | null
  /** Node with an open contentEditable session, if any. */
  editingId: string | null
  /** Measured properties of the selected node; recomputed on selection change. */
  readout: BlockReadout | null

  zoom: number
  /** `fit` recomputes zoom on container resize; any manual change pins it. */
  zoomMode: 'fit' | 'manual'
  showPanelOutlines: boolean

  setFiles: (files: StripFile[]) => void
  openFile: (path: string) => void
  closeFile: () => void
  reload: () => void
  setLoading: () => void
  setReady: (geometry: StripGeometry, nodes: BlockNode[], composerErrors: string[]) => void
  setError: (message: string) => void
  select: (id: string | null) => void
  setHovered: (id: string | null) => void
  setReadout: (readout: BlockReadout | null) => void
  setEditing: (id: string | null) => void
  setSource: (html: string, mtime: string) => void
  setSaving: (saving: boolean) => void
  setSaveError: (message: string | null) => void
  setConflict: (conflict: { expected: string; actual: string } | null) => void
  setMode: (mode: 'human' | 'agent', since: string | null, holder: string | null, expiresAt?: string | null) => void
  setExternalChange: (change: { mtime: string } | null) => void
  setExporting: (exporting: boolean) => void
  setWatchState: (state: 'connecting' | 'live' | 'offline') => void
  setNotice: (notice: string | null) => void
  /** After a successful write: the saved text becomes the new patch baseline. */
  onSaved: (html: string, mtime: string) => void
  setZoom: (zoom: number) => void
  setFitZoom: (zoom: number) => void
  useFitZoom: () => void
  togglePanelOutlines: () => void
}

export const useEditorStore = create<EditorState>((set) => ({
  files: [],
  filesLoaded: false,
  filePath: null,
  loadToken: 0,
  status: 'idle',
  error: null,
  composerErrors: [],
  geometry: null,

  originalHtml: null,
  mtime: null,
  saving: false,
  saveError: null,
  conflict: null,

  mode: 'human',
  modeSince: null,
  modeHolder: null,
  modeExpiresAt: null,
  externalChange: null,
  exporting: false,
  watchState: 'connecting',
  notice: null,

  nodes: [],
  selectedId: null,
  hoveredId: null,
  editingId: null,
  readout: null,

  zoom: 0.15,
  zoomMode: 'fit',
  showPanelOutlines: true,

  setFiles: (files) => set({ files, filesLoaded: true }),
  openFile: (path) =>
    set((s) => ({
      filePath: path,
      loadToken: s.loadToken + 1,
      status: 'loading',
      error: null,
      composerErrors: [],
      geometry: null,
      nodes: [],
      selectedId: null,
      hoveredId: null,
      editingId: null,
      readout: null,
      originalHtml: null,
      mtime: null,
      saveError: null,
      conflict: null,
      externalChange: null,
      zoomMode: 'fit',
    })),
  closeFile: () =>
    set({
      filePath: null,
      status: 'idle',
      error: null,
      geometry: null,
      composerErrors: [],
      nodes: [],
      selectedId: null,
      hoveredId: null,
      editingId: null,
      readout: null,
      originalHtml: null,
      mtime: null,
      saveError: null,
      conflict: null,
      externalChange: null,
    }),
  reload: () =>
    set((s) => ({
      loadToken: s.loadToken + 1,
      status: 'loading',
      error: null,
      composerErrors: [],
      nodes: [],
      // Element references die with the old document; ids are re-derived on index.
      selectedId: null,
      hoveredId: null,
      editingId: null,
      readout: null,
      originalHtml: null,
      mtime: null,
      saveError: null,
      conflict: null,
      externalChange: null,
    })),
  setLoading: () => set({ status: 'loading', error: null }),
  setReady: (geometry, nodes, composerErrors) =>
    set({ status: 'ready', geometry, nodes, composerErrors, error: null }),
  setError: (message) => set({ status: 'error', error: message }),
  select: (id) => set({ selectedId: id, readout: null }),
  setHovered: (id) => set({ hoveredId: id }),
  setReadout: (readout) => set({ readout }),
  setEditing: (editingId) => set({ editingId }),
  setSource: (html, mtime) => set({ originalHtml: html, mtime }),
  setSaving: (saving) => set({ saving }),
  setSaveError: (saveError) => set({ saveError }),
  setConflict: (conflict) => set({ conflict }),
  setMode: (mode, modeSince, modeHolder, modeExpiresAt = null) =>
    set({ mode, modeSince, modeHolder, modeExpiresAt }),
  setExternalChange: (externalChange) => set({ externalChange }),
  setExporting: (exporting) => set({ exporting }),
  setWatchState: (watchState) => set({ watchState }),
  setNotice: (notice) => set({ notice }),
  onSaved: (html, mtime) =>
    set({ originalHtml: html, mtime, saving: false, saveError: null, conflict: null, externalChange: null }),

  setZoom: (zoom) => set({ zoom: clampZoom(zoom), zoomMode: 'manual' }),
  // Fit updates must not flip the mode — they come from the resize observer.
  setFitZoom: (zoom) => set({ zoom: clampZoom(zoom) }),
  useFitZoom: () => set({ zoomMode: 'fit' }),
  togglePanelOutlines: () => set((s) => ({ showPanelOutlines: !s.showPanelOutlines })),
}))
