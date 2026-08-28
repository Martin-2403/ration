/**
 * Reactive draft state for building a meal from a template (§7, §16).
 *
 * Holds no arithmetic of its own — scaling and summing come from totals.ts, so
 * the maths stays testable without Vue and reusable by the evaluation view.
 */
import { computed, ref, type Ref } from 'vue'

import type { NutrientMap, NutrientTotals } from '../data/nutrients'
import { findFoods } from '../food-lookup'
import { parseAmount, type ParsedAmount } from '../parse-amount'
import { nutrientsFor, sumTotals } from '../totals'
import type { Food, LogItem, MealTemplate, NewLogEntry } from '../types'

/** One slot as the user is currently editing it. */
export interface DraftSlot {
  slotId: string
  label: string
  /** Food ids the user may pick from. Length 1 means fixed (§7). */
  options: string[]
  foodId: string
  /**
   * What the user has typed, not a number: the field is a text input and we do
   * the parsing (see parse-amount.ts). Holding a number here would mean the
   * control decided what counts as one, which is how a decimal comma became a
   * blank field (§14). `amounts` below is the parsed view.
   */
  gramsInput: string
}

export interface MealDraft {
  slots: Ref<DraftSlot[]>
  foods: Ref<Map<string, Food>>
  /** False until the option foods have been resolved. */
  ready: Ref<boolean>
  /** Each slot's typed amount, parsed. Index-aligned with `slots`. */
  amounts: Ref<ParsedAmount[]>
  /** Slot labels whose amount is not a usable positive number. */
  unusable: Ref<string[]>
  /** True when the foods have loaded and every amount is a positive number. */
  canLog: Ref<boolean>
  /** Scaled nutrients per slot, index-aligned with `slots`. */
  slotNutrients: Ref<NutrientMap[]>
  totals: Ref<NutrientTotals>
  /** The draft as log items, or undefined while any amount is unusable. */
  items: Ref<LogItem[] | undefined>
  load: () => Promise<void>
  reset: () => void
  toEntry: (timestamp?: number) => NewLogEntry
}

/** An amount that can actually be logged: a number, and more than nothing. */
function usableAmount(parsed: ParsedAmount | undefined): number | undefined {
  return parsed?.kind === 'number' && parsed.value > 0 ? parsed.value : undefined
}

export function useMeal(template: MealTemplate): MealDraft {
  const initial = () =>
    template.slots.map((slot) => ({
      slotId: slot.id,
      label: slot.label,
      options: [...slot.options],
      foodId: slot.defaultOptionId,
      gramsInput: String(slot.defaultGrams),
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

  const amounts = computed<ParsedAmount[]>(() =>
    slots.value.map((slot) => parseAmount(slot.gramsInput)),
  )

  const unusable = computed(() =>
    slots.value
      .filter((_, index) => usableAmount(amounts.value[index]) === undefined)
      .map((slot) => slot.label),
  )

  const canLog = computed(() => ready.value && unusable.value.length === 0)

  const slotNutrients = computed<NutrientMap[]>(() =>
    slots.value.map((slot, index) => {
      const food = foods.value.get(slot.foodId)
      const grams = usableAmount(amounts.value[index])

      // An unresolved food or an amount that is not yet a number contributes
      // nothing rather than throwing or scaling by NaN. Before `ready`, that is a
      // loading state, not a data gap — which is why totals below stay empty
      // until then instead of reporting everything as missing.
      return food && grams !== undefined ? nutrientsFor(food, grams) : {}
    }),
  )

  const totals = computed<NutrientTotals>(() => (ready.value ? sumTotals(slotNutrients.value) : {}))

  const items = computed<LogItem[] | undefined>(() => {
    const grams = slots.value.map((_, index) => usableAmount(amounts.value[index]))

    // Undefined rather than substituting a zero for the slot in question: a zero
    // would be stored as an amount the user said they ate (§3).
    if (grams.some((value) => value === undefined)) return undefined

    return slots.value.map((slot, index) => ({
      kind: 'food' as const,
      slotId: slot.slotId,
      foodId: slot.foodId,
      grams: grams[index]!,
    }))
  })

  function toEntry(timestamp = Date.now()): NewLogEntry {
    const logItems = items.value

    // Callers gate on canLog — the log button is disabled otherwise. Throwing
    // beats logging a guessed amount if one ever slips through.
    if (!logItems) throw new Error('a slot has no usable amount')

    return {
      templateId: template.id,
      name: template.name,
      timestamp,
      items: logItems,
      // Denormalized on purpose: the entry keeps the values as resolved now, and
      // later upstream changes must not rewrite it (§9).
      totals: totals.value,
    }
  }

  return {
    slots,
    foods,
    ready,
    amounts,
    unusable,
    canLog,
    slotNutrients,
    totals,
    items,
    load,
    reset,
    toEntry,
  }
}
