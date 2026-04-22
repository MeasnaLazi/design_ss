import { useEffect, useId, useMemo, useRef, useState, type ChangeEvent, type KeyboardEvent } from 'react'
import {
  ChevronDown,
  ChevronUp,
  ImagePlus,
  Layers,
  LayoutTemplate,
  Library,
  Palette,
  Smartphone,
  Trash2,
  Type,
  Upload,
} from 'lucide-react'

import { addDeviceFrameToCanvas } from '../../canvas/addDeviceFrameToCanvas'
import {
  addTextboxToCanvas,
  DEFAULT_TEXTBOX_WIDTH,
  DEFAULT_TEXT_FONT_SIZE,
} from '../../canvas/addTextboxToCanvas'
import { loadDisplayDocumentIntoCanvas } from '../../canvas/loadDisplayDocument'
import { buildDisplayDocumentFromCanvas } from '../../canvas/serializeDisplayDocument'
import { deleteLayerById, selectLayerById } from '../../canvas/deleteLayerById'
import {
  getUserLayerIdsBottomToTop,
  moveLayerById,
} from '../../canvas/moveLayerOrder'
import {
  ARTBOARD_PRESETS,
  type ArtboardPresetId,
  screenshotBucketForConfig,
} from '../../constants/artboardPresets'
import {
  SCREEN_LAYOUT_COUNT_MAX,
  SCREEN_LAYOUT_COUNT_MIN,
  SCREEN_LAYOUT_GAP_MAX,
  SCREEN_LAYOUT_GAP_MIN,
} from '../../constants/appStoreScreens'
import { TEXT_STYLE_PRESETS, type TextStylePresetId } from '../../constants/textStylePresets'
import { activePackStyles, DEVICE_FRAME_TYPES, type DeviceFrameType } from '../../lib/deviceFrameCatalog'
import { useDeviceFramePackStore } from '../../store/useDeviceFramePackStore'
import { uploadScreenshotFile } from '../../lib/datasourceScreenshotsApi'
import { useCustomFontStore } from '../../store/useCustomFontStore'
import { useDesignStore } from '../../store/useDesignStore'
import { useToastStore } from '../../store/useToastStore'
import {
  deleteDesignTemplate,
  listDesignTemplates,
  loadDesignTemplateDocument,
  saveDesignTemplate,
  type DesignTemplateListItem,
} from '../../lib/designTemplatePersistence'
import {
  resetDesignHistoryFromCurrentCanvas,
} from '../../history/designHistory'
import type { DisplayDocumentV1 } from '../../types/displayDocument'

import { CanvasGradientControls } from './CanvasGradientControls'

type CanvasFillTab = 'solid' | 'gradient' | 'image'

type SidebarSectionId =
  | 'background'
  | 'artboard'
  | 'text'
  | 'deviceFrame'
  | 'layers'
  | 'templates'

const SECTION_NAV: {
  id: SidebarSectionId
  label: string
  Icon: typeof Palette
}[] = [
  { id: 'background', label: 'Background', Icon: Palette },
  { id: 'artboard', label: 'Artboard', Icon: LayoutTemplate },
  { id: 'text', label: 'Text', Icon: Type },
  { id: 'deviceFrame', label: 'Device frame', Icon: Smartphone },
  { id: 'layers', label: 'Layers', Icon: Layers },
  { id: 'templates', label: 'Templates', Icon: Library },
]

