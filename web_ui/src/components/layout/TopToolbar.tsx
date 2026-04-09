import { ChevronDown, Download, LayoutTemplate, Save } from 'lucide-react'
import { useRef } from 'react'

import { exportAppStoreScreensToZip } from '../../canvas/exportAppStoreScreens'
import {
  displayDocumentFilenameForPreset,
  getArtboardDimensionsFromConfig,
  getDisplayFileSlug,
} from '../../constants/artboardPresets'
import { loadDisplayDocumentIntoCanvas } from '../../canvas/loadDisplayDocument'
import { parseDisplayDocument } from '../../canvas/parseDisplayDocument'
import { buildDisplayDocumentFromCanvas } from '../../canvas/serializeDisplayDocument'
import {
  clearArtboardPresetDatasourceSyncSuppress,
  suppressArtboardPresetDatasourceSyncOnce,
} from '../../hooks/useArtboardPresetDisplaySync'
import { fetchDisplayDocument, putDisplayDocument } from '../../lib/datasourceApi'
import { useDesignStore } from '../../store/useDesignStore'
import { useToastStore } from '../../store/useToastStore'
import type { DisplayDocumentV1 } from '../../types/displayDocument'

import { ContextualDeviceToolbar } from './ContextualDeviceToolbar'
import { ContextualPositionToolbar } from './ContextualPositionToolbar'
import { ContextualTextToolbar } from './ContextualTextToolbar'

