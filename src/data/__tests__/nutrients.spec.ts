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

import { NUTRIENTS } from '../nutrients'

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

  // Left as a todo rather than a test because naming these is your call, not
  // mine: §15 refers to protein, carbs and fat as macros, but the exact keys
  // ("carbs" vs "carbohydrates") are a decision the registry makes. Replace
  // this with a real assertion once you have picked them.
  it.todo('includes protein, carbohydrate and fat as macros')
})
