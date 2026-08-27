/**
 * Contract for the core-loop arithmetic (§7).
 *
 * Two functions, one summing path:
 *   nutrientsFor(entity, quantity) -> NutrientMap    scaled, provenance preserved
 *   sumTotals(maps)                -> NutrientTotals amount + bySource + missing
 *
 * Quantity is grams for a food and doses for a supplement (§8), resolved at the
 * leaf so evaluation has a single path to sum through. The entity is told apart
 * structurally, by whether it carries `per100g` or `perDose` — neither Food nor
 * Supplement has a discriminant field in §7.
 *
 * Only nutrients already in the registry are used here, so this stays green as
 * the tracked set grows.
 */
import { describe, it, expect } from 'vitest'

import { nutrientsFor, sumTotals } from '../totals'
import type { NutrientMap } from '../data/nutrients'

const food = (per100g: NutrientMap) => ({ per100g })
const supplement = (perDose: NutrientMap) => ({ perDose })

describe('nutrientsFor', () => {
  it('scales a food from per-100g by grams / 100', () => {
    const oats = food({
      energy: { value: 370, source: 'off-packaging' },
      protein: { value: 13, source: 'off-packaging' },
    })

    const result = nutrientsFor(oats, 50)

    expect(result.energy?.value).toBe(185)
    expect(result.protein?.value).toBe(6.5)
  })

  it('scales a supplement by dose count, not by mass', () => {
    const d3 = supplement({ vitaminD: { value: 25, source: 'label-ocr' } })

    expect(nutrientsFor(d3, 2).vitaminD?.value).toBe(50)
  })

  it('preserves the source of each value it scales', () => {
    const mixed = food({
      energy: { value: 100, source: 'off-packaging' },
      vitaminD: { value: 4, source: 'off-estimated' },
    })

    const result = nutrientsFor(mixed, 250)

    // Provenance is per value, not per food (§3) — scaling must not flatten it.
    expect(result.energy?.source).toBe('off-packaging')
    expect(result.vitaminD?.source).toBe('off-estimated')
  })

  it('keeps unknown values unknown rather than turning them into zero', () => {
    const partial = food({
      energy: { value: 200, source: 'off-packaging' },
      vitaminD: { value: 0, source: 'unknown' },
    })

    expect(nutrientsFor(partial, 100).vitaminD?.source).toBe('unknown')
  })

  it('passes an unknown value through unscaled', () => {
    // Nonzero on purpose: with a 0 placeholder, scaling is invisible because
    // 0 * anything is 0. An unknown is an absence, so nothing may multiply it
    // into something that looks like data.
    const placeholder = food({ vitaminD: { value: 7, source: 'unknown' } })

    expect(nutrientsFor(placeholder, 500).vitaminD?.value).toBe(7)
  })

  it('does not round to the display precision', () => {
    const odd = food({ protein: { value: 10, source: 'user' } })

    // protein renders at 1 decimal (§5), but 0.333... must survive in the data:
    // rounding on the way in compounds across a week and cannot be undone (§7).
    expect(nutrientsFor(odd, 10 / 3).protein?.value).toBeCloseTo(0.3333333, 6)
  })
})

describe('sumTotals', () => {
  it('sums amounts across contributors', () => {
    const totals = sumTotals([
      { energy: { value: 185, source: 'off-packaging' } },
      { energy: { value: 90, source: 'usda-generic' } },
    ])

    expect(totals.energy?.amount).toBe(275)
  })

  it('attributes each amount to its source', () => {
    const totals = sumTotals([
      { vitaminD: { value: 30, source: 'off-packaging' } },
      { vitaminD: { value: 20, source: 'off-estimated' } },
      { vitaminD: { value: 10, source: 'off-estimated' } },
    ])

    expect(totals.vitaminD?.bySource).toEqual({
      'off-packaging': 30,
      'off-estimated': 30,
    })
  })

  it('keeps bySource summing to amount', () => {
    const totals = sumTotals([
      { protein: { value: 6.5, source: 'off-packaging' } },
      { protein: { value: 3.2, source: 'user' } },
      { protein: { value: 1.1, source: 'off-estimated' } },
    ])

    const total = totals.protein
    const summed = Object.values(total?.bySource ?? {}).reduce((a, b) => a + b, 0)

    // This invariant is what makes §9's "40% from estimated" plain arithmetic.
    expect(summed).toBeCloseTo(total?.amount ?? 0, 10)
  })

  it('counts contributors with no usable value instead of summing them', () => {
    const totals = sumTotals([
      { vitaminD: { value: 50, source: 'off-packaging' } },
      { vitaminD: { value: 0, source: 'unknown' } },
      { energy: { value: 100, source: 'off-packaging' } }, // no vitaminD at all
    ])

    const d = totals.vitaminD

    expect(d?.amount).toBe(50)
    expect(d?.missing).toBe(2)
    // 'unknown' is an absence, not an amount — it must never land in bySource.
    expect(Object.keys(d?.bySource ?? {})).not.toContain('unknown')
  })

  it('reports a nutrient nobody has data for, rather than omitting it', () => {
    const totals = sumTotals([
      { vitaminD: { value: 0, source: 'unknown' } },
      { vitaminD: { value: 0, source: 'unknown' } },
    ])

    // "tracked but no data" and "not tracked at all" must not look the same (§3).
    expect(totals.vitaminD).toBeDefined()
    expect(totals.vitaminD?.amount).toBe(0)
    expect(totals.vitaminD?.missing).toBe(2)
    expect(totals.vitaminD?.bySource).toEqual({})
  })

  it('leaves missing at zero when every contributor has data', () => {
    const totals = sumTotals([
      { energy: { value: 10, source: 'off-packaging' } },
      { energy: { value: 20, source: 'off-packaging' } },
    ])

    expect(totals.energy?.missing).toBe(0)
  })

  it('returns an empty result for no contributors', () => {
    expect(sumTotals([])).toEqual({})
  })
})
