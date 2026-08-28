/**
 * Spec-as-test for the nutrient registry (§5).
 *
 * Per §19 the test comes first and the implementation follows, so this file
 * FAILS right now: `src/data/nutrients.ts` does not exist yet. That red state
 * is the intended starting point — building the registry turns it green.
 *
 * What each test demands of your implementation is spelled out in its own
 * comment. Nothing here checks *which* nutrients you track (that is config,
 * §5) — only that every entry obeys the contract the rest of the app relies on.
 *
 * ── Vitest anatomy, once ──────────────────────────────────────────────────
 *   describe(name, fn)   groups tests; affects output readability only
 *   it(claim, fn)        one test; phrase the string as a claim, so a failure
 *                        reads as a false statement about the code
 *   expect(x).toBe(y)          strict equality (===) — primitives
 *   expect(x).toEqual(y)       deep structural equality — objects, arrays
 *   expect(x).toContain(y)     membership in an array or string
 *   expect(x).toMatch(/re/)    string against a regex
 *   expect(x).toBeDefined()    not undefined
 *   it.each(rows)(...)         one test per row — a table-driven test
 *   it.todo(claim)             a placeholder that reports as todo, not failure
 *
 * The second argument to most matchers is an optional message shown on
 * failure. Worth using in loops, where "expected false to be true" alone
 * tells you nothing about *which* row broke.
 *
 * ── Running ───────────────────────────────────────────────────────────────
 *   npx vitest run              once, all tests
 *   npx vitest run nutrients    once, files matching "nutrients"
 *   npm run test:unit           watch mode — reruns on save
 */
import { describe, it, expect } from 'vitest'

import { isGoalNutrient, NUTRIENTS, USER_GOAL_NUTRIENTS } from '../nutrients'

// §6: one canonical unit per nutrient. This list *is* the contract — if a new
// unit is genuinely needed, it goes in §6 first, then here. Keeping it in the
// test rather than importing it from the registry is deliberate: a test that
// imports its own expectations from the code under test proves nothing.
const CANONICAL_UNITS = ['kcal', 'g', 'mg', 'µg']

/**
 * The shape this test needs to see. Declared locally, and applied with a cast
 * below, so the test does not depend on the registry exporting its own types —
 * that stays your choice. If you widen NutrientDef later, widen this too.
 */
interface NutrientShape {
  unit: string
  kind: string
  decimals: number
}

// Object-form cases rather than tuples: Vitest types these properly (tuple
// form degrades the callback args to `unknown`) and the title can interpolate
// a property with `$key`.
const cases = Object.entries(NUTRIENTS).map(([key, def]) => ({
  key,
  def: def as NutrientShape,
}))

describe('nutrient registry', () => {
  it('defines at least one nutrient', () => {
    expect(cases.length).toBeGreaterThan(0)
  })

  // §6 is explicit: energy is canonically kcal, and kJ is converted on the way
  // in (÷ 4.184). If this ever reads kJ, every stored total is wrong by 4.184x.
  it('stores energy in kcal, never kJ', () => {
    const energy = cases.find((c) => c.key === 'energy')

    expect(energy, 'the registry must define an "energy" nutrient').toBeDefined()
    expect(energy?.def.unit).toBe('kcal')
  })

  // §5 and §14: ids are language-neutral and labels come from i18n keyed on
  // the id. A `label` or `name` field here would make the registry the source
  // of display strings, which is exactly what §14 forbids.
  it('keeps display labels out of the registry', () => {
    for (const { key, def } of cases) {
      const fields = Object.keys(def)

      expect(fields, `${key} must not carry a display label`).not.toContain('label')
      expect(fields, `${key} must not carry a display name`).not.toContain('name')
    }
  })

  // it.each turns one assertion into one test per nutrient, so a failure names
  // the offender instead of just the first one it hit.
  it.each(cases)('$key declares a unit, a kind and a display precision', ({ key, def }) => {
    expect(CANONICAL_UNITS, `${key} has a non-canonical unit: ${def.unit}`).toContain(def.unit)
    expect(['macro', 'micro'], `${key} has an unexpected kind: ${def.kind}`).toContain(def.kind)

    // Precision drives rendering (§15's dense number columns). A fractional or
    // negative value would be meaningless to toFixed().
    expect(Number.isInteger(def.decimals), `${key}.decimals must be an integer`).toBe(true)
    expect(def.decimals).toBeGreaterThanOrEqual(0)
  })

  // Ids end up in stored records and in i18n keys, so they need to be stable
  // and boring: lowercase first letter, then letters and digits only. No
  // spaces, no punctuation, nothing locale-specific.
  it.each(cases)('$key is a stable, language-neutral id', ({ key }) => {
    expect(key).toMatch(/^[a-z][a-zA-Z0-9]*$/)
  })

  // The keys were the registry's call to make; these are the ones it picked,
  // singular and matching Regulation 1169/2011 Annex XIII so the NRV figures
  // (#16) land on them without a mapping. Asserted here because they are now
  // stored in goal rows and in every logged total — renaming one is a migration,
  // not a refactor.
  it.each(['energy', 'protein', 'carbohydrate', 'fat'])('includes %s as a macro', (key) => {
    const found = cases.find((c) => c.key === key)

    expect(found, `the registry must define "${key}"`).toBeDefined()
    expect(found?.def.kind).toBe('macro')
  })
})

/**
 * §20's manual goals: the user may set their own target for some nutrients and
 * not others. The list is a safety boundary, so it gets asserted rather than
 * trusted — the failure mode is a micronutrient quietly becoming self-settable.
 */
describe('user-settable goals', () => {
  it('only lists nutrients the registry defines', () => {
    for (const key of USER_GOAL_NUTRIENTS) {
      expect(NUTRIENTS, `${key} is not in the registry`).toHaveProperty(key)
    }
  })

  it('excludes every micronutrient', () => {
    for (const key of USER_GOAL_NUTRIENTS) {
      // A self-chosen macro target is a diet question. A self-chosen
      // micronutrient target is a dosing one, which §5 keeps out of the app.
      expect(NUTRIENTS[key].kind, `${key} is a micronutrient`).toBe('macro')
    }
  })

  it('accepts a goal nutrient and rejects anything else', () => {
    expect(isGoalNutrient('energy')).toBe(true)
    expect(isGoalNutrient('vitaminD')).toBe(false)
  })
})
