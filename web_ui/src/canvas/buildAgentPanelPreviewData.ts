import { FabricImage, Group, Textbox } from 'fabric'
import type { Canvas, FabricObject } from 'fabric'

import { screenExportRect, totalContinuousWidth } from '../constants/appStoreScreens'
import { getArtboardDimensionsFromConfig } from '../constants/artboardPresets'
import { DEFAULT_DEVICE_FRAME_STYLE_ID } from '../constants/deviceFrameStyles'
import { findObjectOnCanvasByAppId } from '../lib/fabricObjectRegistry'
import {
  AGENT_PANEL_PREVIEW_DATA_VERSION,
  type AgentPanelPreviewBackground,
  type AgentPanelPreviewData,
  type AgentPanelPreviewLayer,
  type AgentPanelPreviewPanelEntry,
} from '../types/agentPanelPreviewData'
import { useDesignStore } from '../store/useDesignStore'

function boundingRectForAlign(layerId: string, target: FabricObject): {
  left: number
  top: number
  width: number
  height: number
} {
  const rec = useDesignStore.getState().objects.find((o) => o.id === layerId)
  if (rec?.kind === 'device' && target instanceof Group) {
    const children = target.getObjects()
    const frame = children[children.length - 1]
    if (frame instanceof FabricImage) {
      return frame.getBoundingRect()
    }
  }
  return target.getBoundingRect()
}

function panelIndexContainingPoint(cx: number, cy: number): number | null {
  const config = useDesignStore.getState().config
  const screens = Math.max(1, Math.floor(Number(config.screens) || 1))
  const gap = Number(config.gap) || 0
  const { width: panelW, height: panelH } = getArtboardDimensionsFromConfig(config)
  for (let i = 0; i < screens; i += 1) {
    const r = screenExportRect(i, gap, panelW, panelH)
    if (cx >= r.left && cx < r.left + r.width && cy >= r.top && cy < r.top + r.height) {
      return i
    }
  }
  return null
}

function panelIndexForLayerObject(layerId: string, obj: FabricObject): number | null {
  const b = boundingRectForAlign(layerId, obj)
  const cx = b.left + b.width / 2
  const cy = b.top + b.height / 2
  return panelIndexContainingPoint(cx, cy)
}

function panelOrigin(panelIndex: number): { x: number; y: number } | null {
  const config = useDesignStore.getState().config
  const screens = Math.max(1, config.screens)
  if (!Number.isInteger(panelIndex) || panelIndex < 0 || panelIndex >= screens) return null
  const { width, height } = getArtboardDimensionsFromConfig(config)
  const r = screenExportRect(panelIndex, config.gap, width, height)
  return { x: r.left, y: r.top }
}

