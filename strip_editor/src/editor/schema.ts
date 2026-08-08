/**
 * The strip layer contract, as the editor understands it.
 * Authoritative source: `composer/strip-schema.md`. Keep this file in sync with
 * that document — the editor must never present or write markup that violates
 * it.
 */

/**
 * `data-layer` kinds.
 *
 * `group` is the only kind whose children are themselves layers. `decor` stays
 * deliberately opaque — the schema calls it free HTML/CSS, and indexing whatever
 * happens to be inside one would make every nested `<span>` a selectable block.
 * A group is the explicit opt-in: put `data-layer` on a child and the editor
 * treats it as a sub-layer.
 */
export const LAYER_KINDS = ['text', 'device', 'image', 'decor', 'group'] as const
export type LayerKind = (typeof LAYER_KINDS)[number]

/** `data-role` values for text layers. */
export const TEXT_ROLES = ['title', 'subtitle', 'caption'] as const
export type TextRole = (typeof TEXT_ROLES)[number]

/** A selectable node is either a panel or one layer block inside it. */
export type NodeKind = LayerKind | 'panel'

export function isLayerKind(value: string | undefined): value is LayerKind {
  return value !== undefined && (LAYER_KINDS as readonly string[]).includes(value)
}

export function isTextRole(value: string | undefined): value is TextRole {
  return value !== undefined && (TEXT_ROLES as readonly string[]).includes(value)
}

export const KIND_LABEL: Record<NodeKind, string> = {
  panel: 'Panel',
  text: 'Text',
  device: 'Device',
  image: 'Image',
  decor: 'Decor',
  group: 'Group',
}

/** Tailwind text colours used to tint each kind consistently in tree + overlay. */
export const KIND_COLOR: Record<NodeKind, string> = {
  panel: 'text-zinc-400',
  text: 'text-sky-300',
  device: 'text-violet-300',
  image: 'text-emerald-300',
  decor: 'text-amber-300',
  group: 'text-rose-300',
}

/**
 * Markup for blocks the editor inserts.
 *
 * These are the schema (`composer/strip-schema.md`) expressed as code: a text
 * block carries `data-role`, a device carries the five `data-*` attributes the
 * runtime reads and gets a width but **never a height**, an image is a plain
 * `<img>`. Everything is absolutely positioned, because a statically positioned
 * block cannot be moved by writing `left`/`top` and would arrive unusable.
 *
 * Positions are given by the caller so a new block lands somewhere visible in
 * the target panel rather than at its origin under existing content.
 */
export type InsertSpec = { kind: LayerKind; role?: TextRole; left: number; top: number; screenshot?: string }

/**
 * Stand-in source for a newly inserted image block.
 *
 * Served from the repo by both the editor and `render.mjs`, so it is not a
 * network asset and the schema's ban on those still holds.
 *
 * It lives in `composer/` rather than here because this path gets written into
 * strip files. A strip already depends on `composer/` — its `<head>` loads
 * `device-frames.mjs` — so pointing at the render engine adds no new coupling,
 * whereas pointing at the editor would make a saved design depend on the tool
 * that happened to author it.
 */
export const IMAGE_PLACEHOLDER_SRC = '/composer/placeholder.svg'

/** Is this image still showing the placeholder rather than real artwork? */
export function isPlaceholderImage(src: string | null | undefined): boolean {
  return src === IMAGE_PLACEHOLDER_SRC
}

export function blockTemplate(spec: InsertSpec): string {
  const at = `position:absolute; left:${Math.round(spec.left)}px; top:${Math.round(spec.top)}px;`

  switch (spec.kind) {
    case 'text': {
      const role = spec.role ?? 'title'
      const copy = role === 'title' ? 'New headline' : role === 'subtitle' ? 'Supporting line' : 'Caption'
      // Width is set so the block wraps and can be grabbed; size and family are
      // left to the strip's own `[data-role]` rules.
      return `<div data-layer="text" data-role="${role}" style="${at} width:900px;">${copy}</div>`
    }
    case 'device': {
      const shot = spec.screenshot ? ` data-screenshot="${spec.screenshot}"` : ''
      return (
        `<div data-layer="device" data-device data-pack="iphone_12_pro" data-pose="front"` +
        `${shot} data-screen-fallback="#0c0c0a" style="${at} width:900px;"></div>`
      )
    }
    case 'image':
      // An <img> with no src has an intrinsic height of zero, so an empty
      // template would insert a 600x0 block: in the layer tree, invisible on the
      // canvas, impossible to grab. The placeholder gives it real dimensions
      // until a real image is chosen — and is loud enough that reaching an
      // export unnoticed is unlikely.
      return `<img data-layer="image" src="${spec.screenshot ?? IMAGE_PLACEHOLDER_SRC}" style="${at} width:600px;">`
    case 'group':
      // Absolutely positioned and `position:relative`-by-virtue-of-absolute, so
      // children can be placed against the group's own box. Starts with one text
      // child: an empty group is invisible and unselectable on the canvas, which
      // reads as the insert having failed.
      return (
        `<div data-layer="group" style="${at} width:520px; height:120px;">` +
        `<div data-layer="text" data-role="caption" style="position:absolute; left:0; top:0;">Group</div>` +
        `</div>`
      )
    case 'decor':
    default:
      return (
        `<div data-layer="decor" style="${at} width:400px; height:400px; ` +
        `background:rgba(219,180,0,0.18); border-radius:32px;"></div>`
      )
  }
}

/**
 * A minimal schema-conformant strip, used by "New strip".
 * Panel size is the export size of the target preset.
 */
export function blankStripTemplate(title: string, panels: number, width: number, height: number): string {
  const sections = Array.from(
    { length: panels },
    (_, i) => `  <section class="panel" data-panel="${i}">\n  </section>`,
  ).join('\n')

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>${title}</title>
<style>
  html, body { margin: 0; }
  .strip { display: flex; gap: 0; width: max-content; background: #2b2b2b; }
  .panel {
    position: relative; overflow: hidden;
    width: ${width}px; height: ${height}px;
    background: #f5f1ee;
  }
  [data-role="title"] {
    font-family: Georgia, 'Times New Roman', serif; font-weight: 700;
    font-size: 128px; line-height: 1.08; letter-spacing: -1px; color: #0c0c0a;
  }
  [data-role="subtitle"] {
    font-family: -apple-system, 'Helvetica Neue', system-ui, sans-serif;
    font-size: 56px; line-height: 1.3; color: #57534e;
  }
  [data-role="caption"] {
    font-family: -apple-system, 'Helvetica Neue', system-ui, sans-serif;
    font-size: 38px; line-height: 1.4; color: #6b655b;
  }
</style>
<script type="module" src="/composer/device-frames.mjs"></script>
</head>
<body>
<div class="strip">
${sections}
</div>
</body>
</html>
`
}

/**
 * Inline style properties the editor treats as *geometry* — the ones P2 writes
 * to when moving and resizing. Listed here so the inspector can show exactly
 * what the author declared versus what the browser measured.
 */
export const GEOMETRY_PROPS = [
  'position',
  'left',
  'top',
  'right',
  'bottom',
  'width',
  'height',
  'z-index',
  'transform',
] as const
