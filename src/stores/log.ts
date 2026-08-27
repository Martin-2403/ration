/**
 * The day's log (§16). Reads through Dexie's liveQuery, so a write anywhere —
 * including another tab — refreshes the view without a manual refetch.
 */
import { liveQuery, type Subscription } from 'dexie'
import { defineStore } from 'pinia'
import { computed, onScopeDispose, ref, watch } from 'vue'

import { addLocalDays, nextLocalMidnight, startOfLocalDay } from '../dates'
import { foods, log } from '../db'
import { mergeTotals, nutrientsFor, sumTotals } from '../totals'
import type { Food, LogEntry, NewLogEntry, StoredLogEntry } from '../types'

export const useLogStore = defineStore('log', () => {
  /** Local midnight of the day being shown (§9). */
  const day = ref(startOfLocalDay())
  const entries = ref<LogEntry[]>([])
  const loading = ref(true)

  let subscription: Subscription | undefined

  // Resubscribe whenever the day changes: the query bounds are captured per
  // subscription, so a new day needs a new one.
  watch(
    day,
    (from) => {
      subscription?.unsubscribe()
      loading.value = true

      const to = nextLocalMidnight(from)
      subscription = liveQuery(() => log.between(from, to)).subscribe({
        next: (rows) => {
          entries.value = rows
          loading.value = false
        },
      })
    },
    { immediate: true },
  )

  onScopeDispose(() => subscription?.unsubscribe())

  /**
   * Totals for the day, merged from each entry's stored snapshot rather than
   * recomputed from the food cache — history must not shift under later
   * upstream data (§9).
   */
  const dayTotals = computed(() => mergeTotals(entries.value.map((entry) => entry.totals)))

  const isToday = computed(() => day.value === startOfLocalDay())

  function goToDay(at: number) {
    day.value = startOfLocalDay(at)
  }

  function shiftDay(days: number) {
    day.value = addLocalDays(day.value, days)
  }

  async function logMeal(entry: NewLogEntry) {
    return log.add(entry)
  }

  /**
   * Quick-log of a single food (§7): no template, one item, no slot. The food is
   * stored first — a log entry referencing an id that resolves to nothing would
   * leave history unreadable, and §13 relies on stored foods to pin what has
   * been logged.
   *
   * The same path takes a barcode-resolved food when that lands (#15).
   */
  async function logFood(food: Food, grams: number) {
    await foods.put(food)

    return log.add({
      name: food.name,
      timestamp: Date.now(),
      items: [{ kind: 'food', foodId: food.id, grams }],
      totals: sumTotals([nutrientsFor(food, grams)]),
    })
  }

  /** Re-snapshotting is the caller's job; the repository bumps updatedAt (§7). */
  async function updateEntry(entry: StoredLogEntry) {
    await log.update(entry)
  }

  async function removeEntry(id: number) {
    await log.remove(id)
  }

  return {
    day,
    entries,
    loading,
    dayTotals,
    isToday,
    goToDay,
    shiftDay,
    logMeal,
    logFood,
    updateEntry,
    removeEntry,
  }
})
