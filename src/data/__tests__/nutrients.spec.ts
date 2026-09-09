/**
 * Spec-as-test for the nutrient registry (§5).
 *
 * Written before the registry existed, per §19's order, and kept as the
 * registry's contract since. Most of it deliberately checks the *shape* of every
 * entry rather than which nutrients are tracked; the Annex XIII block at the
 * bottom is the exception, added with #56 once the tracked set stopped being a
 * judgement call and became a transcription.
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

import {
  DECLARATION_NUTRIENTS,
  isGoalNutrient,
  NUTRIENTS,
  USER_GOAL_NUTRIENTS,
} from '../nutrients'

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

})

/**
 * The tracked set is Annex XIII of Regulation (EU) No 1169/2011 (#56), so it can
 * be asserted against the regulation rather than against itself.
 *
 * The unit column is the point. The annex prints a unit beside every nutrient,
 * and mg where the regulation says µg is a thousandfold error that renders as a
 * perfectly plausible number — exactly the failure §17 says tests exist to catch.
 * Transcribed from OJ L 304, 22.11.2011, p. 61, retrieved 2026-09-08; the same
 * values appear in the UK-retained rendering of the regulation, checked against
 * it entry by entry.
 *
 * Written out rather than imported from the registry: importing the expectation
 * from the code under test would assert nothing.
 */
const ANNEX_XIII_PART_A: [key: string, unit: string][] = [
  ['vitaminA', 'µg'],
  ['vitaminD', 'µg'],
  ['vitaminE', 'mg'],
  ['vitaminK', 'µg'],
  ['vitaminC', 'mg'],
  ['thiamin', 'mg'],
  ['riboflavin', 'mg'],
  ['niacin', 'mg'],
  ['vitaminB6', 'mg'],
  ['folicAcid', 'µg'],
  ['vitaminB12', 'µg'],
  ['biotin', 'µg'],
  ['pantothenicAcid', 'mg'],
  ['potassium', 'mg'],
  ['chloride', 'mg'],
  ['calcium', 'mg'],
  ['phosphorus', 'mg'],
  ['magnesium', 'mg'],
  ['iron', 'mg'],
  ['zinc', 'mg'],
  ['copper', 'mg'],
  ['manganese', 'mg'],
  ['fluoride', 'mg'],
  ['selenium', 'µg'],
  ['chromium', 'µg'],
  ['molybdenum', 'µg'],
  ['iodine', 'µg'],
]

/** Part B, in the order the regulation prints it. Energy is kcal by §6. */
const ANNEX_XIII_PART_B: [key: string, unit: string][] = [
  ['energy', 'kcal'],
  ['fat', 'g'],
  ['saturates', 'g'],
  ['carbohydrate', 'g'],
  ['sugars', 'g'],
  ['protein', 'g'],
  ['salt', 'g'],
]

describe('Annex XIII tracked set', () => {
  it('tracks exactly the nutrients the annex lists, and nothing else', () => {
    const expected = [...ANNEX_XIII_PART_A, ...ANNEX_XIII_PART_B].map(([key]) => key)

    // Both directions: a missing nutrient leaves a gap the NRV table cannot
    // fill, and an extra one is a nutrient with no reference value and no
    // source, which #16 would then have to invent a figure for.
    expect(Object.keys(NUTRIENTS).sort()).toEqual(expected.sort())
  })

  it.each(ANNEX_XIII_PART_A)('%s is a micronutrient in %s', (key, unit) => {
    expect(NUTRIENTS[key as keyof typeof NUTRIENTS].unit).toBe(unit)
    expect(NUTRIENTS[key as keyof typeof NUTRIENTS].kind).toBe('micro')
  })

  it.each(ANNEX_XIII_PART_B)('%s is a macronutrient in %s', (key, unit) => {
    expect(NUTRIENTS[key as keyof typeof NUTRIENTS].unit).toBe(unit)
    expect(NUTRIENTS[key as keyof typeof NUTRIENTS].kind).toBe('macro')
  })

  it('declares the mandatory seven in the order a label prints them', () => {
    // Order is part of the contract: the form and the day summary render in
    // this sequence, and a label reads energy first and salt last.
    expect([...DECLARATION_NUTRIENTS]).toEqual(ANNEX_XIII_PART_B.map(([key]) => key))
  })

  it('keeps salt out of the user-settable goals', () => {
    // Anticipated in the registry's own comment before salt existed: the goal
    // set is an explicit list precisely so a macro-shaped nutrient with a real
    // ceiling cannot become self-settable by being added here.
    expect(isGoalNutrient('salt' as never)).toBe(false)
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
