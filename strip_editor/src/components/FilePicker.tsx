import { useEffect, useRef, useState } from 'react'
import { FolderInput, FolderOpen, Plus, RefreshCw } from 'lucide-react'

import { DEVICE_TARGETS, type DeviceTarget } from '../editor/devices'
import { blankStripTemplate } from '../editor/schema'
import { createStrip, listStrips, loadStripFolder, StripExistsError, type FolderFile } from '../lib/api'
import { useEditorStore } from '../store/useEditorStore'

/**
 * Landing screen: one row of device targets, and a way to bring a folder in.
 *
 * The four targets are always shown, present or not — they are the fixed set of
 * things a strip can be, so the row is a map of the project rather than a list
 * of files. A target that exists opens; a target that does not is created. That
 * is why there is no separate "new strip" control: the empty slot *is* the
 * control, and a strip's identity is its device, which the row already states.
 *
 * There is deliberately no history list either. Every file is called
 * `strip.html`, so a timestamped list of them said less than four words.
 */

/**
 * Files a strip folder does not need, dropped before upload.
 *
 * `rendered/` is regenerable output and by far the largest thing in the folder;
 * dotfiles are the OS's business, not the strip's.
 */
function keepForUpload(rel: string): boolean {
  if (!rel) return false
  const parts = rel.split('/')
  if (parts.some((seg) => seg.startsWith('.'))) return false
  return parts[0] !== 'rendered'
}

