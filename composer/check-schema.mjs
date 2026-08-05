// Structural conformance check for strip HTML, against composer/strip-schema.md.
//
// This checks *structure*, never taste. It answers "will the renderer and the
// editor both understand this file", not "is this a good design" — the style
// heuristics that used to live in the toolkit were removed deliberately and
// must not creep back in here. Every rule below maps to a line in the schema
// that, when broken, makes a block unexportable or uneditable.
//
// Usage:
//   node composer/check-schema.mjs <file.html> [more.html ...]
//   node composer/check-schema.mjs --all        # every strip in the repo
//   node composer/check-schema.mjs --skeleton   # the example inside strip-schema.md
//
// Exit 0 when clean, 1 when any file has an error. Warnings never fail.

import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const TEXT_ROLES = new Set(['title', 'subtitle', 'caption'])
const LAYER_KINDS = new Set(['text', 'device', 'image', 'decor'])

/** Opening tags with their raw attribute text, in source order. */
function* tags(html) {
  const re = /<([a-zA-Z][\w-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g
  let m
  while ((m = re.exec(html))) {
    yield { name: m[1].toLowerCase(), attrs: m[2], index: m.index, raw: m[0] }
  }
}

function attr(attrText, name) {
  const re = new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i')
  const m = attrText.match(re)
  if (m) return m[2] ?? m[3] ?? ''
  // Valueless attribute, e.g. `data-device`
  return new RegExp(`\\b${name}\\b`, 'i').test(attrText) ? '' : null
}

function styleProp(styleText, prop) {
  if (!styleText) return null
  const m = styleText.match(new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`, 'i'))
  return m ? m[1].trim() : null
}

/** Inner HTML of the element whose opening tag ends at `from`, by tag balance. */
function innerHtml(html, tagName, from) {
  const open = new RegExp(`<${tagName}\\b`, 'gi')
  const close = new RegExp(`</${tagName}\\s*>`, 'gi')
  let depth = 1
  let i = from
  while (depth > 0) {
    open.lastIndex = i
    close.lastIndex = i
    const o = open.exec(html)
    const c = close.exec(html)
    if (!c) return html.slice(from)
    if (o && o.index < c.index) {
      depth += 1
      i = o.index + o[0].length
    } else {
      depth -= 1
      if (depth === 0) return html.slice(from, c.index)
      i = c.index + c[0].length
    }
  }
  return ''
}

const VOID_ELEMENTS = new Set([
  'img', 'br', 'hr', 'input', 'meta', 'link', 'source', 'area',
  'base', 'col', 'embed', 'param', 'track', 'wbr',
])
/** Elements inside a panel that draw nothing and so need no layer kind. */
const NON_VISUAL = new Set(['style', 'script', 'template'])

/**
 * Direct element children of every panel, with the panel index.
 *
 * Depth matters: a shape nested *inside* a decor block is that block's business
 * — decor is free HTML/CSS — but an element sitting directly in the panel is a
 * layer, and if it is not labelled as one the editor cannot see it at all.
 */
function* panelChildren(html) {
  const tagRe = /<(\/?)([a-zA-Z][\w-]*)((?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)>/g
  const panelRe = /<section((?:[^>"']|"[^"]*"|'[^']*')*?)>/g
  let open
  while ((open = panelRe.exec(html))) {
    const index = attr(open[1], 'data-panel')
    if (index === null) continue

    let depth = 0
    tagRe.lastIndex = open.index + open[0].length
    let t
    while ((t = tagRe.exec(html))) {
      const [, closing, rawName, attrs, selfClose] = t
      const name = rawName.toLowerCase()
      if (closing) {
        if (name === 'section' && depth === 0) break // end of this panel
        depth -= 1
        continue
      }
      if (depth === 0 && !NON_VISUAL.has(name)) yield { panel: index, name, attrs }
      if (!selfClose && !VOID_ELEMENTS.has(name)) depth += 1
    }
  }
}

async function exists(repoRelUrl) {
  const clean = repoRelUrl.split('?')[0].split('#')[0].replace(/^\/+/, '')
  try {
    await fs.access(path.join(REPO_ROOT, clean))
    return true
  } catch {
    return false
  }
}

export async function checkStrip(html, label) {
  // Sets, not arrays: one missing screenshot referenced by five panels is one
  // problem to fix, not five lines of noise.
  const errors = new Set()
  const warnings = new Set()
  const E = (m) => errors.add(m)
  const W = (m) => warnings.add(m)

  // --- document shape -----------------------------------------------------
  const stripCount = [...html.matchAll(/class\s*=\s*"[^"]*\bstrip\b[^"]*"/g)].length
  if (stripCount === 0) {
    // Not a strip document. composer/test/ also holds fixtures like
    // pose-test.html — a grid of every pose, which is not and should not be a
    // panel strip. Checking it against this contract produces only noise.
    return { label, errors: [], warnings: [], isStrip: false }
  }
  if (stripCount > 1) E(`${stripCount} elements carry class "strip"; there must be exactly one`)

  const panelIndexes = [...html.matchAll(/\bdata-panel\s*=\s*"(\d+)"/g)].map((m) => Number(m[1]))
  if (panelIndexes.length === 0) E('no `<section data-panel="N">` panels found')
  panelIndexes.forEach((n, i) => {
    if (n !== i) E(`panel indexes must be 0-based and sequential; found ${n} at position ${i}`)
  })

  // --- boilerplate --------------------------------------------------------
  const usesDevices = /\bdata-device\b/.test(html)
  const hasRuntime = /src\s*=\s*"[^"]*\/composer\/device-frames\.mjs"/.test(html)
  if (usesDevices && !hasRuntime) {
    E('device blocks present but /composer/device-frames.mjs is not loaded — they will never build')
  }
  const framesRoot = html.match(/framesRoot\s*:\s*'([^']*)'|framesRoot\s*:\s*"([^"]*)"/)
  if (framesRoot) {
    const value = framesRoot[1] ?? framesRoot[2]
    if (value.includes('web_ui')) {
      W(`sets framesRoot to "${value}" — the legacy path. New strips omit framesRoot and inherit /composer`)
    } else {
      W(`sets framesRoot to "${value}"; the default /composer is normally correct`)
    }
  }

  // --- blocks -------------------------------------------------------------
  let blocks = 0
  for (const t of tags(html)) {
    const kind = attr(t.attrs, 'data-layer')
    const isDevice = attr(t.attrs, 'data-device') !== null
    if (kind === null && !isDevice) continue
    blocks += 1

    const where = `<${t.name} data-layer="${kind ?? '(none)'}">`
    if (kind !== null && !LAYER_KINDS.has(kind)) {
      E(`${where} unknown data-layer kind "${kind}"; expected one of ${[...LAYER_KINDS].join(', ')}`)
    }

    const style = attr(t.attrs, 'style') ?? ''
    const position = styleProp(style, 'position')
    if (position !== 'absolute' && position !== 'fixed') {
      E(`${where} is not absolutely positioned — it cannot be moved by writing left/top, so the editor cannot place it`)
    }

    if (kind === 'text') {
      const role = attr(t.attrs, 'data-role')
      if (role === null) E(`${where} has no data-role`)
      else if (!TEXT_ROLES.has(role)) E(`${where} data-role="${role}" is not one of ${[...TEXT_ROLES].join(', ')}`)

      const inner = innerHtml(html, t.name, t.index + t.raw.length)
      const stray = inner.replace(/<br\s*\/?>/gi, '').match(/<([a-zA-Z][\w-]*)/)
      if (stray) {
        E(`${where} contains <${stray[1]}>; a text block may hold text and <br> only — the editor discards anything else on first edit`)
      }
    }

    if (isDevice) {
      for (const required of ['data-pack', 'data-pose']) {
        if (!attr(t.attrs, required)) E(`${where} missing ${required}`)
      }
      if (!styleProp(style, 'width')) E(`${where} has no CSS width; width is what sets a device's scale`)
      const h = styleProp(style, 'height')
      if (h) E(`${where} sets height:${h} — never set a device height; it follows the pose viewBox aspect`)
      const fit = attr(t.attrs, 'data-fit')
      if (fit !== null && fit !== 'cover' && fit !== 'stretch') {
        W(`${where} data-fit="${fit}" is not cover or stretch; anything but cover behaves as stretch`)
      }
    }

    if (kind === 'image') {
      const src = attr(t.attrs, 'src')
      if (!src) E(`${where} has no src; an <img> with no source lays out at zero height and is invisible`)
      else if (src.includes('placeholder.svg')) W(`${where} still shows the editor placeholder`)
    }

    // An <img> labelled decor exports perfectly and is *almost* editable — the
    // editor selects and moves it, then offers the decor inspector: background
    // and border, no src field, no library picker, no object-fit. So the one
    // thing you actually want to change about a picture is the one thing you
    // cannot. A warning rather than an error, because decor is by definition
    // free HTML and an <img> is legal inside one.
    if (t.name === 'img' && kind === 'decor') {
      W(
        `${where} is an <img> labelled decor — the editor will offer background and border but no src, ` +
          `library picker or object-fit. Use data-layer="image" unless this is deliberate`,
      )
    }
  }
  if (blocks === 0) W('no layer blocks found')

  // --- unlabelled elements -------------------------------------------------
  // The failure this catches is quiet and nasty: the element renders correctly
  // in the export, so nothing looks wrong, but the editor's registry only knows
  // `[data-layer], [data-device]` — so the block cannot be clicked, dragged,
  // deleted or found in the layer tree. The design ships fine and is
  // uneditable, which is the worst combination to discover late.
  for (const child of panelChildren(html)) {
    if (attr(child.attrs, 'data-layer') !== null || attr(child.attrs, 'data-device') !== null) continue
    const hint = attr(child.attrs, 'class')
    const what = `<${child.name}${hint ? ` class="${hint}"` : ''}>`
    E(
      `panel ${child.panel}: ${what} has no data-layer — it renders but the editor cannot select it. ` +
        `Decorative shapes need data-layer="decor"`,
    )
  }

  // --- assets -------------------------------------------------------------
  for (const m of html.matchAll(/(?:src|href)\s*=\s*"([^"]+)"/g)) {
    const url = m[1]
    if (/^(https?:)?\/\//i.test(url)) {
      E(`external network asset "${url}" — everything must resolve from the repo`)
      continue
    }
    if (!url.startsWith('/')) continue
    if (!(await exists(url))) E(`asset not found on disk: ${url}`)
  }
  for (const m of html.matchAll(/\bdata-screenshot\s*=\s*"([^"]+)"/g)) {
    if (!(await exists(m[1]))) E(`data-screenshot not found on disk: ${m[1]}`)
  }

  return { label, errors: [...errors], warnings: [...warnings], isStrip: stripCount > 0 }
}

