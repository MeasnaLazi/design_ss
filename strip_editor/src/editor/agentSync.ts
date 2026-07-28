/**
 * Keeping the editor honest about what else is touching the strip.
 *
 * Two channels, deliberately separate:
 *
 * **The watcher** answers "has the file changed underneath me?" It is a fact
 * about the filesystem and needs no cooperation from whoever wrote the file —
 * an agent, a `git checkout`, a hand edit in an IDE all look the same and are
 * all handled the same.
 *
 * **The mode lock** answers "whose turn is it?" It is a convention, and only
 * works if the other party opts in. It exists so an agent turn and a human turn
 * are not interleaved on the same document, which no amount of file watching
 * can prevent.
 */
import { getMode, watchStrip } from '../lib/api'
import { isDirty, useHistoryStore } from '../store/useHistoryStore'
import { useEditorStore } from '../store/useEditorStore'

/** How often to ask who holds the document. */
const MODE_POLL_MS = 2000

/**
 * Watch the open strip. Returns an unsubscribe function.
 *
 * A change whose mtime the editor already holds is its own save echoing back —
 * every atomic write fires the watcher, and reloading on our own writes would
 * throw away the document a moment after saving it.
 */
export function subscribeToFile(path: string): () => void {
  useEditorStore.getState().setWatchState('connecting')

  return watchStrip(path, (event) => {
    const store = useEditorStore.getState()

    if (event.type === 'connected') {
      store.setWatchState('live')
      return
    }
    if (event.type === 'disconnected') {
      // EventSource reconnects on its own; say so rather than pretending the
      // absence of events means the file is unchanged.
      store.setWatchState('offline')
      return
    }
    if (event.type !== 'change') return
    if (event.mtime === store.mtime) return

    if (isDirty(useHistoryStore.getState())) {
      // Unsaved work: reloading would discard it, keeping it would clobber
      // whatever just landed. Neither is ours to choose.
      store.setExternalChange({ mtime: event.mtime })
      return
    }
    // Say what happened. A reload whose visible effect is subtle is otherwise
    // indistinguishable from a watcher that never fired.
    store.setNotice('Reloaded — the file changed on disk')
    store.reload()
  })
}

/**
 * Poll the mode endpoint while a document is open.
 *
 * Polling rather than another stream: mode changes are rare and a stale read of
 * up to two seconds is harmless, whereas a second SSE connection is another
 * thing to reconnect and reason about.
 */
export function subscribeToMode(): () => void {
  let stopped = false

  const tick = async (): Promise<void> => {
    try {
      const m = await getMode()
      if (stopped) return
      const store = useEditorStore.getState()
      if (m.mode !== store.mode || m.since !== store.modeSince) {
        store.setMode(m.mode, m.since, m.holder)
      }
    } catch {
      // Dev server restarting; assume the human keeps control rather than
      // locking the UI on a network blip.
      if (!stopped) useEditorStore.getState().setMode('human', null, null)
    }
  }

  void tick()
  const timer = setInterval(() => void tick(), MODE_POLL_MS)
  return () => {
    stopped = true
    clearInterval(timer)
  }
}

/** True when the editing surface should refuse input. */
export function isReadOnly(): boolean {
  return useEditorStore.getState().mode === 'agent'
}