export function LeftSidebar() {
  const objects = useDesignStore((s) => s.objects)
  const fabricCanvas = useDesignStore((s) => s.fabricCanvas)
  const selectedObject = useDesignStore((s) => s.selectedObject)
  const background = useDesignStore((s) => s.config.background)
  const backgroundMode = useDesignStore((s) => s.config.backgroundMode)
  const backgroundImageUrl = useDesignStore((s) => s.config.backgroundImageUrl)
  const screens = useDesignStore((s) => s.config.screens)
  const gap = useDesignStore((s) => s.config.gap)
  const artboardPresetId = useDesignStore((s) => s.config.artboardPresetId)
  const setConfig = useDesignStore((s) => s.setConfig)
  const clearCanvasBackgroundImage = useDesignStore((s) => s.clearCanvasBackgroundImage)

  const [activeSection, setActiveSection] = useState<SidebarSectionId>('background')
  /** Detail panel next to the nav; click the active section again to collapse and widen the canvas. */
  const [panelOpen, setPanelOpen] = useState(true)

  /** True while user opened the Image tab before choosing a file (not persisted). */
  const [imagePanelActive, setImagePanelActive] = useState(false)

  const canvasFillTab = useMemo((): CanvasFillTab => {
    if (backgroundImageUrl != null && backgroundImageUrl.length > 0) return 'image'
    if (imagePanelActive) return 'image'
    if (backgroundMode === 'gradient') return 'gradient'
    return 'solid'
  }, [backgroundImageUrl, backgroundMode, imagePanelActive])

  useEffect(() => {
    setImagePanelActive(false)
  }, [backgroundImageUrl, backgroundMode, artboardPresetId])

  const saveDialogTitleId = useId()
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false)
  const [templateNameDraft, setTemplateNameDraft] = useState('')
  const [templateList, setTemplateList] = useState<DesignTemplateListItem[]>([])

  useEffect(() => {
    if (!saveTemplateOpen) return
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') setSaveTemplateOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [saveTemplateOpen])

  useEffect(() => {
    if (activeSection !== 'templates') return
    void (async () => {
      setTemplateList(await listDesignTemplates())
    })()
  }, [activeSection])

  const devices = useDeviceFramePackStore((s) => s.devices)
  const registryStatus = useDeviceFramePackStore((s) => s.status)
  const registryError = useDeviceFramePackStore((s) => s.errorMessage)
  const selectedDeviceType = useDeviceFramePackStore((s) => s.selectedDeviceType)
  const selectedPackId = useDeviceFramePackStore((s) => s.selectedPackId)
  const selectedFrameName = useDeviceFramePackStore((s) => s.selectedFrameName)
  const setSelectedDeviceType = useDeviceFramePackStore((s) => s.setSelectedDeviceType)
  const setSelectedPackId = useDeviceFramePackStore((s) => s.setSelectedPackId)
  const setSelectedFrameName = useDeviceFramePackStore((s) => s.setSelectedFrameName)

  const devicesOfType = useMemo(
    () => devices.filter((d) => d.manifest.type === selectedDeviceType),
    [devices, selectedDeviceType],
  )

  const packStyles = useMemo(
    () => activePackStyles(devices, selectedPackId),
    [devices, selectedPackId],
  )

  const canvasBgInputRef = useRef<HTMLInputElement>(null)
  const customFontInputRef = useRef<HTMLInputElement>(null)

  const customFonts = useCustomFontStore((s) => s.fonts)
  const showToast = useToastStore((s) => s.showToast)

  const handleCustomFontFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      await useCustomFontStore.getState().addFromFile(file)
      showToast('Font added — available in the text toolbar.', 'success')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not add font'
      showToast(msg, 'error')
    }
  }

  const handleRemoveCustomFont = async (id: string, label: string) => {
    try {
      await useCustomFontStore.getState().removeById(id)
      showToast(`Removed “${label}”.`, 'success')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not remove font'
      showToast(msg, 'error')
    }
  }

  const handleAddText = () => {
    const canvas = useDesignStore.getState().fabricCanvas
    if (!canvas) {
      console.warn('[LeftSidebar] add text: no canvas')
      return
    }
    addTextboxToCanvas(canvas)
  }

  const handleAddTextPreset = (presetId: TextStylePresetId) => {
    const canvas = useDesignStore.getState().fabricCanvas
    if (!canvas) {
      console.warn('[LeftSidebar] add text preset: no canvas')
      return
    }
    addTextboxToCanvas(canvas, { preset: presetId })
  }

  const handleAddDevice = async () => {
    const canvas = useDesignStore.getState().fabricCanvas
    if (!canvas) {
      console.warn('[LeftSidebar] add device: no canvas')
      return
    }
    try {
      await addDeviceFrameToCanvas(canvas, selectedFrameName)
    } catch (e) {
      console.error('[LeftSidebar] add device failed', e)
    }
  }

  const openCanvasBackgroundPicker = () => {
    canvasBgInputRef.current?.click()
  }

  const handleCanvasBackgroundFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const applyDataUrl = () => {
      const fr = new FileReader()
      fr.onload = () => {
        const url = typeof fr.result === 'string' ? fr.result : ''
        if (url) {
          setConfig({ backgroundImageUrl: url })
          console.log('[LeftSidebar] canvas background image set (embedded)')
        }
      }
      fr.readAsDataURL(file)
    }
    try {
      const bucket = screenshotBucketForConfig(useDesignStore.getState().config)
      const url = await uploadScreenshotFile(file, { bucket })
      setConfig({ backgroundImageUrl: url })
      console.log('[LeftSidebar] canvas background image set')
    } catch {
      useToastStore
        .getState()
        .showToast(
          'Saved as embedded image; dev server required to store under datasource.',
          'warning',
        )
      applyDataUrl()
    }
  }

  const buildCurrentDisplayDocument = (): DisplayDocumentV1 | null => {
    const canvas = useDesignStore.getState().fabricCanvas
    if (!canvas) {
      console.warn('[LeftSidebar] save/load template: no canvas')
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
      setTemplateList(await listDesignTemplates())
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
      console.error('[LeftSidebar] save template failed', e)
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
      await loadDisplayDocumentIntoCanvas(doc, { skipPresetDatasourceSync: true })
      resetDesignHistoryFromCurrentCanvas()
      showToast('Template loaded.', 'success')
    } catch (e) {
      console.error('[LeftSidebar] load template failed', e)
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

  const sortedLayers = [...objects].sort((a, b) => b.zIndex - a.zIndex)

  const activeTabId = `left-sidebar-tab-${activeSection}`
  const panelId = 'left-sidebar-detail-panel'

  const focusSectionTab = (sectionId: SidebarSectionId) => {
    requestAnimationFrame(() => {
      document.getElementById(`left-sidebar-tab-${sectionId}`)?.focus()
    })
  }

  const handleNavKeyDown = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      const next = (index + 1) % SECTION_NAV.length
      const nextId = SECTION_NAV[next].id
      setActiveSection(nextId)
      setPanelOpen(true)
      focusSectionTab(nextId)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      const prev = (index - 1 + SECTION_NAV.length) % SECTION_NAV.length
      const prevId = SECTION_NAV[prev].id
      setActiveSection(prevId)
      setPanelOpen(true)
      focusSectionTab(prevId)
    } else if (e.key === 'Home') {
      e.preventDefault()
      const firstId = SECTION_NAV[0].id
      setActiveSection(firstId)
      setPanelOpen(true)
      focusSectionTab(firstId)
    } else if (e.key === 'End') {
      e.preventDefault()
      const lastId = SECTION_NAV[SECTION_NAV.length - 1].id
      setActiveSection(lastId)
      setPanelOpen(true)
      focusSectionTab(lastId)
    }
  }

  const handleNavClick = (id: SidebarSectionId) => {
    if (id === activeSection && panelOpen) {
      setPanelOpen(false)
      return
    }
    setActiveSection(id)
    setPanelOpen(true)
  }

  return (
    <aside
      className={`flex min-h-0 shrink-0 border-r border-zinc-800 bg-zinc-900/50 transition-[width] duration-200 ease-out ${
        panelOpen
          ? 'w-[min(100%,21rem)] sm:w-auto sm:min-w-[19.5rem] sm:max-w-[22rem]'
          : 'w-[4.75rem] sm:w-[4.75rem]'
      }`}
      aria-label="Editor sidebar"
    >
      <nav
        className="flex w-[4.75rem] shrink-0 flex-col border-r border-zinc-800 py-2"
        aria-label="Editor sections"
      >
        <div className="flex flex-1 flex-col gap-1 px-1.5" role="tablist" aria-orientation="vertical">
          {SECTION_NAV.map(({ id, label, Icon }, index) => {
            const selected = activeSection === id
            return (
              <button
                key={id}
                type="button"
                id={`left-sidebar-tab-${id}`}
                role="tab"
                aria-selected={selected}
                aria-controls={panelId}
                aria-expanded={selected ? panelOpen : undefined}
                title={
                  selected && panelOpen
                    ? 'Click again to hide panel and widen the canvas'
                    : selected && !panelOpen
                      ? 'Click to show panel'
                      : undefined
                }
                tabIndex={selected ? 0 : -1}
                onClick={() => handleNavClick(id)}
                onKeyDown={(e) => handleNavKeyDown(e, index)}
                className={`flex flex-col items-center gap-1 rounded-lg px-1 py-2 text-center transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500/80 ${
                  selected
                    ? 'bg-zinc-800 text-zinc-100'
                    : 'text-zinc-500 hover:bg-zinc-800/60 hover:text-zinc-300'
                }`}
              >
                <Icon className="size-4 shrink-0" aria-hidden />
                <span className="max-w-full text-[10px] font-medium leading-tight tracking-tight">
                  {label}
                </span>
              </button>
            )
          })}
        </div>
      </nav>

      <div
        id={panelId}
        role="tabpanel"
        aria-labelledby={activeTabId}
        hidden={!panelOpen}
        className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
      >
        {activeSection === 'background' ? (
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden border-b border-zinc-800 p-3">
            <h2 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-zinc-500">
              <Palette className="size-3.5" aria-hidden />
              Background
            </h2>
            <p className="mt-1 text-[11px] leading-snug text-zinc-600">
              Solid or gradient base fill per panel; optional image stacks on top. Gutters
              between panels use a neutral fill.
            </p>
            <div
              className="mt-2 flex rounded-md border border-zinc-800 p-0.5"
              role="tablist"
              aria-label="Canvas fill type"
            >
              <button
                type="button"
                role="tab"
                aria-selected={canvasFillTab === 'solid'}
                onClick={() => {
                  setImagePanelActive(false)
                  setConfig({ backgroundMode: 'solid' })
                }}
                className={`min-w-0 flex-1 rounded px-1.5 py-1.5 text-[11px] font-medium sm:px-2 sm:text-xs ${
                  canvasFillTab === 'solid'
                    ? 'bg-zinc-700 text-zinc-100'
                    : 'text-zinc-400 hover:bg-zinc-800/80'
                }`}
              >
                Solid
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={canvasFillTab === 'gradient'}
                onClick={() => {
                  setImagePanelActive(false)
                  setConfig({ backgroundMode: 'gradient' })
                }}
                className={`min-w-0 flex-1 rounded px-1.5 py-1.5 text-[11px] font-medium sm:px-2 sm:text-xs ${
                  canvasFillTab === 'gradient'
                    ? 'bg-zinc-700 text-zinc-100'
                    : 'text-zinc-400 hover:bg-zinc-800/80'
                }`}
              >
                Gradient
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={canvasFillTab === 'image'}
                onClick={() => setImagePanelActive(true)}
                className={`min-w-0 flex-1 rounded px-1.5 py-1.5 text-[11px] font-medium sm:px-2 sm:text-xs ${
                  canvasFillTab === 'image'
                    ? 'bg-zinc-700 text-zinc-100'
                    : 'text-zinc-400 hover:bg-zinc-800/80'
                }`}
              >
                Image
              </button>
            </div>

            {canvasFillTab === 'solid' ? (
              <label className="mt-2 flex items-center gap-2 text-xs text-zinc-400">
                <span className="w-14 shrink-0">Color</span>
                <input
                  type="color"
                  className="h-8 w-full max-w-[7rem] cursor-pointer rounded border border-zinc-700 bg-zinc-900 p-0.5"
                  value={
                    background.startsWith('#') && background.length >= 7
                      ? background.slice(0, 7)
                      : '#1a1a1a'
                  }
                  onChange={(e) => setConfig({ background: e.target.value })}
                />
              </label>
            ) : null}

            {canvasFillTab === 'gradient' ? <CanvasGradientControls /> : null}

            {canvasFillTab === 'image' ? (
              <div className="mt-2 space-y-2">
                <p className="text-[11px] leading-snug text-zinc-600">
                  Cover-crops per screenshot panel; solid or gradient still shows underneath
                  if the image has transparency.
                </p>
                <button
                  type="button"
                  onClick={openCanvasBackgroundPicker}
                  className="flex w-full items-center gap-2 rounded-md border border-zinc-700 bg-zinc-800/80 px-2 py-2 text-sm text-zinc-100 hover:bg-zinc-800"
                >
                  <ImagePlus className="size-4 shrink-0" aria-hidden />
                  Choose background…
                </button>
                {backgroundImageUrl != null && backgroundImageUrl.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => clearCanvasBackgroundImage()}
                    className="w-full rounded-md border border-zinc-700/80 px-2 py-1.5 text-left text-xs text-zinc-300 hover:border-zinc-600 hover:bg-zinc-800/60"
                  >
                    Remove background
                  </button>
                ) : null}
                <input
                  ref={canvasBgInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleCanvasBackgroundFile}
                />
              </div>
            ) : null}
          </div>
        ) : null}

        {activeSection === 'artboard' ? (
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden border-b border-zinc-800 p-3">
            <h2 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-zinc-500">
              <LayoutTemplate className="size-3.5" aria-hidden />
              Artboard
            </h2>
            <div className="mt-2 space-y-2">
              <p className="text-[11px] leading-snug text-zinc-600">
                Each preset uses its own{' '}
                <code className="rounded bg-zinc-800 px-0.5 text-[10px] text-zinc-400">
                  display_*.json
                </code>{' '}
                in datasource: switching preset loads that file (or a blank layout if missing). Saves go to
                the same file.
              </p>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                Screenshot layout
              </h3>
              <label className="flex flex-col gap-1 text-xs text-zinc-400">
                <span className="font-medium text-zinc-500">Artboard preset</span>
                <select
                  className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100"
                  value={artboardPresetId}
                  onChange={(e) =>
                    setConfig({ artboardPresetId: e.target.value as ArtboardPresetId })
                  }
                  aria-label="Artboard export preset"
                >
                  {ARTBOARD_PRESETS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label} ({p.width}×{p.height})
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-2 text-xs text-zinc-400">
                <span className="w-14 shrink-0">Count</span>
                <input
                  type="number"
                  min={SCREEN_LAYOUT_COUNT_MIN}
                  max={SCREEN_LAYOUT_COUNT_MAX}
                  className="min-w-0 flex-1 rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100 tabular-nums"
                  value={screens}
                  onChange={(e) => {
                    const v = parseInt(e.target.value, 10)
                    if (!Number.isNaN(v)) setConfig({ screens: v })
                  }}
                />
              </label>
              <label className="flex items-center gap-2 text-xs text-zinc-400">
                <span className="w-14 shrink-0">Gap (px)</span>
                <input
                  type="number"
                  min={SCREEN_LAYOUT_GAP_MIN}
                  max={SCREEN_LAYOUT_GAP_MAX}
                  step={5}
                  className="min-w-0 flex-1 rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100 tabular-nums"
                  value={gap}
                  onChange={(e) => {
                    const v = parseInt(e.target.value, 10)
                    if (!Number.isNaN(v)) setConfig({ gap: v })
                  }}
                />
              </label>
            </div>
          </div>
        ) : null}

        {activeSection === 'text' ? (
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden border-b border-zinc-800 p-3">
            <h2 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-zinc-500">
              <Type className="size-3.5" aria-hidden />
              Text
            </h2>
            <ul className="mt-2 space-y-1">
              <li className="space-y-1.5">
                <p className="px-0.5 text-[10px] font-medium uppercase tracking-wider text-zinc-500">
                  Text styles
                </p>
                <p className="text-[10px] leading-snug text-zinc-600">
                  Presets sized for store screenshots (canvas px). Plain text uses the default size and weight.
                </p>
                <div className="max-h-64 space-y-1 overflow-y-auto pr-0.5">
                  <button
                    type="button"
                    onClick={handleAddText}
                    className="flex w-full flex-col items-stretch gap-0.5 rounded-md border border-zinc-800 bg-zinc-900/60 px-2 py-1.5 text-left hover:border-zinc-600 hover:bg-zinc-800/60"
                  >
                    <span className="text-xs font-medium text-zinc-200">Plain text</span>
                    <span className="font-mono text-[9px] text-zinc-600">default</span>
                    <span className="text-[10px] text-zinc-500">
                      {DEFAULT_TEXT_FONT_SIZE}px · 600 · {DEFAULT_TEXTBOX_WIDTH}px
                    </span>
                  </button>
                  {TEXT_STYLE_PRESETS.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => handleAddTextPreset(p.id)}
                      className="flex w-full flex-col items-stretch gap-0.5 rounded-md border border-zinc-800 bg-zinc-900/60 px-2 py-1.5 text-left hover:border-zinc-600 hover:bg-zinc-800/60"
                    >
                      <span className="text-xs font-medium text-zinc-200">{p.label}</span>
                      <span className="font-mono text-[9px] text-zinc-600">{p.styleToken}</span>
                      <span className="text-[10px] text-zinc-500">
                        {p.fontSize}px · {String(p.fontWeight)} · {p.width}px
                      </span>
                    </button>
                  ))}
                </div>
              </li>
              <li className="space-y-2 border-t border-zinc-800/80 pt-2">
                <p className="px-0.5 text-[10px] font-medium uppercase tracking-wider text-zinc-500">
                  Custom fonts
                </p>
                <p className="text-[10px] leading-snug text-zinc-600">
                  Saved in this browser. They stay in the text toolbar font menu until you remove them here.
                </p>
                <button
                  type="button"
                  onClick={() => customFontInputRef.current?.click()}
                  className="flex w-full items-center gap-2 rounded-md border border-zinc-700 bg-zinc-800/80 px-2 py-2 text-sm text-zinc-100 hover:bg-zinc-800"
                >
                  <Upload className="size-4 shrink-0" aria-hidden />
                  Upload font…
                </button>
                <input
                  ref={customFontInputRef}
                  type="file"
                  accept=".woff2,.woff,.ttf,.otf,font/woff2,font/woff,font/ttf,font/otf"
                  className="hidden"
                  onChange={handleCustomFontFile}
                />
                {customFonts.length === 0 ? (
                  <p className="text-[10px] text-zinc-600">No custom fonts yet.</p>
                ) : (
                  <ul className="max-h-36 space-y-1 overflow-y-auto pr-0.5">
                    {customFonts.map((f) => (
                      <li
                        key={f.id}
                        className="flex items-center gap-1 rounded-md border border-zinc-800 bg-zinc-900/60 px-1.5 py-1"
                      >
                        <span className="min-w-0 flex-1 truncate text-[11px] text-zinc-300" title={f.label}>
                          {f.label}
                        </span>
                        <button
                          type="button"
                          title="Remove font"
                          aria-label={`Remove font ${f.label}`}
                          className="flex shrink-0 items-center justify-center rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-rose-300"
                          onClick={() => void handleRemoveCustomFont(f.id, f.label)}
                        >
                          <Trash2 className="size-3.5" aria-hidden />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            </ul>
          </div>
        ) : null}

        {activeSection === 'deviceFrame' ? (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden border-b border-zinc-800 p-3">
            <h2 className="shrink-0 text-xs font-semibold uppercase tracking-wider text-zinc-500">
              <span className="flex items-center gap-1.5">
                <Smartphone className="size-3.5" aria-hidden />
                Device frame
              </span>
            </h2>
            <div className="mt-2 flex min-h-0 flex-1 flex-col gap-2">
              <div className="shrink-0 space-y-2">
                <label className="block text-[11px] text-zinc-500">
                  <span className="mb-0.5 block text-zinc-600">Product type</span>
                  <select
                    className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-xs text-zinc-100"
                    value={selectedDeviceType}
                    onChange={(e) => setSelectedDeviceType(e.target.value as DeviceFrameType)}
                    disabled={registryStatus !== 'ready'}
                  >
                    {DEVICE_FRAME_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t.charAt(0).toUpperCase() + t.slice(1)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-[11px] text-zinc-500">
                  <span className="mb-0.5 block text-zinc-600">Device</span>
                  <select
                    className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-xs text-zinc-100"
                    value={selectedPackId ?? ''}
                    onChange={(e) => setSelectedPackId(e.target.value)}
                    disabled={registryStatus !== 'ready' || devicesOfType.length === 0}
                  >
                    {devicesOfType.length === 0 ? (
                      <option value="">No devices for this type</option>
                    ) : (
                      devicesOfType.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.manifest.name}
                        </option>
                      ))
                    )}
                  </select>
                </label>
                {registryStatus === 'error' && registryError ? (
                  <p className="rounded border border-amber-900/60 bg-amber-950/40 px-2 py-1 text-[10px] leading-snug text-amber-200/90">
                    {registryError}
                  </p>
                ) : null}
                {registryStatus === 'loading' ? (
                  <p className="text-[10px] text-zinc-500">Loading device frames…</p>
                ) : null}
              </div>
              <div
                className="grid min-h-0 flex-1 auto-rows-min grid-cols-2 gap-1.5 overflow-y-auto overflow-x-hidden pr-0.5"
                role="radiogroup"
                aria-label="Frame angle"
              >
                {packStyles.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    role="radio"
                    aria-checked={selectedFrameName === s.id}
                    aria-label={s.label}
                    title={s.label}
                    onClick={() => setSelectedFrameName(s.id)}
                    disabled={registryStatus !== 'ready'}
                    className={`flex flex-col items-center gap-0.5 rounded-md border p-1.5 transition-colors disabled:opacity-40 ${
                      selectedFrameName === s.id
                        ? 'border-emerald-500/60 bg-zinc-800 ring-1 ring-emerald-500/30'
                        : 'border-zinc-800 bg-zinc-900/60 hover:border-zinc-600'
                    }`}
                  >
                    <img
                      src={s.src}
                      alt=""
                      className="pointer-events-none h-11 w-auto max-w-[2.75rem] object-contain opacity-90"
                    />
                    <span className="line-clamp-2 w-full text-center text-[9px] leading-tight text-zinc-400">
                      {s.label}
                    </span>
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={handleAddDevice}
                disabled={registryStatus !== 'ready' || !selectedPackId || packStyles.length === 0}
                className="flex w-full shrink-0 items-center justify-center gap-2 rounded-md border border-zinc-700 bg-zinc-800/80 px-2 py-2 text-sm text-zinc-100 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Smartphone className="size-4 shrink-0" aria-hidden />
                Add device
              </button>
            </div>
          </div>
        ) : null}

        {activeSection === 'layers' ? (
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden p-3 pb-4">
            <h2 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-zinc-500">
              <Layers className="size-3.5" aria-hidden />
              Layers
            </h2>
            <p className="mt-1 text-[10px] leading-snug text-zinc-600">
              Use arrows to change stacking (top of list = drawn in front).
            </p>
            {sortedLayers.length === 0 ? (
              <p className="mt-2 text-sm text-zinc-600">No layers yet.</p>
            ) : (
              <ul className="mt-2 space-y-1">
                {sortedLayers.map((o) => {
                  const stackIds = getUserLayerIdsBottomToTop(fabricCanvas)
                  const pos = stackIds.indexOf(o.id)
                  const canMoveUp = pos >= 0 && pos < stackIds.length - 1
                  const canMoveDown = pos > 0
                  return (
                    <li key={o.id} className="flex items-stretch gap-0.5">
                      <div className="flex shrink-0 flex-col justify-center gap-0 border border-zinc-800/80 rounded">
                        <button
                          type="button"
                          title="Move forward (in front of the layer below in this list)"
                          aria-label={`Move layer ${o.name} up`}
                          disabled={!canMoveUp}
                          className="rounded-t p-0.5 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200 disabled:cursor-not-allowed disabled:opacity-30"
                          onClick={() => moveLayerById(o.id, true)}
                        >
                          <ChevronUp className="size-3.5" aria-hidden />
                        </button>
                        <button
                          type="button"
                          title="Move behind the next layer in this list"
                          aria-label={`Move layer ${o.name} down`}
                          disabled={!canMoveDown}
                          className="rounded-b p-0.5 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200 disabled:cursor-not-allowed disabled:opacity-30"
                          onClick={() => moveLayerById(o.id, false)}
                        >
                          <ChevronDown className="size-3.5" aria-hidden />
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => selectLayerById(o.id)}
                        className={`min-w-0 flex-1 truncate rounded px-2 py-1 text-left text-sm transition-colors ${
                          selectedObject === o.id
                            ? 'bg-zinc-800 text-zinc-100'
                            : 'text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200'
                        }`}
                      >
                        {o.name}
                        <span className="ml-1 text-xs text-zinc-600">({o.kind})</span>
                      </button>
                      <button
                        type="button"
                        title="Delete layer"
                        aria-label={`Delete layer ${o.name}`}
                        className="flex shrink-0 items-center justify-center rounded px-1.5 text-zinc-500 hover:bg-red-950/50 hover:text-red-300"
                        onClick={(e) => {
                          e.stopPropagation()
                          deleteLayerById(o.id)
                        }}
                      >
                        <Trash2 className="size-3.5" aria-hidden />
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        ) : null}

        {activeSection === 'templates' ? (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden border-b border-zinc-800 p-3">
            <h2 className="shrink-0 text-xs font-semibold uppercase tracking-wider text-zinc-500">
              <span className="flex items-center gap-1.5">
                <Library className="size-3.5" aria-hidden />
                Templates
              </span>
            </h2>
            <p className="mt-1 shrink-0 text-[11px] leading-snug text-zinc-600">
              Save the current canvas as a template, or use a saved template below (replaces the current
              design).
            </p>
            <button
              type="button"
              onClick={() => {
                setTemplateNameDraft('')
                setSaveTemplateOpen(true)
              }}
              className="mt-3 flex w-full shrink-0 items-center justify-center gap-2 rounded-md border border-zinc-700 bg-zinc-800/80 px-2 py-2 text-sm text-zinc-100 hover:bg-zinc-800"
            >
              Save as template
            </button>
            <p className="mt-3 shrink-0 text-[10px] font-medium uppercase tracking-wider text-zinc-500">
              Saved templates
            </p>
            <ul className="mt-1.5 min-h-0 flex-1 space-y-2 overflow-y-auto overflow-x-hidden pr-0.5">
              {templateList.length === 0 ? (
                <li className="rounded-md border border-dashed border-zinc-800 px-2 py-6 text-center text-xs text-zinc-500">
                  No templates yet. Use “Save as template…” to create one.
                </li>
              ) : (
                templateList.map((t) => (
                  <li
                    key={`${t.source}-${t.id}`}
                    className="rounded-md border border-zinc-800 bg-zinc-900/60 p-2"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-xs font-medium text-zinc-200">{t.name}</div>
                      <div className="mt-0.5 text-[10px] text-zinc-500">
                        {new Date(t.savedAt).toLocaleString()}
                        {t.source === 'datasource' ? ' · datasource/templates' : ' · this browser'}
                      </div>
                    </div>
                    <div className="mt-2 flex gap-1.5">
                      <button
                        type="button"
                        className="flex-1 rounded-md border border-zinc-600 bg-zinc-800/80 px-2 py-1.5 text-xs font-medium text-zinc-100 hover:bg-zinc-800"
                        onClick={() => void handleLoadTemplate(t)}
                      >
                        Use
                      </button>
                      <button
                        type="button"
                        className="flex-1 rounded-md border border-zinc-700 px-2 py-1.5 text-xs font-medium text-zinc-400 hover:border-red-900/50 hover:bg-red-950/30 hover:text-red-300"
                        onClick={() => void handleDeleteTemplate(t)}
                      >
                        Remove
                      </button>
                    </div>
                  </li>
                ))
              )}
            </ul>
          </div>
        ) : null}
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
            <label className="mt-3 block text-xs font-medium text-zinc-300" htmlFor="left-sidebar-template-name">
              Name
            </label>
            <input
              id="left-sidebar-template-name"
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
    </aside>
  )
}
