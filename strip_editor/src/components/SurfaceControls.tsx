import { useEffect, useRef, useState } from 'react'
import { Loader2, Upload } from 'lucide-react'

import { Chip, ColorField, CssField, Hint, Row, Section } from './controls'
import { applyAttribute, applyDeclarations } from '../editor/mutate'
import { isPlaceholderImage } from '../editor/schema'
import { listImages, uploadImage } from '../lib/api'
import { getElement } from '../editor/blockRegistry'
import { useEditorStore } from '../store/useEditorStore'
import type { BlockReadout } from '../editor/blockRegistry'
import type { ScreenshotFile } from '../lib/api'

/** Controls for image, decor and panel blocks — everything that is just CSS. */

/**
 * Panel background presets.
 *
 * A full gradient-stop editor is deliberately not here: the strips' backgrounds
 * are hand-tuned multi-stop radials tied to each design's palette, and a
 * generic stop UI would flatten them on first touch. These give a quick way to
 * reach a sensible shape, and the raw field below keeps the full expressiveness
 * of CSS for everything else.
 */
const BACKGROUND_PRESETS: Array<{ label: string; value: string }> = [
  { label: 'flat', value: '#f5f1ee' },
  { label: 'top glow', value: 'radial-gradient(120% 70% at 50% 0%, #fdfaf6 0%, #f5f1ee 55%, #e7ded4 100%)' },
  { label: 'corner glow', value: 'radial-gradient(140% 90% at 85% 8%, #fdfaf6 0%, #f5f1ee 45%, #ece4dc 100%)' },
  { label: 'diagonal', value: 'linear-gradient(170deg, #ece4dc 0%, #f5f1ee 55%)' },
  { label: 'dark', value: 'radial-gradient(130% 85% at 20% 100%, #201d18 0%, #0c0c0a 60%)' },
]

function useInline(r: BlockReadout): (prop: string) => string {
  const el = getElement(r.node.id)
  return (prop: string) => el?.style.getPropertyValue(prop) ?? ''
}

/**
 * `omit` drops rows that a more specific panel above already owns — decor has
 * its own shape and rotation controls, and showing the raw ones again invites
 * two fields writing the same property with different ideas about its value.
 */
function CommonAppearance({ r, omit = [] }: { r: BlockReadout; omit?: string[] }): React.ReactElement {
  const inline = useInline(r)
  const set = (prop: string, value: string | null): void => {
    applyDeclarations(r.node.id, [{ prop, value }], `appearance:${r.node.id}`)
  }
  const has = (prop: string): boolean => !omit.includes(prop)
  return (
    <Section title="Appearance">
      <Row label="opacity">
        <CssField value={inline('opacity')} placeholder={r.computed.opacity} onCommit={(v) => set('opacity', v || null)} />
      </Row>
      {has('border-radius') && (
      <Row label="border-radius">
        <CssField value={inline('border-radius')} placeholder="0" onCommit={(v) => set('border-radius', v || null)} />
      </Row>
      )}
      <Row label="filter">
        <CssField
          value={inline('filter')}
          placeholder={r.computed.filter === 'none' ? 'none' : r.computed.filter}
          onCommit={(v) => set('filter', v || null)}
        />
      </Row>
      {has('transform') && (
      <Row label="transform">
        <CssField
          value={inline('transform')}
          placeholder={r.computed.transform === 'none' ? 'none' : 'matrix(…)'}
          onCommit={(v) => set('transform', v || null)}
        />
      </Row>
      )}
      <Row label="z-index">
        <CssField value={inline('z-index')} placeholder={r.computed.zIndex} onCommit={(v) => set('z-index', v || null)} />
      </Row>
      <Hint>
        Empty inherits from the stylesheet.{' '}
        {has('transform') && (
          <>
            There is no rotation handle on the canvas — write it here, e.g. <code>rotate(-4deg)</code>.
          </>
        )}
      </Hint>
    </Section>
  )
}

/**
 * Decor shape presets, written as `border-radius`.
 *
 * Radius is the whole vocabulary here on purpose: a decor block is a positioned
 * box, so its silhouette is entirely a radius question, and going through
 * `border-radius` means the shape survives a hand-edit of the HTML and reads
 * the same to anyone opening the file. `blob` is the one non-obvious value —
 * per-corner horizontal/vertical radii, which is how an organic shape is made
 * without an SVG path.
 */
const SHAPES: Array<{ label: string; value: string }> = [
  { label: 'square', value: '0' },
  { label: 'rounded', value: '32px' },
  { label: 'pill', value: '9999px' },
  { label: 'circle', value: '50%' },
  { label: 'blob', value: '60% 40% 55% 45% / 50% 60% 40% 50%' },
]

