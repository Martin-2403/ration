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
    //
    // The check is `Number.isFinite`, not `!Number.isNaN`: an unparseable number
    // input yields the empty string, and `Number.isNaN('')` is false, so a
    // looser guard would store a string where a number belongs and turn every
    // downstream total into NaN. Callers validate too, but this is the boundary
    // that must not let a non-number through.
    per100g[key] =
      typeof value === 'number' && Number.isFinite(value)
        ? { value, source: 'user' }
        : { value: 0, source: 'unknown' }
  }

  return { id, name: input.name.trim(), per100g }
}

/** What a surface collected for a revision: a name and the values it holds. */
export interface FoodRevision {
  name: string
  /**
   * The nutrients this surface actually offered a field for.
   *
   * Load-bearing, not bookkeeping. The manual form shows the seven a label
   * declares (#56), so revising a barcode-resolved food through it would
   * otherwise erase the twenty-seven micronutrients it never asked about —
   * §3's difference between "asked, no answer" and "never considered", and the
   * distinction #80 anticipated becoming load-bearing.
   */
  asked: readonly NutrientKey[]
  /** Per-100g values, in each nutrient's canonical unit (§6). Absent = blank. */
  per100g: Partial<Record<NutrientKey, number>>
}

/**
 * A food built from an existing one (#51).
 *
 * Used for both halves of that issue, and the only difference between them is
 * the id: pass a new one to clone, pass the original's to correct it in place.
 * Correcting is safe despite appearances — log entries snapshot their totals
 * (§9), so it changes what future logs resolve to and never rewrites history.
 *
 * **A value the user did not touch keeps its original source; a value they
 * changed becomes `'user'`.** Copying `off-packaging` onto an edited figure
 * would claim a label was read for a number nobody looked at, which is the
 * false confidence §3 exists to prevent. Retagging the whole food would be
 * safer still, but it throws away real provenance for the figures that
 * genuinely carry over — a clone of a well-sourced yoghurt at a different fat
 * percentage has one changed number and a dozen that are still label-derived.
 */
export function reviseFood(
  original: Food,
  input: FoodRevision,
  id: string = original.id,
): Food {
  // Starts from what the original recorded, so a nutrient outside `asked`
  // carries over untouched rather than being dropped or blanked.
  const per100g: NutrientMap = { ...original.per100g }

  for (const key of input.asked) {
    const value = input.per100g[key]
    const before = original.per100g[key]

    if (typeof value !== 'number' || !Number.isFinite(value)) {
      // Cleared, or never filled. Recorded as unknown rather than omitted, and
      // never as zero — the same boundary buildUserFood guards (§3).
      per100g[key] = { value: 0, source: 'unknown' }
      continue
    }

    // `source !== 'unknown'` is load-bearing: an unknown value is stored as 0,
    // so without it, typing a real 0 over an unknown would inherit `unknown`
    // and a measured zero would be recorded as no data at all.
    const unchanged = before !== undefined && before.source !== 'unknown' && before.value === value

    per100g[key] = unchanged ? { ...before } : { value, source: 'user' }
  }

  return { ...original, id, name: input.name.trim(), per100g }
}
