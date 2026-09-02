/**
 * The log over a rolling window (§9). Reactive data only — the arithmetic lives
 * in evaluation.ts, and the coverage figure is computed there too.
 *
 * Separate from the log store on purpose: that store is scoped to a single day
 * and drives Today, while this reads a trailing range. Bolting a second
 * subscription onto it would give one store two unrelated notions of "when".
 */
import { liveQuery, type Subscription } from 'dexie'
import { computed, onScopeDispose, ref, watch, type Ref } from 'vue'

import { log } from '../db'
import { daysLogged, trailingWindow, type Coverage, type DayWindow } from '../evaluation'
import type { LogEntry } from '../types'

export interface LogWindow {
  /** Window length in days. Writable: the view switches between 7 and 30. */
  days: Ref<number>
  window: Ref<DayWindow>
  entries: Ref<LogEntry[]>
  loading: Ref<boolean>
  /** Days in the window holding at least one entry — §9's denominator. */
  coverage: Ref<Coverage>
}

export function useWindow(initialDays = 7): LogWindow {
  const days = ref(initialDays)

  // Recomputed when the length changes, not on a timer: a window that silently
  // slid forward under the numbers already on screen would be worse than one
  // that is a few hours stale. Same trade the day store makes.
  const window = computed(() => trailingWindow(days.value))

  const entries = ref<LogEntry[]>([])
  const loading = ref(true)

  let subscription: Subscription | undefined

  // Resubscribe whenever the window changes: the query bounds are captured per
  // subscription, so a new range needs a new one.
  watch(
    window,
    (range) => {
      subscription?.unsubscribe()
      loading.value = true

      subscription = liveQuery(() => log.between(range.from, range.to)).subscribe({
        next: (rows) => {
          entries.value = rows
          loading.value = false
        },
      })
    },
    { immediate: true },
  )

  onScopeDispose(() => subscription?.unsubscribe())

  const coverage = computed(() => daysLogged(entries.value, window.value))

  return { days, window, entries, loading, coverage }
}
