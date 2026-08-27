/**
 * §13's two-path food lookup. Seeds ship in the module and are deliberately
 * never stored, so a food id can live in either place.
 *
 * Seeds are checked first: they travel with the app version, so a corrected
 * value in a release should win rather than be shadowed by anything cached.
 */
import { seedFood } from './data/foods'
import { foods } from './db'
import type { Food } from './types'

export async function findFood(id: string): Promise<Food | undefined> {
  return seedFood(id) ?? (await foods.get(id))
}

/** Resolves several ids at once, skipping any that don't exist. */
export async function findFoods(ids: Iterable<string>): Promise<Map<string, Food>> {
  const unique = [...new Set(ids)]
  const found = await Promise.all(unique.map(async (id) => [id, await findFood(id)] as const))

  return new Map(found.filter((pair): pair is [string, Food] => pair[1] !== undefined))
}
