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

/**
 * EFSA's tolerable upper intake levels for adults, from the Overview report,
 * Version 11 (August 2025), retrieved 2026-09-10 (#17). Only the figures that
 * apply to total chronic intake from all dietary sources appear here, which is
 * what the app's totals sum.
 *
 * Transcribed by hand, like the reference intakes above, so this is a second
 * reading of the source rather than the generated table checked against itself.
 */
const UPPER_LIMITS: [NutrientKey, number][] = [
  ['vitaminD', 100],
  ['vitaminE', 300],
  ['vitaminB6', 12],
  ['calcium', 2500],
  ['zinc', 25],
  ['copper', 5],
  ['selenium', 255],
  ['molybdenum', 600],
  ['iodine', 600],
]

/**
 * Nutrients that keep no upper limit, each with the reason, because "absent"
 * has to stay a decision rather than becoming an oversight (§5).
 */
const WITHOUT_A_LIMIT: [NutrientKey, string][] = [
  ['magnesium', 'the UL covers only magnesium added to food, water or supplements'],
  ['folicAcid', 'the UL covers only folic acid added to foods or used in supplements'],
  ['vitaminA', 'the UL covers preformed retinol, not the total retinol equivalents reported'],
  ['niacin', 'there are two ULs by form, 900 mg nicotinamide and 10 mg nicotinic acid'],
  ['iron', 'EFSA sets a safe level of intake rather than a UL'],
  ['manganese', 'EFSA sets a safe level of intake rather than a UL'],
  ['fluoride', 'EFSA sets a safe level of intake rather than a UL for adults'],
  ['thiamin', 'no adequate data to derive a UL'],
  ['riboflavin', 'no adequate data to derive a UL'],
  ['biotin', 'no adequate data to derive a UL'],
  ['pantothenicAcid', 'no adequate data to derive a UL'],
  ['vitaminB12', 'no defined adverse effects'],
  ['vitaminC', 'no adequate data to derive a UL'],
  ['vitaminK', 'no adequate data to derive a UL'],
  ['potassium', 'no adequate data to derive a UL'],
  ['chloride', 'no adequate data to derive a UL'],
  ['phosphorus', 'no adequate data to derive a UL'],
  ['chromium', 'no adequate data to derive a UL'],
  ['fat', 'EFSA derives no UL for total fat'],
  ['carbohydrate', 'EFSA derives no UL for carbohydrate'],
  ['protein', 'EFSA derives no UL for protein'],
]

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

  it.each(UPPER_LIMITS)('limits %s to %d per day', (nutrient, limit) => {
    expect(REFERENCE_TARGETS[nutrient]?.upperLimit).toBe(limit)
  })

  it('converts the molybdenum limit into the canonical unit', () => {
    // EFSA states it as 0.6 mg/d and the registry keeps molybdenum in µg. Left
    // unconverted it would read as 0.6 µg — a limit a thousand times below the
    // 50 µg reference intake, which would report every intake as over it.
    expect(REFERENCE_TARGETS.molybdenum?.upperLimit).toBe(600)
    expect(REFERENCE_TARGETS.molybdenum?.upperLimit).not.toBe(0.6)
  })

  it.each(WITHOUT_A_LIMIT)('leaves %s without an upper limit, because %s', (nutrient) => {
    expect(REFERENCE_TARGETS[nutrient]?.upperLimit).toBeUndefined()
  })

  it('never sets a limit below its own target', () => {
    // The invariant that catches a figure measuring something other than what
    // the app sums. EFSA's magnesium UL is 250 mg against a 375 mg reference
    // intake, because it covers only magnesium added to food and supplements —
    // transcribing it would have reported anyone meeting their target as over
    // the limit, and this assertion is what refuses it.
    for (const [nutrient, target] of Object.entries(REFERENCE_TARGETS)) {
      if (target?.upperLimit === undefined) continue

      expect(
        target.upperLimit,
        `${nutrient} has a limit below its target, so the two measure different things`,
      ).toBeGreaterThan(target.target)
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
