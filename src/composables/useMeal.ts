/**
 * Reactive draft state for building a meal from a template (§7, §16).
 *
 * Holds no arithmetic of its own — scaling and summing come from totals.ts, so
 * the maths stays testable without Vue and reusable by the evaluation view.
 */
import { computed, ref, type Ref } from 'vue'

import type { NutrientMap, NutrientTotals } from '../data/nutrients'
import { findFoods } from '../food-lookup'
import { nutrientsFor, sumTotals } from '../totals'
import type { Food, LogItem, MealTemplate, NewLogEntry } from '../types'

/** One slot as the user is currently editing it. */
export interface DraftSlot {
  slotId: string
  label: string
  /** Food ids the user may pick from. Length 1 means fixed (§7). */
  options: string[]
  foodId: string
  grams: number
}

export interface MealDraft {
  slots: Ref<DraftSlot[]>
  foods: Ref<Map<string, Food>>
  /** False until the option foods have been resolved. */
  ready: Ref<boolean>
  /** Scaled nutrients per slot, index-aligned with `slots`. */
  slotNutrients: Ref<NutrientMap[]>
  totals: Ref<NutrientTotals>
  items: Ref<LogItem[]>
  load: () => Promise<void>
  reset: () => void
  toEntry: (timestamp?: number) => NewLogEntry
}

export function useMeal(template: MealTemplate): MealDraft {
  const initial = () =>
    template.slots.map((slot) => ({
      slotId: slot.id,
      label: slot.label,
      options: [...slot.options],
      foodId: slot.defaultOptionId,
      grams: slot.defaultGrams,
    }))

  const slots = ref<DraftSlot[]>(initial())
  const foods = ref(new Map<string, Food>())
  const ready = ref(false)

  async function load() {
    // Every option, not just the defaults: switching a dropdown must not wait
    // on a lookup.
    foods.value = await findFoods(template.slots.flatMap((slot) => slot.options))
    ready.value = true
  }

  function reset() {
    slots.value = initial()
  }

  const slotNutrients = computed<NutrientMap[]>(() =>
    slots.value.map((slot) => {
      const food = foods.value.get(slot.foodId)

      // An unresolved food contributes nothing rather than throwing. Before
      // `ready`, that is a loading state, not a data gap — which is why totals
      // below stay empty until then instead of reporting everything as missing.
      return food ? nutrientsFor(food, slot.grams) : {}
    }),
  )

  const totals = computed<NutrientTotals>(() => (ready.value ? sumTotals(slotNutrients.value) : {}))

  const items = computed<LogItem[]>(() =>
    slots.value.map((slot) => ({
      kind: 'food' as const,
      slotId: slot.slotId,
      foodId: slot.foodId,
      grams: slot.grams,
    })),
  )

  function toEntry(timestamp = Date.now()): NewLogEntry {
    return {
      templateId: template.id,
      name: template.name,
      timestamp,
      items: items.value,
      // Denormalized on purpose: the entry keeps the values as resolved now, and
      // later upstream changes must not rewrite it (§9).
      totals: totals.value,
    }
  }

  return { slots, foods, ready, slotNutrients, totals, items, load, reset, toEntry }
}
