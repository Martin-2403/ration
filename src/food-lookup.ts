/**
 * §13's two-path food lookup. Seeds ship in the module and are deliberately
 * never stored, so a food id can live in either place.
 *
 * Seeds are checked first: they travel with the app version, so a corrected
 * value in a release should win rather than be shadowed by anything cached.
 */
import { SEED_FOODS, seedFood } from './data/foods'
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

/**
 * A food found by name, with which of §13's two paths it came from.
 *
 * The path is the only honest way to tell a shipped food from one the user
 * entered: provenance in this app lives per nutrient *value* (§3), and the
 * seeds tag their own values `user` too, so there is nothing in a Food to
 * separate them. Richer provenance in results waits for the resolver, which is
 * when a food can genuinely have come from somewhere else (§4).
 */
export interface FoodMatch {
  food: Food
  origin: 'seed' | 'stored'
}

/**
 * Diacritic- and case-insensitive, because §14 puts this app in Germany: a
 * search for "musli" has to find "Müsli", and nobody types the umlaut when they
 * are looking for something.
 */
function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
}

/**
 * Foods whose name matches `query`, seeds and stored foods together (#40).
 *
 * An empty query lists what there is rather than nothing: the picker opens on
 * something usable, and with a handful of foods that is the whole answer.
 *
 * Ordering puts a name that *starts* with the query above one that merely
 * contains it — typing "oat" should reach "Oat drink" before "Rolled oats" —
 * then falls back to alphabetical so the list is stable rather than dependent
 * on insertion order.
 */
export async function searchFoods(query: string, limit = 20): Promise<FoodMatch[]> {
  const stored = await foods.all()

  // Seeds first, and a stored food with a seed's id is dropped: the same
  // precedence findFood applies, so the picker cannot offer a shadowed copy of
  // a food that a release has since corrected (§13).
  const seen = new Set(SEED_FOODS.map((food) => food.id))
  const all: FoodMatch[] = [
    ...SEED_FOODS.map((food) => ({ food, origin: 'seed' as const })),
    ...stored
      .filter((food) => !seen.has(food.id))
      .map((food) => ({ food, origin: 'stored' as const })),
  ]

  const needle = normalize(query.trim())
  const scored = all
    .map((match) => ({ match, at: normalize(match.food.name).indexOf(needle) }))
    .filter((entry) => needle.length === 0 || entry.at >= 0)

  scored.sort((a, b) => {
    // A prefix match ranks above a match in the middle of a name.
    const prefix = Number(a.at !== 0) - Number(b.at !== 0)
    if (prefix !== 0) return prefix

    return a.match.food.name.localeCompare(b.match.food.name)
  })

  return scored.slice(0, limit).map((entry) => entry.match)
}
