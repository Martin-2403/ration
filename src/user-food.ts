/**
 * Building a Food from what someone typed (§7, manual food entry).
 *
 * A hand-entered food is an ordinary Food — no special case downstream. Its
 * values are tagged `source: 'user'`, which sits below packaging in the trust
 * hierarchy (§3) without being treated differently by the resolver, the totals
 * or the evaluation.
 */
import { NUTRIENTS, type NutrientKey, type NutrientMap } from './data/nutrients'
import type { Food } from './types'

export interface UserFoodInput {
  name: string
  /** Per-100g values, in each nutrient's canonical unit (§6). */
  per100g: Partial<Record<NutrientKey, number>>
}

export function buildUserFood(input: UserFoodInput, id: string = crypto.randomUUID()): Food {
  const per100g: NutrientMap = {}

  for (const key of Object.keys(NUTRIENTS) as NutrientKey[]) {
    const value = input.per100g[key]

    // A blank field is recorded as unknown rather than omitted, mirroring what
    // the resolver does with a nutrient it could not fill (§4, step 4). Both
    // behave the same when summed, but an explicit unknown says "asked, no
    // answer" instead of "never considered" — and it must never become a zero.
    per100g[key] =
      value === undefined || Number.isNaN(value)
        ? { value: 0, source: 'unknown' }
        : { value, source: 'user' }
  }

  return { id, name: input.name.trim(), per100g }
}
