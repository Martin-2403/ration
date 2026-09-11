import { describe, expect, it } from 'vitest'

import { DECLARATION_NUTRIENTS, NUTRIENTS, type NutrientKey } from '../data/nutrients'
import type { Food } from '../types'
import { buildUserFood, reviseFood } from '../user-food'

describe('buildUserFood', () => {
  it('tags a value the user supplied as user-entered', () => {
    const food = buildUserFood({ name: 'Apple', per100g: { energy: 52 } }, 'fixed-id')

    expect(food.per100g.energy).toEqual({ value: 52, source: 'user' })
  })

  it('records a blank field as unknown, not as zero', () => {
    const food = buildUserFood({ name: 'Apple', per100g: { energy: 52 } }, 'fixed-id')

    // §3: unknown is an absence. A zero here would claim the apple has no
    // protein, which is a different and false statement.
    expect(food.per100g.protein?.source).toBe('unknown')
    expect(food.per100g.vitaminD?.source).toBe('unknown')
  })

  it('treats NaN as blank rather than storing it', () => {
    const food = buildUserFood({ name: 'Apple', per100g: { protein: NaN } }, 'fixed-id')

    expect(food.per100g.protein?.source).toBe('unknown')
    expect(Number.isNaN(food.per100g.protein?.value)).toBe(false)
  })

  it.each([
    ['empty string', ''],
    ['non-numeric string', 'abc'],
    ['Infinity', Infinity],
    ['null', null],
  ])('treats %s as no data rather than storing a non-number', (_label, bad) => {
    // A type="number" input reports unparseable content as '', and
    // Number.isNaN('') is false — so a looser guard here would store a string
    // where a number belongs and every downstream total would become NaN.
    const food = buildUserFood(
      { name: 'Apple', per100g: { protein: bad as unknown as number } },
      'fixed-id',
    )

    expect(food.per100g.protein?.source).toBe('unknown')
    expect(typeof food.per100g.protein?.value).toBe('number')
    expect(Number.isFinite(food.per100g.protein?.value)).toBe(true)
  })

  it('covers every registry nutrient, so nothing is silently untracked', () => {
    const food = buildUserFood({ name: 'Apple', per100g: {} }, 'fixed-id')

    // Derived from the registry rather than listed: a hardcoded list makes this
    // test fail for the wrong reason every time the registry grows, which is
    // what happened when carbohydrate and fat were added and again at #56.
    expect(Object.keys(food.per100g).sort()).toEqual(Object.keys(NUTRIENTS).sort())
  })

  it('accepts an explicit zero as a real value', () => {
    // Zero is a legitimate measurement — a food genuinely containing no protein
    // is not the same as one whose protein is unknown.
    const food = buildUserFood({ name: 'Water', per100g: { protein: 0 } }, 'fixed-id')

    expect(food.per100g.protein).toEqual({ value: 0, source: 'user' })
  })

  it('trims the name', () => {
    const food = buildUserFood({ name: '  Apple  ', per100g: {} }, 'fixed-id')

    expect(food.name).toBe('Apple')
  })

  it('generates a unique id when none is given', () => {
    const a = buildUserFood({ name: 'Apple', per100g: {} })
    const b = buildUserFood({ name: 'Apple', per100g: {} })

    expect(a.id).not.toBe(b.id)
    expect(a.id.length).toBeGreaterThan(0)
  })

  it('has no barcode, since nothing was scanned', () => {
    const food = buildUserFood({ name: 'Apple', per100g: {} }, 'fixed-id')

    expect(food.barcode).toBeUndefined()
  })
})

/**
 * #51's provenance rule, which is the whole point of the feature: a clone is
 * not a measurement of the new food, so what it may claim about each value
 * depends on whether that value actually carried over.
 */