/**
 * Shadow presets. Tuned to the two backgrounds the strips actually use: a soft
 * dark shadow reads on a light field, a coloured glow on a dark one.
 */
const SHADOWS: Array<{ label: string; value: string }> = [
  { label: 'none', value: '' },
  { label: 'soft', value: '0 30px 60px rgba(12,12,10,0.18)' },
  { label: 'deep', value: '0 50px 90px rgba(12,12,10,0.35)' },
  { label: 'glow', value: '0 0 90px rgba(219,180,0,0.35)' },
]

const FILLS: Array<{ label: string; value: string }> = [
  { label: 'tint', value: 'rgba(12,12,10,0.06)' },
  { label: 'accent', value: 'rgba(219,180,0,0.18)' },
  { label: 'fade ↓', value: 'linear-gradient(180deg, rgba(12,12,10,0.10), rgba(12,12,10,0))' },
  { label: 'radial', value: 'radial-gradient(circle at 50% 50%, rgba(219,180,0,0.35), rgba(219,180,0,0) 70%)' },
]

/** Degrees in the inline `transform`, or '' when it has no rotate(). */
function readRotation(transform: string): string {
  const m = /rotate\(\s*(-?[\d.]+)deg\s*\)/i.exec(transform)
  return m ? m[1] : ''
}

/**
 * Set rotation without disturbing the rest of the transform.
 *
 * A decor block may legitimately carry `scale()` or `translate()` alongside its
 * rotation, and a control that overwrote the whole property would silently drop
 * them — so this rewrites the `rotate()` token in place and appends only when
 * there is none.
 */
function writeRotation(transform: string, deg: string): string | null {
  const rest = transform.replace(/rotate\(\s*-?[\d.]+deg\s*\)/i, '').trim()
  if (!deg.trim()) return rest || null
  const n = Number(deg)
  if (!Number.isFinite(n)) return transform || null
  return `${rest} rotate(${n}deg)`.trim()
}

export function DecorControls({ r }: { r: BlockReadout }): React.ReactElement | null {
  const inline = useInline(r)
  if (!r.decor) return null
  const set = (prop: string, value: string | null): void => {
    applyDeclarations(r.node.id, [{ prop, value }], `decor:${r.node.id}`)
  }
  const radius = inline('border-radius')
  const fill = inline('background')
  const shadow = inline('box-shadow')
  const transform = inline('transform')

  return (
    <>
      <Section title="Shape">
        <div className="flex flex-wrap gap-1">
          {SHAPES.map((sh) => (
            <Chip key={sh.label} active={radius === sh.value} onClick={() => set('border-radius', sh.value)} title={sh.value}>
              {sh.label}
            </Chip>
          ))}
        </div>
        <Row label="border-radius">
          <CssField
            value={radius}
            placeholder={r.decor.borderRadius}
            onCommit={(v) => set('border-radius', v || null)}
          />
        </Row>
        <Row label="rotation">
          <CssField
            value={readRotation(transform)}
            placeholder="0"
            onCommit={(v) => set('transform', writeRotation(transform, v))}
          />
        </Row>
        <Hint>Degrees. Size and position are on the Box panel above; a shape here is just a styled box.</Hint>
      </Section>

      <Section title="Fill">
        <div className="flex flex-wrap gap-1">
          {FILLS.map((f) => (
            <Chip key={f.label} active={fill === f.value} onClick={() => set('background', f.value)} title={f.value}>
              {f.label}
            </Chip>
          ))}
        </div>
        <Row label="background">
          <ColorField value={fill} placeholder="none" onCommit={(v) => set('background', v || null)} />
        </Row>
        <Row label="border">
          <CssField value={inline('border')} placeholder={r.decor.border} onCommit={(v) => set('border', v || null)} />
        </Row>
        <Row label="shadow">
          <div className="flex flex-wrap gap-1">
            {SHADOWS.map((sd) => (
              <Chip
                key={sd.label}
                active={shadow === sd.value || (sd.value === '' && !shadow)}
                onClick={() => set('box-shadow', sd.value || null)}
                title={sd.value || 'none'}
              >
                {sd.label}
              </Chip>
            ))}
          </div>
        </Row>
        <Row label="box-shadow">
          <CssField value={shadow} placeholder="none" onCommit={(v) => set('box-shadow', v || null)} />
        </Row>
        <Hint>
          Presets are starting points — any CSS value works, and gradients belong in <code>background</code>.
        </Hint>
        {r.decor.childCount > 0 && (
          <Hint>
            This block has {r.decor.childCount} child element{r.decor.childCount === 1 ? '' : 's'} — a composed shape.
            Everything above still applies to the container, but the parts inside it are not selectable; editing those
            means editing the HTML.
          </Hint>
        )}
      </Section>
      <CommonAppearance r={r} omit={['border-radius', 'transform']} />
    </>
  )
}