function normalizeHexColor(raw: unknown): string {
  const value = String(raw ?? '#ffffff').trim()
  if (/^#[0-9a-f]{6}$/i.test(value)) return value.toLowerCase()
  if (/^#[0-9a-f]{3}$/i.test(value)) {
    const h = value.slice(1)
    return `#${h[0]}${h[0]}${h[1]}${h[1]}${h[2]}${h[2]}`.toLowerCase()
  }
  return '#ffffff'
}

function normalizeTextAlign(raw: unknown): 'left' | 'center' | 'right' {
  const align = String(raw ?? 'left')
  if (align === 'center' || align === 'right') return align
  return 'left'
}

function serializeBackground(config: ReturnType<typeof useDesignStore.getState>['config']): AgentPanelPreviewBackground | undefined {
  const mode = String(config.backgroundMode ?? 'solid').toLowerCase()
  if (mode === 'solid' || mode === 'color') {
    const hex = normalizeHexColor(config.background)
    return { type: 'color', value: hex }
  }
  if (mode === 'gradient' && config.backgroundGradient) {
    return { type: 'gradient', value: config.backgroundGradient as Record<string, unknown> }
  }
  if (mode === 'image' && config.backgroundImageUrl) {
    return { type: 'image', value: String(config.backgroundImageUrl) }
  }
  return undefined
}

function revisionPayload(
  gap: number,
  workspaceWidth: number,
  workspaceHeight: number,
  background: AgentPanelPreviewBackground | undefined,
  panels: AgentPanelPreviewPanelEntry[],
): string {
  return JSON.stringify({
    version: AGENT_PANEL_PREVIEW_DATA_VERSION,
    gap,
    workspace_width: workspaceWidth,
    workspace_height: workspaceHeight,
    background: background ?? null,
    panels,
  })
}

export function buildAgentPanelPreviewData(
  canvas: Canvas,
  panelIndexes: number[],
): AgentPanelPreviewData {
  const { config, objects } = useDesignStore.getState()
  const { width: panelWidth, height: panelHeight } = getArtboardDimensionsFromConfig(config)
  const screens = Math.max(1, Math.floor(Number(config.screens ?? 1)))
  const gap = Number(config.gap) || 0
  const panelSet = new Set(panelIndexes)

  const workspaceWidth = totalContinuousWidth(screens, gap, panelWidth)
  const workspaceHeight = panelHeight

  const byPanel = new Map<number, AgentPanelPreviewLayer[]>()
  for (const idx of panelIndexes) {
    byPanel.set(idx, [])
  }

  for (const rec of objects) {
    if (rec.kind !== 'text' && rec.kind !== 'device') continue
    const obj = findObjectOnCanvasByAppId(canvas, rec.id)
    if (!obj) continue
    const panelIndex = panelIndexForLayerObject(rec.id, obj)
    if (panelIndex === null || !panelSet.has(panelIndex)) continue
    const origin = panelOrigin(panelIndex)
    if (!origin) continue
    const bucket = byPanel.get(panelIndex)
    if (!bucket) continue

    if (rec.kind === 'text' && obj instanceof Textbox) {
      const b = boundingRectForAlign(rec.id, obj)
      const fontFamily = String(obj.fontFamily ?? '').trim()
      const lineHeight = Number(obj.lineHeight)
      const letterSpacing = Number(obj.charSpacing)
      bucket.push({
        layer_id: rec.id,
        kind: 'text',
        z_index: rec.zIndex,
        content: String(obj.text ?? ''),
        size: Math.round(Number(obj.fontSize ?? 0)),
        color: normalizeHexColor(obj.fill),
        align: normalizeTextAlign(obj.textAlign),
        weight: String(obj.fontWeight ?? '400'),
        ...(fontFamily ? { font: fontFamily } : {}),
        ...(Number.isFinite(lineHeight) && lineHeight > 0 ? { line_height: lineHeight } : {}),
        ...(Number.isFinite(letterSpacing) ? { letter_spacing: letterSpacing } : {}),
        x: Math.round(b.left - origin.x),
        y: Math.round(b.top - origin.y),
        width: Math.round(b.width),
        height: Math.round(b.height),
      })
      continue
    }

    if (rec.kind === 'device' && obj instanceof Group) {
      const b = boundingRectForAlign(rec.id, obj)
      const cx = b.left + b.width / 2
      const cy = b.top + b.height / 2
      bucket.push({
        layer_id: rec.id,
        kind: 'device',
        z_index: rec.zIndex,
        x: Math.round(cx - origin.x),
        y: Math.round(cy - origin.y),
        width: Math.round(b.width),
        height: Math.round(b.height),
        angle: Math.round(Number(obj.angle ?? 0)),
        frame: rec.deviceFrameStyleId ?? DEFAULT_DEVICE_FRAME_STYLE_ID,
        pack_id: rec.deviceFramePackId ?? '',
      })
    }
  }

  const sortedPanelIndexes = [...panelIndexes].sort((a, b) => a - b)
  const panels: AgentPanelPreviewPanelEntry[] = []
  for (const panelIndex of sortedPanelIndexes) {
    const r = screenExportRect(panelIndex, gap, panelWidth, panelHeight)
    const layers = (byPanel.get(panelIndex) ?? []).sort(
      (a, b) => a.z_index - b.z_index || a.layer_id.localeCompare(b.layer_id),
    )
    panels.push({
      panel_index: panelIndex,
      panel_width: Math.round(r.width),
      panel_height: Math.round(r.height),
      panel_x: Math.round(r.left),
      panel_y: Math.round(r.top),
      layers,
    })
  }

  const background = serializeBackground(config)
  const revision = revisionPayload(gap, workspaceWidth, workspaceHeight, background, panels)

  return {
    version: AGENT_PANEL_PREVIEW_DATA_VERSION,
    revision,
    capturedAt: new Date().toISOString(),
    gap,
    workspace_width: workspaceWidth,
    workspace_height: workspaceHeight,
    ...(background ? { background } : {}),
    panels,
  }
}
