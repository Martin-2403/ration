/**
 * Seed foods and meal templates (§13, §16).
 *
 * ─── These are illustrative fixtures, NOT sourced nutrition data. ───
 *
 * Every value is tagged `source: 'user'`, which is the truth: nobody looked
 * them up in a reference table. They exist so the app has something to log on a
 * fresh install and so the meal builder has slots to fill. Real values arrive
 * per-food via barcode resolution (§4) or from a sourced generic-food table once
 * that licence question is settled (#19).
 *
 * Do not promote any of these to 'off-packaging' or 'usda-generic' without an
 * actual source — there is a test that enforces it.
 *
 * These stay in the module and are never copied into IndexedDB (§13): storing
 * them would make them evictable by the LRU, and a corrected value here would
 * never reach an install that had already copied the old one.
 *
 * Only registry nutrients can appear (§5), and a nutrient no seed carries simply
 * does not appear in a total — carbohydrate and fat are in the registry now, and
 * stay absent here because nobody looked those up either. The set grows with the
 * registry, not with this file.
 */
import type { Food, MealTemplate } from '../types'

export const SEED_FOODS: Food[] = [
  {
    id: 'oats',
    name: 'Rolled oats',
    per100g: {
      energy: { value: 370, source: 'user' },
      protein: { value: 13, source: 'user' },
      // Not "zero vitamin D" — nobody has data for it. §3: unknown, never 0.
      vitaminD: { value: 0, source: 'unknown' },
    },
  },
  {
    id: 'milk',
    name: 'Milk, 3.5%',
    per100g: {
      energy: { value: 65, source: 'user' },
      protein: { value: 3.4, source: 'user' },
      vitaminD: { value: 0, source: 'unknown' },
    },
  },
  {
    id: 'plant-drink-fortified',
    name: 'Oat drink, fortified',
    per100g: {
      energy: { value: 45, source: 'user' },
      protein: { value: 1, source: 'user' },
      // The one seed with a vitamin D figure, so the evaluation has a mix of
      // known and missing values to render (§9).
      vitaminD: { value: 1.5, source: 'user' },
    },
  },
  {
    id: 'banana',
    name: 'Banana',
    per100g: {
      energy: { value: 90, source: 'user' },
      protein: { value: 1.1, source: 'user' },
      vitaminD: { value: 0, source: 'unknown' },
    },
  },
  {
    id: 'blueberries',
    name: 'Blueberries',
    per100g: {
      energy: { value: 55, source: 'user' },
      protein: { value: 0.7, source: 'user' },
      vitaminD: { value: 0, source: 'unknown' },
    },
  },
]

const BY_ID = new Map(SEED_FOODS.map((food) => [food.id, food]))

/**
 * First half of the two-path food lookup (§13): seeds here, everything else in
 * the store. Callers check this before hitting Dexie.
 */
export function seedFood(id: string): Food | undefined {
  return BY_ID.get(id)
}

export const SEED_TEMPLATES: MealTemplate[] = [
  {
    id: 'porridge',
    name: 'Porridge',
    // §7's worked example: a fixed base, a swappable liquid, a swappable fruit.
    slots: [
      {
        id: 'base',
        label: 'Base',
        kind: 'fixed',
        options: ['oats'],
        defaultOptionId: 'oats',
        defaultGrams: 50,
      },
      {
        id: 'liquid',
        label: 'Liquid',
        kind: 'variable',
        options: ['milk', 'plant-drink-fortified'],
        defaultOptionId: 'milk',
        defaultGrams: 200,
      },
      {
        id: 'fruit',
        label: 'Fruit',
        kind: 'variable',
        options: ['banana', 'blueberries'],
        defaultOptionId: 'banana',
        defaultGrams: 80,
      },
    ],
  },
]