/**
 * Group controls.
 *
 * A group is a container, so what it needs is layout, not decoration: how its
 * children are arranged. The flex row here is the common case — an icon beside
 * a label, a badge, a stat pair — and it is what makes the children line up
 * without anyone positioning them by hand. Switch `layout` to *absolute* and
 * the children become individually placeable instead.
 */
const GROUP_LAYOUTS: Array<{ label: string; declarations: Array<{ prop: string; value: string | null }> }> = [
  {
    label: 'row',
    declarations: [
      { prop: 'display', value: 'inline-flex' },
      { prop: 'flex-direction', value: 'row' },
      { prop: 'align-items', value: 'center' },
    ],
  },
  {
    label: 'column',
    declarations: [
      { prop: 'display', value: 'inline-flex' },
      { prop: 'flex-direction', value: 'column' },
      { prop: 'align-items', value: 'flex-start' },
    ],
  },
  {
    label: 'absolute',
    // Children keep their own left/top; the group is just a moveable frame.
    declarations: [
      { prop: 'display', value: null },
      { prop: 'flex-direction', value: null },
      { prop: 'align-items', value: null },
      { prop: 'gap', value: null },
    ],
  },
]

export function GroupControls({ r }: { r: BlockReadout }): React.ReactElement | null {
  const inline = useInline(r)
  if (!r.group) return null
  const set = (prop: string, value: string | null): void => {
    applyDeclarations(r.node.id, [{ prop, value }], `group:${r.node.id}`)
  }
  const display = inline('display')
  const direction = inline('flex-direction')
  const activeLayout = !display ? 'absolute' : direction === 'column' ? 'column' : 'row'
  const flowing = r.group.flowChildren > 0

  return (
    <>
      <Section title="Group">
        <Row label="children">
          <span className="font-mono text-[11px] text-zinc-400">
            {r.group.childCount}
            {flowing ? ` · ${r.group.flowChildren} in flow` : ''}
          </span>
        </Row>
        <Row label="layout">
          {GROUP_LAYOUTS.map((l) => (
            <Chip
              key={l.label}
              active={activeLayout === l.label}
              onClick={() => applyDeclarations(r.node.id, l.declarations, `group:${r.node.id}`)}
            >
              {l.label}
            </Chip>
          ))}
        </Row>
        {activeLayout !== 'absolute' && (
          <>
            <Row label="gap">
              <CssField value={inline('gap')} placeholder="0" onCommit={(v) => set('gap', v || null)} />
            </Row>
            <Row label="padding">
              <CssField value={inline('padding')} placeholder="0" onCommit={(v) => set('padding', v || null)} />
            </Row>
          </>
        )}
        <Row label="background">
          <ColorField value={inline('background')} placeholder="none" onCommit={(v) => set('background', v || null)} />
        </Row>
        <Row label="border-radius">
          <CssField value={inline('border-radius')} placeholder="0" onCommit={(v) => set('border-radius', v || null)} />
        </Row>
        <Row label="border">
          <CssField value={inline('border')} placeholder="none" onCommit={(v) => set('border', v || null)} />
        </Row>
        <Hint>
          Children are sub-layers: pick one in the layer tree, or alt-click it on the canvas.
          {flowing
            ? ' The ones in flow are placed by this group, so they have no drag handles — change gap, padding or layout here instead.'
            : ' They are absolutely positioned, so drag them inside the group.'}
        </Hint>
      </Section>
      <CommonAppearance r={r} omit={['border-radius']} />
    </>
  )
}

