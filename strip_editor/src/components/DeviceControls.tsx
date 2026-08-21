import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertTriangle, Loader2, Upload, X } from 'lucide-react'

import { Chip, ColorField, CssField, Hint, Row, Section } from './controls'
import { applyAttribute, applyDeclarations } from '../editor/mutate'
import {
  FRAMES_ROOT,
  listDevicePacks,
  listDevicePoses,
  listScreenshots,
  uploadScreenshot,
} from '../lib/api'
import { deviceForStripPath } from '../editor/devices'
import { getElement } from '../editor/blockRegistry'
import { useEditorStore } from '../store/useEditorStore'
import type { BlockReadout } from '../editor/blockRegistry'
import type { DevicePack, DevicePose, ScreenshotFile } from '../lib/api'

/**
 * Device block controls.
 *
 * Pose and screenshot are *attributes*, not styles: `device-frames.mjs` reads
 * them once at load and derives a homography from them, so changing one means
 * re-running the runtime for that block. `applyAttribute` does that and resolves
 * only when the frame is visually correct again — which is why every handler
 * here is async and surfaces the rebuild error rather than leaving an empty
 * frame on the canvas.
 */

/**
 * Drop-shadow presets, matching the classes the strips already define
 * (`.shadow-lg`, `.shadow-md`, `.shadow-dark`). Written as an inline `filter`
 * so the choice is visible on the block rather than hidden in a class.
 */
const SHADOW_PRESETS: Array<{ label: string; value: string | null }> = [
  { label: 'none', value: null },
  { label: 'soft', value: 'drop-shadow(0 40px 60px rgba(12,12,10,0.24))' },
  { label: 'strong', value: 'drop-shadow(0 60px 90px rgba(12,12,10,0.30))' },
  {
    label: 'glow',
    value: 'drop-shadow(0 0 120px rgba(182,138,61,0.20)) drop-shadow(0 50px 90px rgba(0,0,0,0.55))',
  },
]

function PoseGrid({
  pack,
  current,
  disabled,
  onPick,
}: {
  pack: string
  current: string | null
  disabled: boolean
  onPick: (pose: string) => void
}): React.ReactElement {
  const [poses, setPoses] = useState<DevicePose[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    listDevicePoses(pack)
      .then((p) => !cancelled && setPoses(p))
      .catch((e: unknown) => !cancelled && setError(e instanceof Error ? e.message : String(e)))
    return () => {
      cancelled = true
    }
  }, [pack])

  if (error) return <p className="text-[11px] text-rose-300">{error}</p>

  return (
    <div className="grid grid-cols-4 gap-1">
      {poses.map((p) => (
        <button
          key={p.name}
          type="button"
          disabled={disabled}
          onClick={() => onPick(p.name)}
          title={p.description ?? p.name}
          className={`flex flex-col items-center gap-0.5 rounded border p-1 transition-colors disabled:opacity-40 ${
            p.name === current
              ? 'border-sky-500 bg-sky-500/15'
              : 'border-zinc-800 hover:border-zinc-600 hover:bg-zinc-800/60'
          }`}
        >
          {/* The pose SVG is its own thumbnail — no separate asset to keep in sync. */}
          <img src={`${FRAMES_ROOT}${p.framePath}`} alt="" className="h-10 w-full object-contain" />
          <span className="w-full truncate text-center text-[9px] text-zinc-400">{p.name}</span>
        </button>
      ))}
    </div>
  )
}

