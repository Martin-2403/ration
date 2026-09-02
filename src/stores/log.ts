/**
 * The day's log (§16). Reads through Dexie's liveQuery, so a write anywhere —
 * including another tab — refreshes the view without a manual refetch.
 */
import { liveQuery, type Subscription } from 'dexie'
import { defineStore } from 'pinia'
import { computed, onScopeDispose, ref, watch } from 'vue'

import { addLocalDays, nextLocalMidnight, startOfLocalDay } from '../dates'
import { foods, log } from '../db'
import { findFood } from '../food-lookup'
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
   *
   * `timestamp` is when it was eaten, which is not always now: the log surface
   * can name an earlier day (§7, #61).
   */
  async function logFood(food: Food, grams: number, timestamp = Date.now()) {
    await foods.put(food)

    return log.add({
      name: food.name,
      timestamp,
      items: [{ kind: 'food', foodId: food.id, grams }],
      totals: sumTotals([nutrientsFor(food, grams)]),
    })
  }

  /** Writes an entry as given. Callers that changed items should use reviseEntry. */
  async function updateEntry(entry: StoredLogEntry) {
    await log.update(entry)
  }

  /**
   * A user edit (§7): re-resolve each item and re-snapshot totals, rather than
   * patching the stored numbers. Patching would let the totals drift out of
   * agreement with the items they claim to describe.
   *
   * Note this does pull in current food data. §9 forbids *upstream* changes from
   * rewriting history on their own, but an edit is the user asking for a rewrite
   * — so if a food has been corrected since, the revised entry reflects that.
   */
  async function reviseEntry(entry: StoredLogEntry) {
    const maps = await Promise.all(
      entry.items.map(async (item) => {
        // Supplements resolve per dose and arrive with §8; until then a
        // supplement item contributes nothing rather than guessing.
        if (item.kind !== 'food') return {}

        const food = await findFood(item.foodId)

        return food ? nutrientsFor(food, item.grams) : {}
      }),
    )

    await log.update({ ...entry, totals: sumTotals(maps) })
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
    reviseEntry,
    removeEntry,
  }
})