describe('reviseFood', () => {
  const original: Food = {
    id: 'yoghurt',
    name: 'Yoghurt, 3.5%',
    per100g: {
      energy: { value: 66, source: 'off-packaging' },
      protein: { value: 3.6, source: 'off-packaging' },
      fat: { value: 3.5, source: 'off-packaging' },
      // Stored as 0 because nothing is known, which is what makes the
      // source check below load-bearing rather than decorative.
      calcium: { value: 0, source: 'unknown' },
    },
  }

  const values = (food: Food) => food.per100g

  it('keeps the original source for a value that carried over unchanged', () => {
    const revised = reviseFood(original, {
      name: 'Yoghurt, 0.1%',
      asked: DECLARATION_NUTRIENTS,
      per100g: { energy: 66, protein: 3.6, fat: 0.1 },
    })

    // Energy and protein are genuinely still the label's figures, and throwing
    // that away would lose real information (§3).
    expect(values(revised).energy).toEqual({ value: 66, source: 'off-packaging' })
    expect(values(revised).protein).toEqual({ value: 3.6, source: 'off-packaging' })
  })

  it('retags an edited value as the user\'s own', () => {
    const revised = reviseFood(original, {
      name: 'Yoghurt, 0.1%',
      asked: DECLARATION_NUTRIENTS,
      per100g: { energy: 66, protein: 3.6, fat: 0.1 },
    })

    // Keeping off-packaging here would claim a label was read for a number
    // nobody looked at.
    expect(values(revised).fat).toEqual({ value: 0.1, source: 'user' })
  })

  it('treats a real zero typed over an unknown as a measurement', () => {
    const revised = reviseFood(original, {
      name: 'Skimmed',
      asked: [...DECLARATION_NUTRIENTS, 'calcium'],
      per100g: { energy: 66, calcium: 0 },
    })

    // An unknown is stored as 0, so comparing values alone would call this
    // unchanged and record a measured zero as no data — the silent zero §3
    // exists to prevent, arriving through the back door.
    expect(values(revised).calcium).toEqual({ value: 0, source: 'user' })
  })

  it('records a cleared field as unknown, not as the value it used to hold', () => {
    const revised = reviseFood(original, {
      name: 'Mystery',
      asked: DECLARATION_NUTRIENTS,
      per100g: { energy: 66 },
    })

    // Clearing a field is the user saying they do not know, which is different
    // from leaving the old number in place.
    expect(values(revised).protein).toEqual({ value: 0, source: 'unknown' })
  })

  it('clones under a new id, leaving the original untouched', () => {
    const revised = reviseFood(
      original,
      { name: 'Yoghurt, 0.1%', asked: DECLARATION_NUTRIENTS, per100g: { fat: 0.1 } },
      'new-id',
    )

    expect(revised.id).toBe('new-id')
    expect(revised.name).toBe('Yoghurt, 0.1%')
    // The source object must not be mutated: log entries reference it by id and
    // the picker may still be holding it.
    expect(original.per100g.fat).toEqual({ value: 3.5, source: 'off-packaging' })
    expect(original.name).toBe('Yoghurt, 3.5%')
  })

  it('corrects in place when given the original id', () => {
    const revised = reviseFood(original, {
      name: 'Yoghurt, 3.5%',
      asked: DECLARATION_NUTRIENTS,
      per100g: { energy: 70, protein: 3.6, fat: 3.5 },
    })

    // §9: this changes what future logs resolve to and rewrites no history,
    // which is why in-place correction is safe despite how it looks.
    expect(revised.id).toBe('yoghurt')
    expect(values(revised).energy).toEqual({ value: 70, source: 'user' })
    expect(values(revised).fat).toEqual({ value: 3.5, source: 'off-packaging' })
  })

  it('covers every registry nutrient, like a hand-entered food does', () => {
    const revised = reviseFood(original, {
      name: 'Anything',
      asked: Object.keys(NUTRIENTS) as NutrientKey[],
      per100g: {},
    })

    expect(Object.keys(revised.per100g).sort()).toEqual(Object.keys(NUTRIENTS).sort())
  })

  it('leaves alone a nutrient the surface never asked about', () => {
    const resolved: Food = {
      id: 'bar',
      name: 'Cereal bar',
      per100g: {
        energy: { value: 400, source: 'off-packaging' },
        selenium: { value: 12, source: 'usda-generic' },
      },
    }

    // The manual form offers the seven a label declares (#56). Revising through
    // it must not erase a micronutrient it never showed a field for: that is
    // "never considered", not "asked, no answer" (§3, #80).
    const revised = reviseFood(resolved, {
      name: 'Cereal bar, dark',
      asked: DECLARATION_NUTRIENTS,
      per100g: { energy: 420 },
    })

    expect(revised.per100g.selenium).toEqual({ value: 12, source: 'usda-generic' })
    expect(revised.per100g.energy).toEqual({ value: 420, source: 'user' })
  })

  it('trims the name', () => {
    expect(reviseFood(original, { name: '  Kefir  ', asked: [], per100g: {} }).name).toBe(
      'Kefir',
    )
  })
})