/** The example inside strip-schema.md — the doc must not teach markup it forbids. */
async function skeletonFromSchema() {
  const doc = await fs.readFile(path.join(REPO_ROOT, 'composer/strip-schema.md'), 'utf8')
  const blocks = [...doc.matchAll(/```html\n([\s\S]*?)```/g)].map((m) => m[1])
  const skeleton = blocks.find((b) => b.includes('<!doctype html>'))
  if (!skeleton) throw new Error('no full-document example found in composer/strip-schema.md')
  // The example uses a <id> stand-in for a screenshot; point it at a real file
  // so the asset check exercises the path shape rather than the placeholder.
  const dir = 'datasource/screenshots/appstore_iphone_portrait'
  let real = null
  try {
    const names = await fs.readdir(path.join(REPO_ROOT, dir))
    real = names.find((n) => n.toLowerCase().endsWith('.png'))
  } catch {
    /* library absent — leave the stand-in and let the asset check report it */
  }
  return real ? skeleton.replaceAll(`/${dir}/<id>.png`, `/${dir}/${real}`) : skeleton
}

/**
 * Every strip in the repo: `strips/<name>/strip.html` (one folder per strip,
 * with its images and renders beside it) plus the flat fixtures in
 * `composer/test/`. One level of nesting, deliberately — a strip folder holds a
 * strip, not a tree of them.
 */
