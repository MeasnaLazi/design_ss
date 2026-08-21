// Pick a device frame pack for a target, at random.
//
// Exists because the one thing an agent cannot do is choose randomly. Asked to
// "pick one of these two", a model returns the same one every run — the same
// reason `iphone_12_pro` wins today, being the id in every doc example and
// template default. `Math.random()` is the entropy the loop is missing.
//
// The pick is deliberately *not* recorded anywhere. It is random with
// replacement: with two packs of a type, expect a repeat about half the time,
// and three identical runs in a row is unremarkable. That is the intent — the
// no-repeat rule in archetypes.md covers the structural axes, not this one.
//
// Usage:
//   node composer/pick-frame.mjs <target>            one pack id, chosen at random
//   node composer/pick-frame.mjs <target> --list     every pack for that target
//
// `<target>` is a folder name under strips/ — iphone, ipad, phone, tablet_7,
// tablet_10 — which is also what a pack's `type` declares in the catalogue.
//
// Exit 0 and the id on stdout. Exit 1 with a message on stderr when the target
// has no packs, so a missing pack is loud rather than a silent fallback to
// whichever pack happens to sit first in the catalogue.

import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '..')
const CATALOGUE = path.join(REPO_ROOT, 'composer/device-frames/index.json')

/**
 * Catalogue entries as `{ id, name, type }`.
 *
 * `id` is the folder name, taken from `path` — `/device-frames/<id>/frame.json`
 * — because the folder is what `data-pack` names. Exported so the tests can
 * exercise the parsing without touching disk.
 */
export function packsFromCatalogue(json) {
  return (json?.devices ?? [])
    .map((d) => ({ id: String(d.path ?? '').split('/').filter(Boolean)[1], name: d.name ?? '', type: d.type ?? '' }))
    .filter((d) => Boolean(d.id))
}

/** Every pack whose `type` is this target. */
export function packsForTarget(packs, target) {
  return packs.filter((p) => p.type === target)
}

export async function readCatalogue() {
  return packsFromCatalogue(JSON.parse(await fs.readFile(CATALOGUE, 'utf8')))
}

async function main() {
  const args = process.argv.slice(2)
  const list = args.includes('--list')
  const target = args.find((a) => !a.startsWith('--'))
  if (!target) throw new Error('usage: node composer/pick-frame.mjs <target> [--list]')

  const all = await readCatalogue()
  const matching = packsForTarget(all, target)

  if (matching.length === 0) {
    const types = [...new Set(all.map((p) => p.type))].filter(Boolean).sort()
    throw new Error(
      `no frame pack has type "${target}". The catalogue offers: ${types.join(', ') || '(none)'}. ` +
        `A pack's type must equal a folder name under strips/ — see composer/device-frames/README.md.`,
    )
  }

  if (list) {
    for (const p of matching) console.log(`${p.id}\t${p.name}`)
    return
  }
  console.log(matching[Math.floor(Math.random() * matching.length)].id)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((err) => {
    console.error(String(err.message ?? err))
    process.exit(1)
  })
}
