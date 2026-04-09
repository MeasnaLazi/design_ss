import { useEffect, useId, useState } from 'react'
import { ChevronDown, Download, LayoutTemplate, Save, Trash2 } from 'lucide-react'

import { loadDisplayDocumentIntoCanvas } from '../../canvas/loadDisplayDocument'
import { exportAppStoreScreensToZip } from '../../canvas/exportAppStoreScreens'
import {
  getArtboardDimensionsFromConfig,
} from '../../constants/artboardPresets'
import { buildDisplayDocumentFromCanvas } from '../../canvas/serializeDisplayDocument'
import { saveDisplayToDatasource } from '../../lib/saveDisplayToDatasource'
import {
  deleteDesignTemplate,
  listDesignTemplates,
  loadDesignTemplateDocument,
  saveDesignTemplate,
  type DesignTemplateListItem,
} from '../../lib/designTemplatePersistence'
import { useDesignStore } from '../../store/useDesignStore'
import { useToastStore } from '../../store/useToastStore'
import type { DisplayDocumentV1 } from '../../types/displayDocument'

import { ContextualDeviceToolbar } from './ContextualDeviceToolbar'
import { ContextualPositionToolbar } from './ContextualPositionToolbar'
import { ContextualTextToolbar } from './ContextualTextToolbar'

