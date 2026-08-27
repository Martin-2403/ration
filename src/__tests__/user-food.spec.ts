import { describe, expect, it } from 'vitest'

import { buildUserFood } from '../user-food'

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
    // An empty number input yields NaN through v-model.number.
    const food = buildUserFood({ name: 'Apple', per100g: { protein: NaN } }, 'fixed-id')

    expect(food.per100g.protein?.source).toBe('unknown')
    expect(Number.isNaN(food.per100g.protein?.value)).toBe(false)
  })

  it('covers every registry nutrient, so nothing is silently untracked', () => {
    const food = buildUserFood({ name: 'Apple', per100g: {} }, 'fixed-id')

    expect(Object.keys(food.per100g).sort()).toEqual(['energy', 'protein', 'vitaminD'])
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
