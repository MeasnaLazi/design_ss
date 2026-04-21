import type {
  BackgroundGradientConfig,
  BackgroundGradientKind,
  GradientColorStop,
} from '../store/designTypes'

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x)
}

export function clampGradientOffset(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.min(1, Math.max(0, n))
}

/** Sort by offset; keeps stable order for equal offsets. */
export function sortGradientStops(stops: GradientColorStop[]): GradientColorStop[] {
  return [...stops].sort((a, b) => a.offset - b.offset || 0)
}

export const DEFAULT_BACKGROUND_GRADIENT: BackgroundGradientConfig = {
  kind: 'linear',
  angleDeg: 135,
  stops: [
    { offset: 0, color: '#0f172a' },
    { offset: 1, color: '#1e293b' },
  ],
}

/**
 * Coerces persisted or partial gradient JSON into a valid {@link BackgroundGradientConfig}.
 * Supports legacy `{ colorFrom, colorTo, angleDeg }` without `stops`.
 */
export function normalizeBackgroundGradient(raw: unknown): BackgroundGradientConfig {
  if (!isRecord(raw)) {
    return { ...DEFAULT_BACKGROUND_GRADIENT, stops: [...DEFAULT_BACKGROUND_GRADIENT.stops] }
  }

  const kind: BackgroundGradientKind =
    raw.kind === 'radial' ? 'radial' : 'linear'

  const angleDeg =
    typeof raw.angleDeg === 'number' && Number.isFinite(raw.angleDeg) ? raw.angleDeg : 135

  if (Array.isArray(raw.stops) && raw.stops.length >= 2) {
    const parsed: GradientColorStop[] = []
    for (const s of raw.stops) {
      if (!isRecord(s)) continue
      if (typeof s.color !== 'string') continue
      if (typeof s.offset !== 'number' || !Number.isFinite(s.offset)) continue
      parsed.push({
        offset: clampGradientOffset(s.offset),
        color: s.color,
      })
    }
    if (parsed.length >= 2) {
      const stops = sortGradientStops(parsed)
      stops[0] = { ...stops[0], offset: 0 }
      stops[stops.length - 1] = { ...stops[stops.length - 1], offset: 1 }
      return { kind, angleDeg, stops }
    }
  }

  const colorFrom =
    typeof raw.colorFrom === 'string' && raw.colorFrom.length > 0
      ? raw.colorFrom
      : DEFAULT_BACKGROUND_GRADIENT.stops[0].color
  const colorTo =
    typeof raw.colorTo === 'string' && raw.colorTo.length > 0
      ? raw.colorTo
      : DEFAULT_BACKGROUND_GRADIENT.stops[1].color

  return {
    kind,
    angleDeg,
    stops: [
      { offset: 0, color: colorFrom },
      { offset: 1, color: colorTo },
    ],
  }
}

export function isValidBackgroundGradientJson(bg: unknown): boolean {
  if (!isRecord(bg)) return false
  if (
    bg.angleDeg !== undefined &&
    (typeof bg.angleDeg !== 'number' || !Number.isFinite(bg.angleDeg))
  ) {
    return false
  }
  if (bg.kind !== undefined && bg.kind !== 'linear' && bg.kind !== 'radial') {
    return false
  }
  if (Array.isArray(bg.stops)) {
    if (bg.stops.length < 2) return false
    return bg.stops.every((s) => {
      if (!isRecord(s)) return false
      return (
        typeof s.color === 'string' &&
        typeof s.offset === 'number' &&
        Number.isFinite(s.offset)
      )
    })
  }
  return (
    typeof bg.colorFrom === 'string' &&
    typeof bg.colorTo === 'string' &&
    typeof bg.angleDeg === 'number' &&
    Number.isFinite(bg.angleDeg)
  )
}