export function FilePicker(): React.ReactElement {
  const files = useEditorStore((s) => s.files)
  const filesLoaded = useEditorStore((s) => s.filesLoaded)
  const setFiles = useEditorStore((s) => s.setFiles)
  const openFile = useEditorStore((s) => s.openFile)

  // Which device folders are on disk, and where their strip lives. A folder may
  // hold a document under any .html name, so the path comes from the listing
  // rather than being assumed to be strip.html.
  const present = new Map<string, string>()
  for (const f of files) if (f.dir === 'strips') present.set(f.name, f.path)
  const fixtures = files.filter((f) => f.dir !== 'strips')

  // Create
  const [creatingFor, setCreatingFor] = useState<DeviceTarget | null>(null)
  const [panelCount, setPanelCount] = useState(5)
  const [createError, setCreateError] = useState<string | null>(null)

  // Load
  const folderInput = useRef<HTMLInputElement>(null)
  const [loadOpen, setLoadOpen] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<{ folder: string; stage: string } | null>(null)
  const [staged, setStaged] = useState<FolderFile[]>([])

  // `webkitdirectory` turns a file input into a folder picker. It is not in
  // React's attribute types, so it goes on after mount rather than through JSX.
  useEffect(() => {
    const el = folderInput.current
    if (!el) return
    el.setAttribute('webkitdirectory', '')
    el.setAttribute('directory', '')
  }, [])

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

  const pickTarget = (target: DeviceTarget): void => {
    const existing = present.get(target.folder)
    if (existing) {
      openFile(existing)
      return
    }
    setCreateError(null)
    setLoadOpen(false)
    setCreatingFor((cur) => (cur?.folder === target.folder ? null : target))
  }

  const create = async (target: DeviceTarget): Promise<void> => {
    const path = `strips/${target.folder}/strip.html`
    try {
      await createStrip(path, blankStripTemplate(target.folder, panelCount, target.width, target.height))
      setCreateError(null)
      openFile(path)
    } catch (e: unknown) {
      setCreateError(e instanceof Error ? e.message : String(e))
    }
  }

  const commit = async (picked: FolderFile[], opts: { replace?: boolean; stage?: string }): Promise<void> => {
    setLoadError(null)
    setBusy(opts.stage ? 'Replacing…' : 'Copying…')
    try {
      const result = await loadStripFolder(picked, {
        ...opts,
        onProgress: (done, total) => setBusy(`Copying ${done}/${total}…`),
      })
      setConfirm(null)
      openFile(result.path)
    } catch (e: unknown) {
      if (e instanceof StripExistsError) {
        setConfirm({ folder: e.folder, stage: e.stage })
      } else {
        setLoadError(e instanceof Error ? e.message : String(e))
      }
    } finally {
      setBusy(null)
    }
  }

  const onFolderPicked = (e: React.ChangeEvent<HTMLInputElement>): void => {
    setConfirm(null)
    setLoadError(null)
    const chosen = Array.from(e.target.files ?? [])
    e.target.value = '' // so picking the same folder twice fires again

    // webkitRelativePath is `<chosen folder>/…`; the folder's own name is not
    // used for anything — the device decides where this lands — so the leading
    // segment comes off here.
    const picked: FolderFile[] = []
    for (const file of chosen) {
      const rel = (file.webkitRelativePath || file.name).split('/').slice(1).join('/')
      if (keepForUpload(rel)) picked.push({ rel, file })
    }

    if (!picked.some((f) => f.rel === 'strip.html')) {
      setLoadError('No strip.html at the top of that folder. Pick the folder that contains it, not its parent.')
      return
    }
    setStaged(picked)
    void commit(picked, {})
  }

  return (
    <div className="flex h-full items-center justify-center p-8">
      <div className="w-full max-w-xl">
        <div className="mb-6 flex items-start gap-3">
          <FolderOpen size={22} className="mt-0.5 shrink-0 text-sky-400" />
          <div className="flex-1">
            <h1 className="text-lg font-semibold text-zinc-100">Strips</h1>
            <p className="text-sm leading-snug text-zinc-500">
              A strip is a folder — <code>strip.html</code> with its screenshots and images beside it. One folder per
              device target; the HTML is the source of truth, so what you edit here is what <code>render.mjs</code>{' '}
              exports.
            </p>
          </div>
        </div>

        {/* --- targets ---------------------------------------------------- */}
        <div className="mb-1.5 flex items-center gap-2 px-0.5">
          <span className="text-[11px] uppercase tracking-wide text-zinc-600">Targets</span>
          <span className="flex-1 text-[11px] text-zinc-600">open one, or create the blank</span>
          <button
            type="button"
            onClick={refresh}
            title="Refresh"
            className="rounded p-1 text-zinc-600 hover:bg-zinc-800 hover:text-zinc-300"
          >
            <RefreshCw size={13} />
          </button>
        </div>

        <div className="mb-3 grid grid-cols-4 gap-2">
          {DEVICE_TARGETS.map((t) => {
            const exists = present.has(t.folder)
            const active = creatingFor?.folder === t.folder
            return (
              <button
                key={t.folder}
                type="button"
                onClick={() => pickTarget(t)}
                title={`${t.label} · ${t.width}×${t.height}`}
                className={`rounded-lg border px-2 py-2 text-left transition-colors ${
                  exists
                    ? 'border-zinc-700 bg-zinc-900 hover:border-sky-500/60'
                    : active
                      ? 'border-sky-500/60 bg-zinc-900/60'
                      : 'border-dashed border-zinc-800 bg-transparent hover:border-zinc-600'
                }`}
              >
                <span
                  className={`flex items-center gap-1 text-sm font-medium ${
                    exists ? 'text-zinc-100' : 'text-zinc-500'
                  }`}
                >
                  {!exists && <Plus size={12} className="shrink-0" />}
                  {t.folder}
                </span>
                <span className="mt-0.5 block text-[10px] leading-tight text-zinc-600">
                  {t.width}×{t.height}
                </span>
              </button>
            )
          })}
        </div>

        {creatingFor && (
          <div className="mb-3 rounded-lg border border-zinc-800 bg-zinc-900 p-3">
            <p className="mb-2 text-[12px] leading-snug text-zinc-400">
              A blank, schema-conformant strip at{' '}
              <code className="text-zinc-300">strips/{creatingFor.folder}/</code> — {creatingFor.label},{' '}
              {creatingFor.width}×{creatingFor.height}.
            </p>
            <label className="mb-2 flex items-center gap-2">
              <span className="text-[11px] uppercase tracking-wide text-zinc-500">Panels</span>
              <input
                type="number"
                min={1}
                max={10}
                autoFocus
                value={panelCount}
                onChange={(e) => setPanelCount(Math.max(1, Math.min(10, Number(e.target.value) || 1)))}
                className="w-16 rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-sm text-zinc-100"
              />
            </label>
            <p className="mb-3 text-[11px] leading-snug text-zinc-500">
              A design run from <code className="text-zinc-400">input/</code> replaces this folder outright, so copy it
              elsewhere if you want to keep what you make here.
            </p>
            {createError && <p className="mb-2 text-xs text-rose-300">{createError}</p>}
            <button
              type="button"
              onClick={() => void create(creatingFor)}
              className="rounded bg-sky-500 px-2.5 py-1 text-xs font-medium text-zinc-950 hover:bg-sky-400"
            >
              Create strips/{creatingFor.folder}/
            </button>
          </div>
        )}

        {/* --- load ------------------------------------------------------- */}
        <button
          type="button"
          onClick={() => {
            setCreatingFor(null)
            setLoadOpen((v) => !v)
          }}
          className={`mb-3 w-full rounded-lg border p-3 text-left transition-colors ${
            loadOpen
              ? 'border-sky-500/60 bg-zinc-900'
              : 'border-zinc-800 bg-zinc-900 hover:border-zinc-700 hover:bg-zinc-800/40'
          }`}
        >
          <span className="mb-1 flex items-center gap-2 text-sm font-medium text-zinc-100">
            <FolderInput size={15} className="text-sky-400" />
            Load strip
          </span>
          <span className="block text-[12px] leading-snug text-zinc-500">
            Copy a strip folder in from anywhere on disk. Its panel size decides which target it lands in, and it is
            checked against the schema before it replaces anything.
          </span>
        </button>

        {loadOpen && (
          <div className="mb-3 rounded-lg border border-zinc-800 bg-zinc-900 p-3">
            <p className="mb-3 text-[12px] leading-snug text-zinc-400">
              Pick the folder that <em>contains</em> <code className="text-zinc-300">strip.html</code>. Panels at
              1290×2796 go to <code className="text-zinc-300">strips/iphone/</code>, 2048×2732 to{' '}
              <code className="text-zinc-300">strips/ipad/</code>. A size matching no target is refused rather than
              guessed. <code className="text-zinc-300">rendered/</code> is skipped — it regenerates.
            </p>

            <input ref={folderInput} type="file" multiple className="hidden" onChange={onFolderPicked} />

            {confirm ? (
              <div className="rounded border border-amber-500/40 bg-amber-500/5 p-2.5">
                <p className="mb-2 text-xs leading-snug text-amber-200">
                  <code>{confirm.folder}</code> already holds a strip. Replacing it deletes what is there — it is not in
                  git, so nothing brings it back.
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => void commit(staged, { replace: true, stage: confirm.stage })}
                    className="rounded bg-amber-400 px-2.5 py-1 text-xs font-medium text-zinc-950 hover:bg-amber-300 disabled:opacity-50"
                  >
                    Replace {confirm.folder}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirm(null)}
                    className="rounded border border-zinc-700 px-2.5 py-1 text-xs text-zinc-300 hover:bg-zinc-800"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => folderInput.current?.click()}
                className="rounded bg-sky-500 px-2.5 py-1 text-xs font-medium text-zinc-950 hover:bg-sky-400 disabled:opacity-50"
              >
                {busy ?? 'Choose folder…'}
              </button>
            )}

            {loadError && <p className="mt-2 whitespace-pre-wrap text-xs text-rose-300">{loadError}</p>}
          </div>
        )}

        {/* --- fixtures --------------------------------------------------- */}
        {fixtures.length > 0 && (
          <div className="flex items-center gap-2 px-0.5">
            <span className="text-[11px] uppercase tracking-wide text-zinc-600">Fixtures</span>
            <div className="flex flex-1 flex-wrap gap-1.5">
              {fixtures.map((f) => (
                <button
                  key={f.path}
                  type="button"
                  onClick={() => openFile(f.path)}
                  title={f.path}
                  className="rounded border border-zinc-800 px-2 py-0.5 text-xs text-zinc-500 hover:border-zinc-600 hover:text-zinc-300"
                >
                  {f.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {filesLoaded && present.size === 0 && (
          <p className="px-0.5 text-[11px] text-zinc-600">
            No strips yet. Create one above, or run the <code>strip-design</code> skill against{' '}
            <code>input/</code>.
          </p>
        )}
      </div>
    </div>
  )
}
