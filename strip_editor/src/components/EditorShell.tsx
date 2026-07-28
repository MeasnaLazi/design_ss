import { Inspector } from './Inspector'
import { LayerTree } from './LayerTree'
import { SaveBanner } from './SaveBanner'
import { StripStage } from './StripStage'
import { TopBar } from './TopBar'

/**
 * Editing layout: layer tree left, canvas centre, inspector right.
 * Close the strip (TopBar ×) to return to the file picker.
 */
export function EditorShell(): React.ReactElement {
  return (
    <div className="flex h-full flex-col">
      <TopBar />
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
