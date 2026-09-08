/**
 * English UI strings (§14, #13).
 *
 * `nutrient` is the lookup §5 keeps out of the registry on purpose: ids are
 * language-neutral, labels are localized. The `satisfies` makes that a compile
 * error rather than a missing string — adding a nutrient to the registry without
 * naming it here fails type-check.
 */
import type { NutrientKey } from '../data/nutrients'

export const en = {
  nutrient: {
    energy: 'Energy',
    protein: 'Protein',
    carbohydrate: 'Carbohydrate',
    fat: 'Fat',
    vitaminD: 'Vitamin D',
  } satisfies Record<NutrientKey, string>,
}

/** The shape every other locale has to match, and what types `t()`'s keys. */
export type MessageSchema = typeof en
