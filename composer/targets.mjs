// The device targets, read from targets.json — the one place a panel size is
// stated. A target's key is its folder name under strips/ and input/; its
// `panel` is the exact size of each exported PNG.
//
// The file is read with fs rather than imported: JSON import attributes are
// not available on Node 20.0, which is the floor `engines` declares.

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'targets.json')

/**
 * Throw unless `targets` is usable: every entry has a name, a store and a
 * whole-pixel panel, and no two entries share a panel size.
 *
 * The uniqueness half is what lets a strip be identified from its `.panel`
 * size alone (NOTES.md, "Panel size is the only thing that names a target").
 * Exported so the tests can feed it a broken table without touching disk.
 */
export function validateTargets(targets) {
  const seen = new Map()
  const names = Object.keys(targets ?? {})
  if (!names.length) throw new Error('targets.json declares no targets')
  for (const key of names) {
    const t = targets[key]
    const { width, height } = t?.panel ?? {}
    if (!t?.name || !t?.store) throw new Error(`target "${key}" needs a name and a store`)
    if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
      throw new Error(`target "${key}" needs a panel with whole-pixel width and height`)
    }
    const size = `${width}x${height}`
    if (seen.has(size)) {
      throw new Error(`targets "${seen.get(size)}" and "${key}" share the panel size ${size} — a strip is identified by its size, so each must be unique`)
    }
    seen.set(size, key)
  }
  return targets
}

/** Every target, keyed by folder name: `{ name, store, panel: { width, height } }`. */
export const TARGETS = validateTargets(JSON.parse(readFileSync(FILE, 'utf8')))

/** The folder names, in the order the file lists them. */
export const TARGET_NAMES = Object.keys(TARGETS)

/** A target's panel size, or `null` for a name the file does not list. */
export function panelFor(name) {
  return Object.hasOwn(TARGETS, name) ? TARGETS[name].panel : null
}

/** The name of the target with exactly this panel size, or `null`. */
export function targetForSize(width, height) {
  return TARGET_NAMES.find((n) => TARGETS[n].panel.width === width && TARGETS[n].panel.height === height) ?? null
}
