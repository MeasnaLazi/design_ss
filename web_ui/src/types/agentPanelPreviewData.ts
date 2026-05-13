export const AGENT_PANEL_PREVIEW_DATA_VERSION = 1 as const

/** Panel-local layer; `panel_index` omitted — implied by parent `panels[].panel_index`. */
export type AgentPanelPreviewTextLayer = {
  layer_id: string
  kind: 'text'
  z_index: number
  content: string
  size: number
  color: string
  align: 'left' | 'center' | 'right'
  weight: string
  x: number
  y: number
  width: number
  height: number
}

export type AgentPanelPreviewDeviceLayer = {
  layer_id: string
  kind: 'device'
  z_index: number
  x: number
  y: number
  width: number
  height: number
  angle: number
  frame: string
  pack_id: string
}

export type AgentPanelPreviewLayer = AgentPanelPreviewTextLayer | AgentPanelPreviewDeviceLayer

export type AgentPanelPreviewPanelEntry = {
  panel_index: number
  panel_width: number
  panel_height: number
  /** Left edge of this panel’s export rect in workspace (document) coordinates. */
  panel_x: number
  /** Top edge of this panel’s export rect in workspace (document) coordinates. */
  panel_y: number
  layers: AgentPanelPreviewLayer[]
}

export type AgentPanelPreviewData = {
  version: typeof AGENT_PANEL_PREVIEW_DATA_VERSION
  revision: string
  capturedAt: string
  gap: number
  workspace_width: number
  workspace_height: number
  panels: AgentPanelPreviewPanelEntry[]
}
