/**
 * Structural operations as the UI invokes them: run the DOM change, re-index so
 * the tree and selection stay coherent, and surface any device-build failure.
 *
 * Re-indexing is what makes stable ids matter. After an insert or a delete the
 * positional ids would shift, but `indexStrip` reuses the id each element
 * already carries, so pending edits keyed by id keep pointing at the same block.
 */
import { deviceForStripPath, packForTarget } from './devices'
import { docRectOf } from './blockRegistry'
import { listDevicePacks } from '../lib/api'
import { duplicateBlock, insertBlock, removeBlock, reorderBlock } from './structure'
import { getStageIframe, getStageScroller } from './stageRef'
import { reindexLive } from './reindex'
import { useEditorStore } from '../store/useEditorStore'
import type { InsertSpec } from './schema'
import type { ZMove } from './structure'

function report(error?: string): void {
  if (error) useEditorStore.getState().setSaveError(error)
}

/**
 * Scroll a block into view.
 *
 * New blocks go into the *selected* block's panel, which is not necessarily the
 * panel on screen — with nothing selected they land in panel 0. Adding a block
 * that appears somewhere you are not looking reads exactly like adding a block
 * that did not appear at all, so the view always follows what was just created.
 */
function reveal(nodeId: string): void {
  const iframe = getStageIframe()
  const scroller = getStageScroller()
  if (!iframe || !scroller) return
  const rect = docRectOf(iframe, nodeId)
  if (!rect) return

  const { zoom } = useEditorStore.getState()
  // The iframe sits inside a padded wrapper; measuring it directly avoids
  // having to know the padding here.
  const frameBox = iframe.getBoundingClientRect()
  const scrollBox = scroller.getBoundingClientRect()
  const offsetX = frameBox.left - scrollBox.left + scroller.scrollLeft
  const offsetY = frameBox.top - scrollBox.top + scroller.scrollTop

  scroller.scrollTo({
    left: offsetX + rect.left * zoom - scroller.clientWidth / 2 + (rect.width * zoom) / 2,
    top: offsetY + rect.top * zoom - scroller.clientHeight / 2 + (rect.height * zoom) / 2,
    behavior: 'smooth',
  })
}

/** The panel to act on: the selection's panel, or the first one. */
export function targetPanelId(): string | null {
  const { selectedId, nodes } = useEditorStore.getState()
  const selected = nodes.find((n) => n.id === selectedId)
  if (selected) return `panel:${selected.panelIndex}`
  const firstPanel = nodes.find((n) => n.kind === 'panel')
  return firstPanel?.id ?? null
}

/**
 * The pack a device block inserted into *this* strip should start on.
 *
 * Asked at insert time rather than baked into the template, because the answer
 * depends on which strip is open: an iPad strip wants an iPad mockup, and a
 * hard-coded `iphone_12_pro` was right only while that was the only pack.
 */
async function packForThisStrip(): Promise<string | undefined> {
  const { filePath } = useEditorStore.getState()
  const target = filePath ? deviceForStripPath(filePath) : null
  if (!target) return undefined
  try {
    return packForTarget(await listDevicePacks(), target.folder) ?? undefined
  } catch {
    return undefined // catalogue unreachable; the template's own default stands
  }
}

export async function addBlock(kind: InsertSpec['kind'], role?: InsertSpec['role']): Promise<void> {
  const panelId = targetPanelId()
  if (!panelId) return
  const pack = kind === 'device' ? await packForThisStrip() : undefined
  const { nodeId, error } = await insertBlock(panelId, kind, { role, pack })
  reindexLive()
  if (nodeId) {
    useEditorStore.getState().select(nodeId)
    reveal(nodeId)
  }
  report(error)
}

export function deleteSelection(): void {
  const { selectedId, nodes } = useEditorStore.getState()
  const node = nodes.find((n) => n.id === selectedId)
  // Panels are structural to the export preset, not content — never deletable.
  if (!node || node.kind === 'panel') return
  const { error } = removeBlock(node.id)
  reindexLive()
  useEditorStore.getState().select(null)
  report(error)
}

export async function duplicateSelection(): Promise<void> {
  const { selectedId, nodes } = useEditorStore.getState()
  const node = nodes.find((n) => n.id === selectedId)
  if (!node || node.kind === 'panel') return
  const { nodeId, error } = await duplicateBlock(node.id)
  reindexLive()
  if (nodeId) {
    useEditorStore.getState().select(nodeId)
    reveal(nodeId)
  }
  report(error)
}

export function moveSelection(move: ZMove): void {
  const { selectedId, nodes } = useEditorStore.getState()
  const node = nodes.find((n) => n.id === selectedId)
  if (!node || node.kind === 'panel') return
  const { error } = reorderBlock(node.id, move)
  reindexLive()
  useEditorStore.getState().select(node.id)
  report(error)
}
