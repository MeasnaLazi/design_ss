import { useEffect, useState } from 'react'
import { FileCode2, FilePlus2, FolderOpen, RefreshCw } from 'lucide-react'

import { blankStripTemplate } from '../editor/schema'
import { createStrip, listStrips } from '../lib/api'
import { useEditorStore } from '../store/useEditorStore'

function formatWhen(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

/**
 * Landing screen: strips found under `strips/` and `composer/test/`.
 * Once a strip is open the shell replaces this with the editor; the TopBar ×
 * comes back here.
 */
/**
 * Export presets offered when creating a strip. Panel size is the store's exact
 * export size — `render.mjs` screenshots panels at their authored dimensions, so
 * getting this right at creation avoids a resize later.
 */
const PRESETS = [
  { id: 'appstore_iphone_portrait', label: 'App Store · iPhone 6.7" portrait', width: 1290, height: 2796 },
  { id: 'appstore_ipad_portrait', label: 'App Store · iPad 12.9" portrait', width: 2048, height: 2732 },
  { id: 'play_phone_portrait', label: 'Play Store · phone portrait', width: 1080, height: 1920 },
]

export function FilePicker(): React.ReactElement {
  const files = useEditorStore((s) => s.files)
  const filesLoaded = useEditorStore((s) => s.filesLoaded)
  const setFiles = useEditorStore((s) => s.setFiles)
  const openFile = useEditorStore((s) => s.openFile)

  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [presetId, setPresetId] = useState(PRESETS[0].id)
  const [panelCount, setPanelCount] = useState(5)
  const [createError, setCreateError] = useState<string | null>(null)

  const create = async (): Promise<void> => {
    const preset = PRESETS.find((p) => p.id === presetId) ?? PRESETS[0]
    const slug = name.trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '')
    if (!slug) {
      setCreateError('Give the strip a name.')
      return
    }
    // A strip is a folder: strips/<name>/strip.html, with images/ and
    // rendered/ landing beside it as they are created.
    const path = `strips/${slug}/strip.html`
    try {
      await createStrip(path, blankStripTemplate(slug, panelCount, preset.width, preset.height))
      setCreating(false)
      setName('')
      setCreateError(null)
      openFile(path)
    } catch (e: unknown) {
      setCreateError(e instanceof Error ? e.message : String(e))
    }
  }

  const refresh = (): void => {
    listStrips()
      .then((r) => setFiles(r.files))
      .catch((e: unknown) => console.error('[strip-editor] failed to list strips', e))
  }

  useEffect(() => {
    let cancelled = false
    listStrips()
      .then((r) => {
        if (!cancelled) setFiles(r.files)
      })
      .catch((e: unknown) => {
        if (!cancelled) console.error('[strip-editor] failed to list strips', e)
      })
    return () => {
      cancelled = true
    }
  }, [setFiles])

  return (
    <div className="flex h-full items-center justify-center p-8">
      <div className="w-full max-w-lg">
        <div className="mb-5 flex items-start gap-3">
          <FolderOpen size={22} className="mt-0.5 shrink-0 text-sky-400" />
          <div className="flex-1">
            <h1 className="text-lg font-semibold text-zinc-100">Open a strip</h1>
            <p className="text-sm leading-snug text-zinc-500">
              The HTML file is the source of truth — what you edit here is what <code>render.mjs</code> exports.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setCreating((v) => !v)}
            title="New strip"
            className="rounded p-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
          >
            <FilePlus2 size={14} />
          </button>
          <button
            type="button"
            onClick={refresh}
            title="Refresh list"
            className="rounded p-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
          >
            <RefreshCw size={14} />
          </button>
        </div>

        {creating && (
          <div className="mb-3 rounded-lg border border-zinc-800 bg-zinc-900 p-3">
            <label className="mb-2 block">
              <span className="mb-1 block text-[11px] uppercase tracking-wide text-zinc-500">Name</span>
              <input
                value={name}
                autoFocus
                placeholder="my-app-strip"
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && void create()}
                className="w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-sm text-zinc-100 focus:border-sky-500 focus:outline-none"
              />
            </label>
            <label className="mb-2 block">
              <span className="mb-1 block text-[11px] uppercase tracking-wide text-zinc-500">Preset</span>
              <select
                value={presetId}
                onChange={(e) => setPresetId(e.target.value)}
                className="w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-sm text-zinc-100"
              >
                {PRESETS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label} · {p.width}×{p.height}
                  </option>
                ))}
              </select>
            </label>
            <label className="mb-3 block">
              <span className="mb-1 block text-[11px] uppercase tracking-wide text-zinc-500">Panels</span>
              <input
                type="number"
                min={1}
                max={10}
                value={panelCount}
                onChange={(e) => setPanelCount(Math.max(1, Math.min(10, Number(e.target.value) || 1)))}
                className="w-20 rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-sm text-zinc-100"
              />
            </label>
            {createError && <p className="mb-2 text-xs text-rose-300">{createError}</p>}
            <button
              type="button"
              onClick={() => void create()}
              className="rounded bg-sky-500 px-2.5 py-1 text-xs font-medium text-zinc-950 hover:bg-sky-400"
            >
              Create in strips/
            </button>
          </div>
        )}

        <ul className="flex flex-col gap-1 rounded-lg border border-zinc-800 bg-zinc-900 p-2">
          {files.map((f) => (
            <li key={f.path}>
              <button
                type="button"
                onClick={() => openFile(f.path)}
                className="flex w-full items-start gap-2 rounded-md px-2 py-2 text-left text-zinc-300 transition-colors hover:bg-zinc-800"
              >
                <FileCode2 size={15} className="mt-0.5 shrink-0 opacity-70" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">{f.name}</span>
                  <span className="block truncate text-[11px] text-zinc-500">
                    {f.dir} · {formatWhen(f.mtime)} · {(f.size / 1024).toFixed(1)} kB
                  </span>
                </span>
              </button>
            </li>
          ))}
          {filesLoaded && files.length === 0 && (
            <li className="px-2 py-6 text-center text-sm text-zinc-500">
              No strips found in <code className="text-zinc-400">strips/</code> or{' '}
              <code className="text-zinc-400">composer/test/</code>.
            </li>
          )}
        </ul>
      </div>
    </div>
  )
}
