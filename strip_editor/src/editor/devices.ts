/**
 * The device targets a strip can be built for.
 *
 * **One folder per device target, not per app.** `strips/iphone/`, with
 * `strips/ipad/` beside it as targets are added. The app's name comes from
 * `input/app.md` and is used *in* the design — as a brand chip, a watermark —
 * but it never names anything on disk.
 *
 * This table is imported by both the editor UI and the dev-server API, and that
 * is the point: the two must not disagree about which panel size belongs in
 * which folder. If they did, a loaded strip would be filed under the wrong
 * device and export at the wrong size — a failure that looks like nothing until
 * App Store Connect rejects the upload.
 *
 * Panel size is the store's exact export size, because `composer/render.mjs`
 * screenshots each panel at its authored dimensions. **A target whose real
 * dimensions are not known does not belong in this list.** A guessed height
 * ships as a wrong-sized PNG, which is worse than the target being absent:
 * absent is visible immediately, wrong is visible at submission.
 */
export interface DeviceTarget {
  /** `preset` as written in `input/app.md`. */
  readonly preset: string
  /** The folder under `strips/`. */
  readonly folder: string
  readonly label: string
  readonly width: number
  readonly height: number
}

export const DEVICE_TARGETS: readonly DeviceTarget[] = [
  {
    preset: 'appstore_iphone_portrait',
    folder: 'iphone',
    label: 'App Store · iPhone 6.7" portrait',
    width: 1290,
    height: 2796,
  },
  {
    preset: 'appstore_ipad_portrait',
    folder: 'ipad',
    label: 'App Store · iPad 12.9" portrait',
    width: 2048,
    height: 2732,
  },
  {
    preset: 'play_phone_portrait',
    folder: 'phone',
    label: 'Play Store · phone portrait',
    width: 1080,
    height: 1920,
  },
  {
    preset: 'play_tablet_portrait',
    folder: 'tablet',
    label: 'Play Store · 10" tablet portrait',
    width: 1600,
    height: 2560,
  },
]

/**
 * A note on the two Play sizes above, because they are a different kind of
 * number from the Apple ones.
 *
 * Apple publishes exact export sizes and rejects anything else, so `iphone` and
 * `ipad` are specifications. Google publishes a *range* — 320–3840px per side,
 * at most 2:1 — and no canonical resolution, so `phone` and `tablet` are house
 * choices that sit comfortably inside that range, not requirements. Change them
 * if a project wants different ones; the only hard constraint this file imposes
 * is that no two targets share a size, since the size is how a loaded strip is
 * identified.
 */

export function deviceForFolder(folder: string): DeviceTarget | null {
  return DEVICE_TARGETS.find((d) => d.folder === folder) ?? null
}

export function deviceForPreset(preset: string): DeviceTarget | null {
  return DEVICE_TARGETS.find((d) => d.preset === preset) ?? null
}

/**
 * Which target has these panel dimensions, if any.
 *
 * Exact match only. Panel size is not a preference to be rounded to the nearest
 * device — it is the export size, and a strip 8px off an iPhone panel is not an
 * iPhone strip, it is a mistake worth surfacing.
 */
export function deviceForSize(width: number, height: number): DeviceTarget | null {
  return DEVICE_TARGETS.find((d) => d.width === width && d.height === height) ?? null
}

/**
 * The panel size a strip document declares, read from its source text.
 *
 * A strip states its device target in exactly one place — the CSS `width` and
 * `height` on its `.panel` rule — so that rule is what identifies the strip when
 * it arrives from outside the repo. Later rules win, as they do in CSS.
 *
 * This is a text scan, not a browser, and it therefore only sees panel size
 * expressed the way the schema writes it: pixel `width`/`height` in a rule whose
 * selector names `.panel`. A strip that sizes its panels some other way — inline
 * styles, a different class, a custom property — reads as `null`, and the right
 * response to `null` is to refuse and say what was looked for. Guessing a device
 * for a strip we could not measure is how a file ends up in the wrong folder.
 *
 * @returns the measured size, or `null` if the document does not state one.
 */
export function panelSizeFromHtml(html: string): { width: number; height: number } | null {
  let width: number | null = null
  let height: number | null = null

  // Rule blocks, non-nested. An @media wrapper's own braces will not match, but
  // the rules inside it still do, which is the behaviour we want.
  const rule = /([^{}]+)\{([^{}]*)\}/g
  for (let m = rule.exec(html); m !== null; m = rule.exec(html)) {
    const [, selector, body] = m
    // `.panel` as a whole class token — not `.panel-inner`, not `.subpanel`.
    if (!/(^|[\s,>+~])\.panel(?![\w-])/.test(selector)) continue

    // The leading guard keeps `min-width` / `max-height` out: `-` is not in it.
    const w = /(?:^|[;{\s])width\s*:\s*(\d+(?:\.\d+)?)px/i.exec(body)
    const h = /(?:^|[;{\s])height\s*:\s*(\d+(?:\.\d+)?)px/i.exec(body)
    if (w) width = Math.round(Number(w[1]))
    if (h) height = Math.round(Number(h[1]))
  }

  return width !== null && height !== null ? { width, height } : null
}
