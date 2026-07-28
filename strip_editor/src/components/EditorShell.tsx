import { useEffect, useState } from 'react'

import { Inspector } from './Inspector'
import { LayerTree } from './LayerTree'
import { ModeBanner } from './ModeBanner'
import { SaveBanner } from './SaveBanner'
import { ShortcutsOverlay } from './ShortcutsOverlay'
import { subscribeToFile, subscribeToMode } from '../editor/agentSync'
import { useEditorStore } from '../store/useEditorStore'
import { StripStage } from './StripStage'
import { TopBar } from './TopBar'

/**
 * Editing layout: layer tree left, canvas centre, inspector right.
 * Close the strip (TopBar ×) to return to the file picker.
 */
export function EditorShell(): React.ReactElement {
  const filePath = useEditorStore((s) => s.filePath)
  const [showShortcuts, setShowShortcuts] = useState(false)

  // `?` opens the keyboard map, unless something is being typed into.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== '?' || e.metaKey || e.ctrlKey) return
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      if (useEditorStore.getState().editingId) return
      e.preventDefault()
      setShowShortcuts((v) => !v)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Watch the open file and track who holds the document. Both are torn down
  // when the strip closes so a stale stream cannot reload the wrong document.
  useEffect(() => {
    if (!filePath) return
    const stopWatching = subscribeToFile(filePath)
    const stopPolling = subscribeToMode()
    return () => {
      stopWatching()
      stopPolling()
    }
  }, [filePath])

  return (
    <div className="relative flex h-full flex-col">
      <ShortcutsOverlay open={showShortcuts} onClose={() => setShowShortcuts(false)} />
      <TopBar onShowShortcuts={() => setShowShortcuts(true)} />
      <ModeBanner />
      <SaveBanner />
      <div className="flex min-h-0 flex-1">
        <aside className="w-60 shrink-0 border-r border-zinc-800 bg-zinc-950">
          <LayerTree />
        </aside>
        <main className="min-w-0 flex-1">
          <StripStage />
        </main>
        <aside className="w-72 shrink-0 border-l border-zinc-800 bg-zinc-950">
          <Inspector />
        </aside>
      </div>
    </div>
  )
}
