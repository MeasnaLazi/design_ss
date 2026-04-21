import type { BackgroundGradientConfig } from '../store/designTypes'

export interface CanvasGradientPreset {
  id: string
  label: string
  gradient: BackgroundGradientConfig
}

/** One-tap gradients tuned for App Store–style screenshot panels. */
export const CANVAS_GRADIENT_PRESETS: CanvasGradientPreset[] = [
  {
    id: 'slate_depth',
    label: 'Slate depth',
    gradient: {
      kind: 'linear',
      angleDeg: 135,
      stops: [
        { offset: 0, color: '#0f172a' },
        { offset: 1, color: '#1e293b' },
      ],
    },
  },
  {
    id: 'aurora',
    label: 'Aurora',
    gradient: {
      kind: 'linear',
      angleDeg: 125,
      stops: [
        { offset: 0, color: '#0c4a6e' },
        { offset: 0.45, color: '#312e81' },
        { offset: 1, color: '#134e4a' },
      ],
    },
  },
  {
    id: 'sunset_card',
    label: 'Sunset',
    gradient: {
      kind: 'linear',
      angleDeg: 160,
      stops: [
        { offset: 0, color: '#431407' },
        { offset: 0.5, color: '#9a3412' },
        { offset: 1, color: '#f59e0b' },
      ],
    },
  },
  {
    id: 'spotlight',
    label: 'Spotlight',
    gradient: {
      kind: 'radial',
      angleDeg: 225,
      stops: [
        { offset: 0, color: '#27272a' },
        { offset: 0.55, color: '#18181b' },
        { offset: 1, color: '#09090b' },
      ],
    },
  },
  {
    id: 'ocean_glass',
    label: 'Ocean glass',
    gradient: {
      kind: 'linear',
      angleDeg: 180,
      stops: [
        { offset: 0, color: '#042f2e' },
        { offset: 0.55, color: '#115e59' },
        { offset: 1, color: '#134e4a' },
      ],
    },
  },
  {
    id: 'rose_metal',
    label: 'Rose metal',
    gradient: {
      kind: 'linear',
      angleDeg: 45,
      stops: [
        { offset: 0, color: '#1c1917' },
        { offset: 0.4, color: '#4c0519' },
        { offset: 1, color: '#292524' },
      ],
    },
  },
]
