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
    // Sentence case, and the regulation's own wording for the nutrients it
    // names (Annex XIII, #56) — "Saturates" rather than "Saturated fat",
    // "Folic acid" rather than "Folate".
    energy: 'Energy',
    fat: 'Fat',
    saturates: 'Saturates',
    carbohydrate: 'Carbohydrate',
    sugars: 'Sugars',
    protein: 'Protein',
    salt: 'Salt',
    vitaminA: 'Vitamin A',
    vitaminD: 'Vitamin D',
    vitaminE: 'Vitamin E',
    vitaminK: 'Vitamin K',
    vitaminC: 'Vitamin C',
    thiamin: 'Thiamin',
    riboflavin: 'Riboflavin',
    niacin: 'Niacin',
    vitaminB6: 'Vitamin B6',
    folicAcid: 'Folic acid',
    vitaminB12: 'Vitamin B12',
    biotin: 'Biotin',
    pantothenicAcid: 'Pantothenic acid',
    potassium: 'Potassium',
    chloride: 'Chloride',
    calcium: 'Calcium',
    phosphorus: 'Phosphorus',
    magnesium: 'Magnesium',
    iron: 'Iron',
    zinc: 'Zinc',
    copper: 'Copper',
    manganese: 'Manganese',
    fluoride: 'Fluoride',
    selenium: 'Selenium',
    chromium: 'Chromium',
    molybdenum: 'Molybdenum',
    iodine: 'Iodine',
  } satisfies Record<NutrientKey, string>,
}

/** The shape every other locale has to match, and what types `t()`'s keys. */
export type MessageSchema = typeof en
