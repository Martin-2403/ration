/**
 * Placeholder for the i18n layer (#13, §14).
 *
 * §5 keeps display labels out of the registry on purpose: nutrient ids are
 * language-neutral and labels are a localized lookup. That lookup is meant to be
 * i18n, which is not scoped yet — so this file stands in for it, deliberately
 * named by locale so replacing it is a straight swap rather than a refactor.
 *
 * Do not import this from anywhere except display code.
 */
import type { NutrientKey } from './nutrients'

export const NUTRIENT_LABELS: Record<NutrientKey, string> = {
  energy: 'Energy',
  protein: 'Protein',
  carbohydrate: 'Carbohydrate',
  fat: 'Fat',
  vitaminD: 'Vitamin D',
}