function downloadDisplayJson(doc: DisplayDocumentV1, filename: string): void {
  const blob = new Blob([JSON.stringify(doc, null, 2)], {
    type: 'application/json',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function TopToolbar() {
  const screens = useDesignStore((s) => s.config.screens)
  const gap = useDesignStore((s) => s.config.gap)
  const importFileRef = useRef<HTMLInputElement>(null)

  const handleExportZip = async () => {
    const canvas = useDesignStore.getState().fabricCanvas
    const cfg = useDesignStore.getState().config
    const { screens: n, gap: g } = cfg
    const { width: sw, height: sh } = getArtboardDimensionsFromConfig(cfg)
    const { showToast } = useToastStore.getState()
    if (!canvas) {
      console.warn('[TopToolbar] export: no canvas')
      showToast('Export failed — canvas is not ready yet.', 'error')
      return
    }
    try {
      await exportAppStoreScreensToZip(canvas, n, g, sw, sh)
      showToast('Screens exported — ZIP download started.', 'success')
    } catch (e) {
      console.error('[TopToolbar] export failed', e)
      showToast('Export failed — could not build the ZIP.', 'error')
    }
  }

  const buildCurrentDisplayDocument = (): DisplayDocumentV1 | null => {
    const canvas = useDesignStore.getState().fabricCanvas
    if (!canvas) {
      console.warn('[TopToolbar] save/load: no canvas')
      return null
    }
    return buildDisplayDocumentFromCanvas(canvas)
  }

  const handleSaveToDatasource = async () => {
    const { showToast } = useToastStore.getState()
    const doc = buildCurrentDisplayDocument()
    if (!doc) {
      showToast('Save failed — canvas is not ready yet.', 'error')
      return
    }
    const slug = getDisplayFileSlug(useDesignStore.getState().config.artboardPresetId)
    const basename = displayDocumentFilenameForPreset(
      useDesignStore.getState().config.artboardPresetId,
    )
    try {
      await putDisplayDocument(doc, slug)
      console.log('[TopToolbar] saved to datasource/', basename)
      showToast(`Saved to datasource/${basename}.`, 'success')
    } catch (e) {
      console.error('[TopToolbar] save to datasource failed (dev server only)', e)
      downloadDisplayJson(doc, basename)
      showToast(
        `Could not write to datasource (dev server only). Downloaded ${basename} instead.`,
        'warning',
      )
    }
  }

  const handleDownloadDisplayJson = () => {
    const { showToast } = useToastStore.getState()
    const doc = buildCurrentDisplayDocument()
    if (!doc) {
      showToast('Download failed — canvas is not ready yet.', 'error')
      return
    }
    const basename = displayDocumentFilenameForPreset(
      useDesignStore.getState().config.artboardPresetId,
    )
    downloadDisplayJson(doc, basename)
    showToast(`Download started — ${basename}.`, 'success')
  }

  const handleLoadFromDatasource = async () => {
    const { showToast } = useToastStore.getState()
    const slug = getDisplayFileSlug(useDesignStore.getState().config.artboardPresetId)
    const basename = displayDocumentFilenameForPreset(
      useDesignStore.getState().config.artboardPresetId,
    )
    suppressArtboardPresetDatasourceSyncOnce()
    try {
      const raw = await fetchDisplayDocument(slug)
      const doc = parseDisplayDocument(raw)
      await loadDisplayDocumentIntoCanvas(doc)
      showToast(`Design loaded from datasource/${basename}.`, 'success')
    } catch (e) {
      console.error('[TopToolbar] load from datasource failed', e)
      showToast(
        `Could not load datasource/${basename}. Save or import a design first.`,
        'error',
      )
    } finally {
      queueMicrotask(() => clearArtboardPresetDatasourceSyncSuppress())
    }
  }

  const triggerImportFilePick = () => {
    importFileRef.current?.click()
  }

  const handleImportFileChange = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const { showToast } = useToastStore.getState()
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      const text = await file.text()
      const raw: unknown = JSON.parse(text)
      const doc = parseDisplayDocument(raw)
      const importSlug = getDisplayFileSlug(doc.design.config.artboardPresetId)
      const importBasename = displayDocumentFilenameForPreset(
        doc.design.config.artboardPresetId,
      )
      let wroteDatasource = false
      suppressArtboardPresetDatasourceSyncOnce()
      try {
        await loadDisplayDocumentIntoCanvas(doc)
        try {
          await putDisplayDocument(doc, importSlug)
          wroteDatasource = true
          console.log('[TopToolbar] copied display file into datasource/', importBasename)
        } catch (putErr) {
          console.error('[TopToolbar] import: could not write datasource', putErr)
        }
      } finally {
        queueMicrotask(() => clearArtboardPresetDatasourceSyncSuppress())
      }
      if (wroteDatasource) {
        showToast(
          `Imported “${file.name}” — saved to datasource and applied.`,
          'success',
        )
      } else {
        showToast(
          'Design applied from file, but datasource could not be updated (dev server only).',
          'warning',
        )
      }
    } catch (err) {
      console.error('[TopToolbar] display file failed', err)
      showToast('Invalid display.json or could not apply the design.', 'error')
    }
  }

  return (
    <header
      className="relative z-50 flex h-12 shrink-0 items-center gap-3 border-b border-zinc-800 bg-zinc-900/80 px-4 backdrop-blur-sm"
      role="banner"
    >
      <div className="flex shrink-0 items-center gap-2">
        <LayoutTemplate className="size-5 text-emerald-400" aria-hidden />
        <span className="font-semibold tracking-tight text-zinc-100">
          App Store Screenshot Designer
        </span>
      </div>

      <div className="flex min-w-0 flex-1 items-center justify-center gap-2 overflow-x-auto px-1">
        <ContextualTextToolbar />
        <ContextualDeviceToolbar />
      </div>

      <div className="flex shrink-0 items-center gap-2 sm:gap-3">
        <ContextualPositionToolbar />
        <details className="relative">
          <summary className="flex cursor-pointer list-none items-center gap-1 rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-xs font-medium text-zinc-100 hover:bg-zinc-700 [&::-webkit-details-marker]:hidden">
            <Save className="size-3.5 shrink-0" aria-hidden />
            <span className="hidden sm:inline">Design</span>
            <ChevronDown className="size-3.5 shrink-0 opacity-70" aria-hidden />
          </summary>
          <div
            role="menu"
            className="absolute right-0 z-[100] mt-1 flex min-w-[11rem] flex-col rounded-md border border-zinc-700 bg-zinc-900 py-1 shadow-lg"
          >
            <button
              type="button"
              role="menuitem"
              className="px-3 py-1.5 text-left text-xs text-zinc-100 hover:bg-zinc-800"
              onClick={() => void handleSaveToDatasource()}
            >
              Save to datasource…
            </button>
            <button
              type="button"
              role="menuitem"
              className="px-3 py-1.5 text-left text-xs text-zinc-100 hover:bg-zinc-800"
              onClick={handleDownloadDisplayJson}
            >
              Download preset JSON…
            </button>
            <button
              type="button"
              role="menuitem"
              className="px-3 py-1.5 text-left text-xs text-zinc-100 hover:bg-zinc-800"
              onClick={() => void handleLoadFromDatasource()}
            >
              Load from datasource
            </button>
            <button
              type="button"
              role="menuitem"
              className="px-3 py-1.5 text-left text-xs text-zinc-100 hover:bg-zinc-800"
              onClick={() => triggerImportFilePick()}
            >
              Import to datasource…
            </button>
          </div>
        </details>
        <input
          ref={importFileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          aria-hidden
          onChange={(ev) => void handleImportFileChange(ev)}
        />
        <button
          type="button"
          onClick={handleExportZip}
          className="flex items-center gap-1.5 rounded-md border border-zinc-700 bg-zinc-800 px-2.5 py-1.5 text-xs font-medium text-zinc-100 hover:bg-zinc-700"
          title="Download each screen as PNG in a ZIP"
        >
          <Download className="size-3.5" aria-hidden />
          <span className="hidden sm:inline">Export ZIP</span>
        </button>
        <div className="hidden text-xs text-zinc-500 lg:block" aria-live="polite">
          {screens} screens · gap {gap}px
        </div>
      </div>
    </header>
  )
}
