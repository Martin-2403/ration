/**
 * Spec-as-test for the reference intake table (§5, §9, #16).
 *
 * §17 puts this among the highest-value units in the app: a reference figure
 * that is wrong by a factor, or in the wrong unit, produces an evaluation that
 * is entirely plausible and entirely wrong, and no amount of looking at the
 * screen reveals it.
 *
 * The expected figures below are transcribed by hand from Regulation (EU)
 * No 1169/2011, Annex XIII, OJ L 304, 22.11.2011, p. 61 — deliberately not
 * generated from the same parse that produced `rdi.ts`, so the two are
 * independent readings of the same page rather than one reading checked
 * against itself.
 */
import { describe, expect, it } from 'vitest'

import { NUTRIENTS, type NutrientKey } from '../nutrients'
import { ACTIVE_PROFILE, REFERENCE_PROFILES, REFERENCE_TARGETS } from '../rdi'

/** Annex XIII Part A point 1 — vitamins and minerals, in the annex's order. */
const PART_A: [NutrientKey, number][] = [
  ['vitaminA', 800],
  ['vitaminD', 5],
  ['vitaminE', 12],
  ['vitaminK', 75],
  ['vitaminC', 80],
  ['thiamin', 1.1],
  ['riboflavin', 1.4],
  ['niacin', 16],
  ['vitaminB6', 1.4],
  ['folicAcid', 200],
  ['vitaminB12', 2.5],
  ['biotin', 50],
  ['pantothenicAcid', 6],
  ['potassium', 2000],
  ['chloride', 800],
  ['calcium', 800],
  ['phosphorus', 700],
  ['magnesium', 375],
  ['iron', 14],
  ['zinc', 10],
  ['copper', 1],
  ['manganese', 2],
  ['fluoride', 3.5],
  ['selenium', 55],
  ['chromium', 40],
  ['molybdenum', 50],
  ['iodine', 150],
]

/**
 * Annex XIII Part B, the four that carry a direction. The annex also prints
 * saturates 20 g, sugars 90 g and salt 6 g; those are absent from the table on
 * purpose and asserted absent below.
 */
const PART_B: [NutrientKey, number][] = [
  ['energy', 2000],
  ['fat', 70],
  ['carbohydrate', 260],
  ['protein', 50],
]

const WITHOUT_A_TARGET: NutrientKey[] = ['saturates', 'sugars', 'salt']

describe('EU NRV reference table', () => {
  it.each([...PART_B, ...PART_A])('sets %s to %d per day', (nutrient, target) => {
    expect(REFERENCE_TARGETS[nutrient]?.target).toBe(target)
  })

  it('states energy in kcal, not the kJ the annex prints beside it', () => {
    // The annex gives "8 400 kJ/2 000 kcal" on one line. Taking the first number
    // is a 4.184x error that reads as a perfectly ordinary daily figure, and §6
    // makes kcal canonical precisely so this conversion happens once.
    expect(REFERENCE_TARGETS.energy?.target).toBe(2000)
    expect(REFERENCE_TARGETS.energy?.target).not.toBe(8400)
  })

  it.each(WITHOUT_A_TARGET)('leaves %s without a reference target', (nutrient) => {
    // The annex prints a figure for each, but not a direction, and both fields
    // here carry one. A `target` of 6 g of salt would have the evaluation
    // report reaching it as an achievement. #17 supplies an upper limit, which
    // states its own direction.
    expect(REFERENCE_TARGETS[nutrient]).toBeUndefined()
  })

  it('covers the annex and nothing else', () => {
    const expected = [...PART_A, ...PART_B].map(([nutrient]) => nutrient)

    expect(Object.keys(REFERENCE_TARGETS).sort()).toEqual(expected.sort())
  })

  it('knows no upper limits yet', () => {
    // An upper intake level is a separate authoritative figure (#17) and is
    // never inferred from a reference intake (§5). Absent must stay absent
    // rather than becoming a copy of the target.
    for (const [nutrient, target] of Object.entries(REFERENCE_TARGETS)) {
      expect(target?.upperLimit, `${nutrient} has an unsourced upper limit`).toBeUndefined()
    }
  })

  it.each(Object.entries(REFERENCE_TARGETS))('%s is a usable positive figure', (_key, target) => {
    expect(Number.isFinite(target?.target)).toBe(true)
    expect(target!.target).toBeGreaterThan(0)
  })

  it('only carries figures for nutrients the registry defines', () => {
    for (const nutrient of Object.keys(REFERENCE_TARGETS)) {
      expect(NUTRIENTS, `${nutrient} is not in the registry`).toHaveProperty(nutrient)
    }
  })

  it('keys each entry to itself', () => {
    // The map is keyed by nutrient and the value repeats it; a mismatch would
    // let a lookup return another nutrient's figure.
    for (const [key, target] of Object.entries(REFERENCE_TARGETS)) {
      expect(target?.nutrient).toBe(key)
    }
  })
})

describe('reference profiles', () => {
  it('exposes the active profile as the table callers use', () => {
    expect(REFERENCE_TARGETS).toBe(REFERENCE_PROFILES[ACTIVE_PROFILE])
  })

  it('starts from one framework and one adult profile', () => {
    // §5: the structure allows age, sex and pregnancy profiles later; the MVP
    // ships exactly one. A second appearing without figures being sourced for
    // it is the failure this catches.
    expect(Object.keys(REFERENCE_PROFILES)).toEqual(['eu-nrv-adult'])
  })
})
