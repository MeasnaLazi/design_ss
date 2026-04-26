import type { Canvas } from 'fabric'
import { Group, Textbox } from 'fabric'

import { totalContinuousWidth } from '../constants/appStoreScreens'
import { getArtboardDimensionsFromConfig } from '../constants/artboardPresets'
import { findObjectOnCanvasByAppId } from '../lib/fabricObjectRegistry'
import type { DesignConfig, DesignObjectRecord } from '../store/designTypes'
import { useDesignStore } from '../store/useDesignStore'

export const AGENT_LAYOUT_SUMMARY_VERSION = 1 as const

export type AgentLayoutSummaryBackground =
  | { type: 'solid'; color: string }
  | {
      type: 'gradient'
      kind: string
      angleDeg: number
      stops: { offset: number; color: string }[]
    }
  | { type: 'image'; url: string }

type AgentLayerCommon = {
  layer_id: string
  layer_name: string
  zIndex: number
  left: number
  top: number
  width: number
  height: number
  angle: number
  scaleX: number
  scaleY: number
}

export type AgentLayoutSummaryLayer =
  | (AgentLayerCommon & {
      kind: 'text'
      text: string
      fontSize: number
      fill: string
      fontFamily: string
      fontWeight: string | number
      fontStyle: string
      textAlign: string
    })
  | (AgentLayerCommon & {
      kind: 'device'
      device_frame_style_id: string
      device_frame_pack_id: string
    })
  | (AgentLayerCommon & {
      kind: string
    })

export type AgentLayoutSummaryV1 = {
  layoutSummaryVersion: typeof AGENT_LAYOUT_SUMMARY_VERSION
  savedAt: string
  /** Full Fabric artboard: multi-panel width includes gaps; height is one row (preset height). */
  canvas: { width: number; height: number }
  layout: {
    artboardPresetId: string
    screens: number
    gap: number
  }
  background: AgentLayoutSummaryBackground
  layers: AgentLayoutSummaryLayer[]
}

function summarizeBackground(cfg: DesignConfig): AgentLayoutSummaryBackground {
  if (cfg.backgroundImageUrl) {
    return { type: 'image', url: cfg.backgroundImageUrl }
  }
  if (cfg.backgroundMode === 'gradient') {
    const g = cfg.backgroundGradient
    return {
      type: 'gradient',
      kind: g.kind,
      angleDeg: g.angleDeg,
      stops: g.stops.map((s) => ({ offset: s.offset, color: s.color })),
    }
  }
  return { type: 'solid', color: cfg.background }
}

function geometryForObject(obj: {
  left?: number
  top?: number
  angle?: number
  scaleX?: number
  scaleY?: number
  getScaledWidth(): number
  getScaledHeight(): number
}): Pick<
  AgentLayerCommon,
  'left' | 'top' | 'width' | 'height' | 'angle' | 'scaleX' | 'scaleY'
> {
  return {
    left: obj.left ?? 0,
    top: obj.top ?? 0,
    width: Math.round(obj.getScaledWidth() * 100) / 100,
    height: Math.round(obj.getScaledHeight() * 100) / 100,
    angle: Math.round((obj.angle ?? 0) * 100) / 100,
    scaleX: Math.round((obj.scaleX ?? 1) * 10000) / 10000,
    scaleY: Math.round((obj.scaleY ?? 1) * 10000) / 10000,
  }
}

/**
 * Compact layout description for agents (`export_json` / pull-export).
 * Omits full Fabric `toObject()` blobs.
 */
export function buildAgentLayoutSummaryFromCanvas(canvas: Canvas): AgentLayoutSummaryV1 {
  const { config, objects } = useDesignStore.getState()
  const { width: panelW, height: panelH } = getArtboardDimensionsFromConfig(config)
  const screens = Math.max(1, Math.floor(Number(config.screens) || 1))
  const gap = config.gap
  const width = totalContinuousWidth(screens, gap, panelW)
  const height = panelH

  const sorted = [...objects].sort((a, b) => a.zIndex - b.zIndex)

  const layers: AgentLayoutSummaryLayer[] = []

  for (const rec of sorted) {
    const layer = buildLayerEntry(canvas, rec)
    if (layer) layers.push(layer)
  }

  return {
    layoutSummaryVersion: AGENT_LAYOUT_SUMMARY_VERSION,
    savedAt: new Date().toISOString(),
    canvas: { width, height },
    layout: {
      artboardPresetId: config.artboardPresetId,
      screens,
      gap,
    },
    background: summarizeBackground(config),
    layers,
  }
}

function buildLayerEntry(canvas: Canvas, rec: DesignObjectRecord): AgentLayoutSummaryLayer | null {
  const obj = findObjectOnCanvasByAppId(canvas, rec.id)
  if (!obj) {
    return {
      kind: rec.kind,
      layer_id: rec.id,
      layer_name: rec.name,
      zIndex: rec.zIndex,
      left: 0,
      top: 0,
      width: 0,
      height: 0,
      angle: 0,
      scaleX: 1,
      scaleY: 1,
    }
  }

  const geo = geometryForObject(obj)

  if (rec.kind === 'text' && obj instanceof Textbox) {
    return {
      kind: 'text',
      layer_id: rec.id,
      layer_name: rec.name,
      zIndex: rec.zIndex,
      ...geo,
      text: obj.text ?? '',
      fontSize: obj.fontSize ?? 32,
      fill: typeof obj.fill === 'string' ? obj.fill : '#f4f4f5',
      fontFamily: obj.fontFamily ?? 'sans-serif',
      fontWeight: obj.fontWeight ?? 'normal',
      fontStyle: obj.fontStyle ?? 'normal',
      textAlign: obj.textAlign ?? 'left',
    }
  }

  if (rec.kind === 'device' && obj instanceof Group) {
    return {
      kind: 'device',
      layer_id: rec.id,
      layer_name: rec.name,
      zIndex: rec.zIndex,
      ...geo,
      device_frame_style_id: rec.deviceFrameStyleId ?? '',
      device_frame_pack_id: rec.deviceFramePackId ?? '',
    }
  }

  return {
    kind: rec.kind,
    layer_id: rec.id,
    layer_name: rec.name,
    zIndex: rec.zIndex,
    ...geo,
  }
}