async function findStrips() {
  const out = []
  for (const dir of ['strips', 'composer/test']) {
    const abs = path.join(REPO_ROOT, dir)
    let entries = []
    try {
      entries = await fs.readdir(abs, { withFileTypes: true })
    } catch {
      continue
    }
    for (const e of entries) {
      if (e.isFile() && e.name.toLowerCase().endsWith('.html')) {
        out.push(path.join(abs, e.name))
      } else if (e.isDirectory()) {
        let inner = []
        try {
          inner = await fs.readdir(path.join(abs, e.name))
        } catch {
          continue
        }
        for (const n of inner) {
          if (n.toLowerCase().endsWith('.html')) out.push(path.join(abs, e.name, n))
        }
      }
    }
  }
  return out
}

// Only run the CLI when invoked directly. `checkStrip` is imported by
// strip_editor's contract test, which must not trigger a process.exit.
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const args = process.argv.slice(2)
  if (args.length === 0) {
    console.error('usage: node composer/check-schema.mjs <file.html> [...] | --all | --skeleton')
    process.exit(2)
  }
  
  let failed = 0
  const report = ({ label, errors, warnings, isStrip }, { explicit }) => {
    if (!isStrip) {
      // Asked about this file by name: say why nothing was checked, rather than
      // reporting a clean bill of health for a file that was never examined.
      console.log(`SKIP  ${label}  (no .strip root — not a strip document)`)
      if (explicit) failed += 0
      return
    }
    if (errors.length) failed += 1
    console.log(`${errors.length ? 'FAIL' : warnings.length ? 'WARN' : 'OK  '}  ${label}`)
    for (const e of errors) console.log(`        error: ${e}`)
    for (const w of warnings) console.log(`        warn:  ${w}`)
  }
  
  if (args[0] === '--skeleton') {
    const html = await skeletonFromSchema()
    report(await checkStrip(html, 'composer/strip-schema.md § Skeleton'), { explicit: true })
  } else {
    const files = args[0] === '--all' ? await findStrips() : args.map((a) => path.resolve(a))
    for (const file of files) {
      const html = await fs.readFile(file, 'utf8')
      // Files outside the repo (a scratch copy, say) relativise to a stack
      // of `../` that tells the reader nothing; show those as given.
      const rel = file.startsWith(REPO_ROOT + path.sep) ? path.relative(REPO_ROOT, file) : file
      report(await checkStrip(html, rel), { explicit: args[0] !== '--all' })
    }
  }
  process.exit(failed ? 1 : 0)
}
