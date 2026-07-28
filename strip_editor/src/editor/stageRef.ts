/**
 * Module-level handle on the editing iframe.
 *
 * The iframe is a singleton for the app's lifetime, and several panels
 * (inspector, layer tree) need to measure through it without threading a React
 * ref down the tree. `StripStage` owns registration; everything else reads.
 * Always null-check: it is unset before first mount and between documents.
 */
let iframe: HTMLIFrameElement | null = null
let scroller: HTMLElement | null = null

export function setStageIframe(el: HTMLIFrameElement | null): void {
  iframe = el
}

export function getStageIframe(): HTMLIFrameElement | null {
  return iframe
}

/** The scroll container the scaled strip sits in, for bringing blocks into view. */
export function setStageScroller(el: HTMLElement | null): void {
  scroller = el
}

export function getStageScroller(): HTMLElement | null {
  return scroller
}
