import type {
  NutrientKey,
  NutrientMap,
  NutrientTotal,
  NutrientTotals,
  Source,
} from './data/nutrients'

/**
 * Scales nutrients for an entity by the given quantity.
 * For foods, quantity is in grams and scaled by quantity / 100.
 * For supplements, quantity is in doses and scaled by quantity (1:1).
 */
export function nutrientsFor(
  // Required, not optional: a Food always carries per100g and a Supplement
  // always carries perDose (§7, §8). Optional properties would also defeat the
  // `in` narrowing below, since the negative branch could still be a Food.
  entity: { per100g: NutrientMap } | { perDose: NutrientMap },
  quantity: number,
): NutrientMap {
  let nutrients: NutrientMap
  let scale: number

  if ('per100g' in entity) {
    nutrients = entity.per100g
    scale = quantity / 100
  } else {
    nutrients = entity.perDose
    scale = quantity
  }

  const result: NutrientMap = {}

  for (const key in nutrients) {
    const nutrientKey = key as NutrientKey
    const nutrient = nutrients[nutrientKey]

    if (nutrient) {
      // An unknown value is an absence, not a number, so it passes through
      // untouched. Scaling it would produce something that reads as real data
      // to any caller that looks at `value` without checking `source`.
      result[nutrientKey] =
        nutrient.source === 'unknown'
          ? { ...nutrient }
          : { ...nutrient, value: nutrient.value * scale }
    }
  }

  return result
}

/**
 * Sums multiple nutrient maps into totals with amount, bySource breakdown, and missing count.
 * 'unknown' source values are counted as missing rather than summed.
 */
export function sumTotals(maps: NutrientMap[]): NutrientTotals {
  const totals: NutrientTotals = {}

  if (maps.length === 0) {
    return totals
  }

  // Collect all nutrient keys across all maps
  const allKeys = new Set<NutrientKey>()
  for (const map of maps) {
    for (const key in map) {
      allKeys.add(key as NutrientKey)
    }
  }

  // Process each nutrient
  for (const key of allKeys) {
    let amount = 0
    let missing = 0
    const bySource: Partial<Record<Source, number>> = {}

    for (const map of maps) {
      const value = map[key]

      if (!value || value.source === 'unknown') {
        // No data or unknown source — count as missing
        missing++
      } else {
        // Add to amount and track by source
        amount += value.value
        const current = bySource[value.source] ?? 0
        bySource[value.source] = current + value.value
      }
    }

    totals[key] = {
      amount,
      bySource,
      missing,
    }
  }

  return totals
}

/**
 * Combines already-summed totals — a day or a window built from several log
 * entries (§7, §9). Distinct from sumTotals, which starts from NutrientMaps:
 * once an entry is stored its totals are snapshots and must be added as they
 * are, never recomputed from the food cache (§9).
 *
 * `missing` counts contributors that had no usable value for a nutrient. An
 * entry that never mentions a nutrient at all adds nothing to that count —
 * its totals carry no evidence either way, so inventing missing contributors
 * from it would overstate the gap.
 */
export function mergeTotals(entries: NutrientTotals[]): NutrientTotals {
  const merged: NutrientTotals = {}

  for (const entry of entries) {
    for (const [key, total] of Object.entries(entry) as [NutrientKey, NutrientTotal][]) {
      const running = (merged[key] ??= { amount: 0, bySource: {}, missing: 0 })

      running.amount += total.amount
      running.missing += total.missing

      for (const [source, amount] of Object.entries(total.bySource) as [Source, number][]) {
        running.bySource[source] = (running.bySource[source] ?? 0) + amount
      }
    }
  }

  return merged
}