function ScreenshotPicker({
  current,
  disabled,
  onPick,
}: {
  current: string | null
  disabled: boolean
  onPick: (url: string | null) => void
}): React.ReactElement {
  const [dir, setDir] = useState<string | null>(null)
  const [files, setFiles] = useState<ScreenshotFile[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  // Captures belong to the strip, so the library depends on which file is open.
  const stripPath = useEditorStore((s) => s.filePath)

  const refresh = useCallback((): void => {
    if (!stripPath) return
    listScreenshots(stripPath)
      .then((r) => {
        setFiles(r.files)
        setDir(r.dir)
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
  }, [stripPath])

  useEffect(() => refresh(), [refresh])

  const upload = async (file: File): Promise<void> => {
    if (!stripPath) return
    setBusy(true)
    setError(null)
    try {
      const added = await uploadScreenshot(stripPath, file)
      refresh()
      onPick(added.url)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>

      <div className="mt-1.5 grid max-h-44 grid-cols-4 gap-1 overflow-y-auto">
        {files.map((f) => (
          <button
            key={f.url}
            type="button"
            disabled={disabled || busy}
            onClick={() => onPick(f.url)}
            title={f.name}
            className={`overflow-hidden rounded border transition-colors disabled:opacity-40 ${
              f.url === current ? 'border-sky-500 ring-1 ring-sky-500/50' : 'border-zinc-800 hover:border-zinc-600'
            }`}
          >
            <img src={f.url} alt="" loading="lazy" className="h-14 w-full object-cover" />
          </button>
        ))}
      </div>
      {files.length === 0 && (
        <p className="mt-1 text-[11px] text-zinc-600">
          {dir ? (
            <>
              No captures yet. Drop them into <code>{dir}/</code>, or upload below.
            </>
          ) : (
            'This strip has no folder of its own, so there is nowhere to upload to.'
          )}
        </p>
      )}

      <div className="mt-1.5 flex items-center gap-1">
        <input
          ref={fileInput}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void upload(f)
            e.target.value = ''
          }}
        />
        <button
          type="button"
          disabled={!dir || busy || disabled}
          onClick={() => fileInput.current?.click()}
          className="flex items-center gap-1 rounded px-1.5 py-1 text-[11px] text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 disabled:opacity-40"
        >
          {busy ? <Loader2 size={11} className="animate-spin" /> : <Upload size={11} />} Upload
        </button>
        {current && (
          <button
            type="button"
            disabled={disabled}
            onClick={() => onPick(null)}
            className="flex items-center gap-1 rounded px-1.5 py-1 text-[11px] text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300 disabled:opacity-40"
          >
            <X size={11} /> Clear — use fill colour
          </button>
        )}
      </div>
      {error && <p className="mt-1 text-[11px] text-rose-300">{error}</p>}
    </>
  )
}

export function DeviceControls({ r }: { r: BlockReadout }): React.ReactElement | null {
  const [packs, setPacks] = useState<DevicePack[]>([])
  const [busy, setBusy] = useState(false)
  const [rebuildError, setRebuildError] = useState<string | null>(null)
  const filePath = useEditorStore((s) => s.filePath)

  useEffect(() => {
    listDevicePacks().then(setPacks).catch(() => setPacks([]))
  }, [])

  // Offer the mockups that belong to the strip being edited: a pack's `type` in
  // index.json is a `strips/` folder name, so an iPad strip lists iPad packs.
  //
  // The mismatch this prevents is not cosmetic. Screen quads differ by aspect —
  // the iPhone front pose is 0.463 — and `data-fit="cover"` crops the capture to
  // fit, so an iPad screenshot (0.750) in an iPhone frame silently loses 38% of
  // its width.
  //
  // **Falling back to every pack when nothing matches is the important half.**
  // A `phone` or tablet strip has no pack of its own today, and a select with
  // no options is a dead end: you could not even see what the block is set to,
  // let alone change it.
  const target = filePath ? deviceForStripPath(filePath) : null
  const matching = target ? packs.filter((p) => p.type === target.folder) : []
  const offered = matching.length > 0 ? matching : packs
  const showingAll = matching.length === 0 && packs.length > 0 && target !== null

  const el = getElement(r.node.id)
  if (!r.device || !el) return null
  const d = r.device

  const setAttr = async (name: string, value: string | null): Promise<void> => {
    setBusy(true)
    setRebuildError(null)
    const result = await applyAttribute(r.node.id, name, value, `device:${r.node.id}`)
    setRebuildError(result.error ?? null)
    setBusy(false)
  }

  const currentFilter = el.style.getPropertyValue('filter')

  return (
    <>
      <Section title="Device" right={busy ? <Loader2 size={11} className="animate-spin text-zinc-500" /> : undefined}>
        <Row label="pack">
          <select
            value={d.pack ?? ''}
            disabled={busy}
            onChange={(e) => void setAttr('data-pack', e.target.value)}
            className="min-w-0 flex-1 rounded border border-zinc-700 bg-zinc-900 px-1.5 py-0.5 text-[11px] text-zinc-100"
          >
            {offered.length === 0 && <option value={d.pack ?? ''}>{d.pack ?? 'unknown'}</option>}
            {/* The current pack always stays selectable, even when it is not one
                the strip's target would offer — otherwise opening a strip whose
                pack was filtered out would silently show a different one. */}
            {d.pack && !offered.some((p) => p.id === d.pack) && (
              <option value={d.pack}>{d.pack} (not a {target?.short ?? 'matching'} pack)</option>
            )}
            {offered.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name ? `${p.id} — ${p.name}` : p.id}
              </option>
            ))}
          </select>
        </Row>
        {showingAll && (
          <p className="mt-1.5 text-[11px] leading-snug text-zinc-500">
            No {target?.short} pack exists yet, so every pack is listed. A mockup from another device will crop this
            panel&rsquo;s captures to its own screen aspect.
          </p>
        )}
        {!d.built && (
          <p className="mt-1.5 flex items-start gap-1.5 rounded bg-amber-950/60 px-2 py-1.5 text-[11px] leading-snug text-amber-300">
            <AlertTriangle size={12} className="mt-0.5 shrink-0" />
            This block did not build — usually a missing screenshot or an unknown pose. It will export empty.
          </p>
        )}
        {rebuildError && (
          <p className="mt-1.5 flex items-start gap-1.5 rounded bg-rose-950/60 px-2 py-1.5 text-[11px] leading-snug text-rose-300">
            <AlertTriangle size={12} className="mt-0.5 shrink-0" />
            {rebuildError}
          </p>
        )}
      </Section>

      <Section title="Pose">
        {d.pack && <PoseGrid pack={d.pack} current={d.pose} disabled={busy} onPick={(p) => void setAttr('data-pose', p)} />}
        <Hint>
          Width sets the scale; height follows the pose aspect. The screen quad comes from the pose SVG&rsquo;s own
          viewBox, so swapping poses stays pixel-accurate.
        </Hint>
      </Section>

      <Section title="Screen">
        <ScreenshotPicker
          current={d.screenshot}
          disabled={busy}
          onPick={(url) => void setAttr('data-screenshot', url)}
        />
        <div className="mt-2">
          <Row label="fit">
            <Chip active={d.fit === 'cover'} onClick={() => void setAttr('data-fit', null)} title="Default">
              cover
            </Chip>
            <Chip active={d.fit === 'stretch'} onClick={() => void setAttr('data-fit', 'stretch')}>
              stretch
            </Chip>
          </Row>
          <Row label="fill colour">
            <ColorField
              value={d.screenFallback ?? ''}
              placeholder="#0c0c0a"
              onCommit={(v) => void setAttr('data-screen-fallback', v || null)}
            />
          </Row>
          <Hint>The fill colour shows only when no screenshot is set.</Hint>
        </div>
      </Section>

      <Section title="Shadow">
        <div className="flex flex-wrap gap-1">
          {SHADOW_PRESETS.map((p) => (
            <Chip
              key={p.label}
              active={p.value === null ? currentFilter === '' : currentFilter === p.value}
              onClick={() => applyDeclarations(r.node.id, [{ prop: 'filter', value: p.value }], `device:${r.node.id}`)}
            >
              {p.label}
            </Chip>
          ))}
        </div>
        <Row label="filter">
          <CssField
            value={currentFilter}
            placeholder={r.computed.filter === 'none' ? 'none' : r.computed.filter}
            onCommit={(v) => applyDeclarations(r.node.id, [{ prop: 'filter', value: v || null }], `device:${r.node.id}`)}
          />
        </Row>
        <Hint>
          Empty means the block keeps whatever its class provides — several strips carry the shadow on{' '}
          <code>.shadow-lg</code> rather than inline.
        </Hint>
      </Section>
    </>
  )
}