export function TopToolbar() {
  const screens = useDesignStore((s) => s.config.screens)
  const gap = useDesignStore((s) => s.config.gap)

  const saveDialogTitleId = useId()
  const loadDialogTitleId = useId()
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false)
  const [loadTemplateOpen, setLoadTemplateOpen] = useState(false)
  const [templateNameDraft, setTemplateNameDraft] = useState('')
  const [templateList, setTemplateList] = useState<DesignTemplateListItem[]>([])

  useEffect(() => {
    if (!saveTemplateOpen && !loadTemplateOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSaveTemplateOpen(false)
        setLoadTemplateOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [saveTemplateOpen, loadTemplateOpen])

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

  const handleSaveAsTemplate = async () => {
    const { showToast } = useToastStore.getState()
    const doc = buildCurrentDisplayDocument()
    if (!doc) {
      showToast('Could not save template — canvas is not ready yet.', 'error')
      return
    }
    try {
      const { item, persistedTo } = await saveDesignTemplate(templateNameDraft, doc)
      setSaveTemplateOpen(false)
      setTemplateNameDraft('')
      if (loadTemplateOpen) {
        setTemplateList(await listDesignTemplates())
      }
      if (persistedTo === 'datasource') {
        showToast(`Template saved to datasource/templates/${item.id}.`, 'success')
      } else {
        showToast(
          `Template “${item.name}” saved in this browser only (dev server not available).`,
          'warning',
        )
      }
    } catch (e) {
      if (e instanceof Error && e.message === 'empty_name') {
        showToast('Enter a template name.', 'error')
        return
      }
      console.error('[TopToolbar] save template failed', e)
      showToast('Could not save template.', 'error')
    }
  }

  const handleLoadTemplate = async (item: DesignTemplateListItem) => {
    const { showToast } = useToastStore.getState()
    const doc = await loadDesignTemplateDocument(item)
    if (!doc) {
      showToast('That template is missing or invalid.', 'error')
      setTemplateList(await listDesignTemplates())
      return
    }
    try {
      await loadDisplayDocumentIntoCanvas(doc)
      setLoadTemplateOpen(false)
      showToast('Template loaded.', 'success')
    } catch (e) {
      console.error('[TopToolbar] load template failed', e)
      showToast('Could not load template.', 'error')
    }
  }

  const handleDeleteTemplate = async (item: DesignTemplateListItem) => {
    const { showToast } = useToastStore.getState()
    const ok = await deleteDesignTemplate(item)
    if (!ok) {
      showToast(`Could not delete “${item.name}”.`, 'error')
      return
    }
    setTemplateList(await listDesignTemplates())
    showToast(`Removed “${item.name}”.`, 'success')
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
              onClick={() => void saveDisplayToDatasource()}
            >
              Save to datasource…
            </button>
            <button
              type="button"
              role="menuitem"
              className="px-3 py-1.5 text-left text-xs text-zinc-100 hover:bg-zinc-800"
              onClick={() => {
                setTemplateNameDraft('')
                setSaveTemplateOpen(true)
              }}
            >
              Save as template…
            </button>
            <button
              type="button"
              role="menuitem"
              className="px-3 py-1.5 text-left text-xs text-zinc-100 hover:bg-zinc-800"
              onClick={() => {
                void (async () => {
                  setTemplateList(await listDesignTemplates())
                  setLoadTemplateOpen(true)
                })()
              }}
            >
              Load from template…
            </button>
          </div>
        </details>
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

      {saveTemplateOpen ? (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 p-4"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setSaveTemplateOpen(false)
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={saveDialogTitleId}
            className="w-full max-w-sm rounded-lg border border-zinc-700 bg-zinc-900 p-4 shadow-xl"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <h2 id={saveDialogTitleId} className="text-sm font-semibold text-zinc-100">
              Save as template
            </h2>
            <p className="mt-1 text-xs text-zinc-400">
              With the dev server running, saves under <span className="text-zinc-300">datasource/templates/</span>{' '}
              as JSON. If the API is unavailable, the template is stored in this browser only.
            </p>
            <label className="mt-3 block text-xs font-medium text-zinc-300" htmlFor="template-name">
              Name
            </label>
            <input
              id="template-name"
              type="text"
              value={templateNameDraft}
              onChange={(e) => setTemplateNameDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  void handleSaveAsTemplate()
                }
              }}
              className="mt-1 w-full rounded-md border border-zinc-600 bg-zinc-800 px-2 py-1.5 text-sm text-zinc-100 outline-none focus:border-emerald-600"
              placeholder="e.g. iPhone 5-screen dark"
              autoFocus
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-md px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-800"
                onClick={() => setSaveTemplateOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-500"
                onClick={() => void handleSaveAsTemplate()}
              >
                Save template
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {loadTemplateOpen ? (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 p-4"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setLoadTemplateOpen(false)
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={loadDialogTitleId}
            className="flex max-h-[min(28rem,80vh)] w-full max-w-md flex-col rounded-lg border border-zinc-700 bg-zinc-900 shadow-xl"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="border-b border-zinc-800 px-4 py-3">
              <h2 id={loadDialogTitleId} className="text-sm font-semibold text-zinc-100">
                Load from template
              </h2>
              <p className="mt-0.5 text-xs text-zinc-400">
                Replaces the current design on the canvas.
              </p>
            </div>
            <ul className="min-h-0 flex-1 overflow-y-auto p-2">
              {templateList.length === 0 ? (
                <li className="px-2 py-6 text-center text-xs text-zinc-500">
                  No templates yet. Use “Save as template…” to create one.
                </li>
              ) : (
                templateList.map((t) => (
                  <li
                    key={`${t.source}-${t.id}`}
                    className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-zinc-800/80"
                  >
                    <button
                      type="button"
                      className="min-w-0 flex-1 text-left text-xs text-zinc-100"
                      onClick={() => void handleLoadTemplate(t)}
                    >
                      <span className="block truncate font-medium">{t.name}</span>
                      <span className="block text-[10px] text-zinc-500">
                        {new Date(t.savedAt).toLocaleString()}
                        {t.source === 'datasource' ? ' · datasource/templates' : ' · this browser'}
                      </span>
                    </button>
                    <button
                      type="button"
                      className="shrink-0 rounded p-1.5 text-zinc-500 hover:bg-zinc-700 hover:text-red-400"
                      title="Delete template"
                      aria-label={`Delete template ${t.name}`}
                      onClick={() => void handleDeleteTemplate(t)}
                    >
                      <Trash2 className="size-3.5" aria-hidden />
                    </button>
                  </li>
                ))
              )}
            </ul>
            <div className="border-t border-zinc-800 px-4 py-2">
              <button
                type="button"
                className="w-full rounded-md py-1.5 text-xs font-medium text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                onClick={() => setLoadTemplateOpen(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </header>
  )
}