export function ImageControls({ r }: { r: BlockReadout }): React.ReactElement | null {
  const [files, setFiles] = useState<ScreenshotFile[]>([])
  const [dir, setDir] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  // Artwork is per strip, so the library depends on which file is open.
  const stripPath = useEditorStore((s) => s.filePath)

  useEffect(() => {
    if (!stripPath) return
    listImages(stripPath)
      .then((res) => {
        setFiles(res.files)
        setDir(res.dir)
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
  }, [stripPath])

  if (!r.image) return null

  const setSrc = (url: string): void => {
    void applyAttribute(r.node.id, 'src', url, `image:${r.node.id}`)
  }

  return (
    <>
      <Section title="Image">
        {isPlaceholderImage(r.image.src) && (
          <p className="mb-1.5 rounded bg-amber-950/60 px-2 py-1.5 text-[11px] leading-snug text-amber-300">
            Still the placeholder. Pick an image below or upload one — it will render into the export as-is otherwise.
          </p>
        )}
        <Row label="src">
          <CssField value={r.image.src} onCommit={setSrc} />
        </Row>
        <Row label="natural">
          <span className="font-mono text-[11px] text-zinc-400">
            {r.image.naturalWidth}×{r.image.naturalHeight}
          </span>
        </Row>
        <Row label="object-fit">
          {(['cover', 'contain', 'fill'] as const).map((v) => (
            <Chip
              key={v}
              active={getElement(r.node.id)?.style.getPropertyValue('object-fit') === v}
              onClick={() => applyDeclarations(r.node.id, [{ prop: 'object-fit', value: v }], `image:${r.node.id}`)}
            >
              {v}
            </Chip>
          ))}
        </Row>

        {files.length === 0 && !error && (
          <p className="mt-1.5 rounded bg-zinc-800/60 px-2 py-1.5 text-[11px] leading-snug text-zinc-400">
            No artwork yet. {dir ? (
              <>
                Drop files into <code className="text-zinc-300">{dir}/</code>, or upload below.
              </>
            ) : (
              <>This strip has no folder of its own, so there is nowhere to upload to — type a src above.</>
            )}
          </p>
        )}
        <div className="mt-1.5 grid max-h-40 grid-cols-4 gap-1 overflow-y-auto">
          {files.map((f) => (
            <button
              key={f.url}
              type="button"
              onClick={() => setSrc(f.url)}
              title={f.name}
              className={`overflow-hidden rounded border transition-colors ${
                f.url === r.image!.src ? 'border-sky-500 ring-1 ring-sky-500/50' : 'border-zinc-800 hover:border-zinc-600'
              }`}
            >
              <img src={f.url} alt="" loading="lazy" className="h-14 w-full object-cover" />
            </button>
          ))}
        </div>
        <input
          ref={fileInput}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (!f) return
            if (!stripPath) return
            setBusy(true)
            setError(null)
            uploadImage(stripPath, f)
              .then((added) => {
                setFiles((prev) => [added, ...prev])
                setSrc(added.url)
              })
              .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
              .finally(() => setBusy(false))
            e.target.value = ''
          }}
        />
        <button
          type="button"
          disabled={busy || !dir}
          title={dir ? `Upload into ${dir}/` : 'This strip has no folder of its own'}
          onClick={() => fileInput.current?.click()}
          className="mt-1.5 flex items-center gap-1 rounded px-1.5 py-1 text-[11px] text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 disabled:opacity-40"
        >
          {busy ? <Loader2 size={11} className="animate-spin" /> : <Upload size={11} />} Upload
        </button>
        {error && <p className="mt-1 text-[11px] text-rose-300">{error}</p>}
      </Section>
      <CommonAppearance r={r} />
    </>
  )
}

export function PanelControls({ r }: { r: BlockReadout }): React.ReactElement | null {
  const inline = useInline(r)
  if (!r.panel) return null
  const set = (value: string | null): void => {
    applyDeclarations(r.node.id, [{ prop: 'background', value }], `panel:${r.node.id}`)
  }
  const current = inline('background')

  return (
    <Section title="Panel">
      <Row label="index">
        <span className="font-mono text-[11px] text-zinc-400">{r.node.panelIndex}</span>
      </Row>
      <Row label="export size">
        <span className="font-mono text-[11px] text-zinc-400">
          {Math.round(r.rect.width)}×{Math.round(r.rect.height)}
        </span>
      </Row>
      <Row label="layers">
        <span className="font-mono text-[11px] text-zinc-400">{r.panel.layerCount}</span>
      </Row>

      <div className="mt-2 flex flex-wrap gap-1">
        {BACKGROUND_PRESETS.map((p) => (
          <Chip key={p.label} active={current === p.value} onClick={() => set(p.value)} title={p.value}>
            {p.label}
          </Chip>
        ))}
      </div>
      <Row label="background">
        <ColorField value={current} placeholder="from stylesheet" onCommit={(v) => set(v || null)} />
      </Row>
      <Hint>
        Any CSS background works — the strips use multi-stop radials. Presets are starting points, not a replacement for
        the value you already have; clearing the field hands the panel back to its stylesheet rule.
      </Hint>
    </Section>
  )
}
