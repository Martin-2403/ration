/**
 * Lets a native back gesture step back through an in-page flow (#119).
 *
 * LogView's `choice` changes without touching history, so an edge-swipe (which
 * is just `history.back()`) skips every step and leaves the route. Rather than
 * put the steps in the URL, each step deeper pushes a bookkeeping entry with the
 * same URL, and a back that lands on one is turned into the view's own `goBack`.
 *
 * `depth` is how many such entries should be stacked above the route's own. The
 * stack is kept equal to it from both sides: a forward step pushes, and anything
 * that lowers it (the Back button, `finish()`, a cancel, a multi-level jump) is
 * paid for with one `history.go(-n)`, so button and gesture cannot desync.
 */
import { onBeforeUnmount, onMounted, watch } from 'vue'

/**
 * Carries the entry's height in `history.state`. The state is spread rather than
 * replaced: vue-router keeps its position and scroll in there and reads it back.
 */
const KEY = 'rationStep'

const stepOf = (state: unknown): number => {
  const step = (state as Record<string, unknown> | null)?.[KEY]

  return typeof step === 'number' ? step : 0
}

export function useStepHistory(depth: () => number, onBack: () => void) {
  /** Entries this view believes sit above its own route entry. */
  let stacked = 0
  /** A `history.go` is in flight; its popstate is ours and must not be read as a gesture. */
  let rewinding = false

  function rewind(by: number) {
    rewinding = true
    history.go(-by)
  }

  function reconcile() {
    // Pushing while a rewind is unresolved would land the new entry in the
    // wrong place; the popstate handler calls back in once it settles.
    if (rewinding) return

    const target = depth()

    if (target < stacked) {
      const by = stacked - target
      stacked = target
      rewind(by)
      return
    }

    while (stacked < target) {
      stacked++
      history.pushState({ ...history.state, [KEY]: stacked }, '')
    }
  }

  function onPopState(event: PopStateEvent) {
    if (rewinding) {
      rewinding = false
      reconcile()
      return
    }

    const step = stepOf(event.state)

    if (step > stacked) {
      // Forward (or a stale entry) onto a step this view is not showing: there
      // is nothing to restore it to, so undo it rather than show the wrong step.
      rewind(step - stacked)
      return
    }

    if (step < stacked) {
      // A gesture or browser back consumed one entry. Do what the button does.
      stacked = step
      onBack()
      reconcile()
    }
    // step === stacked === 0: the route itself is being left, nothing to do.
  }

  onMounted(() => {
    window.addEventListener('popstate', onPopState)

    // Arriving on an entry left behind by an earlier visit (back from another
    // tab, or a reload mid-flow). That visit's steps are gone, so drop the
    // leftovers and sit on the route's own entry.
    const leftover = stepOf(history.state)
    if (leftover > 0) rewind(leftover)
  })

  onBeforeUnmount(() => window.removeEventListener('popstate', onPopState))

  watch(depth, reconcile)
}
