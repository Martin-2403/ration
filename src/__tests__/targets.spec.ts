/**
 * Target resolution (§5, §9): which number intake is compared against, and
 * whether the app may call that number authoritative.
 *
 * The reference table is injected here. The shipped one is empty until #16
 * lands, so tests that need a reference figure supply their own rather than
 * depending on data that is still [verify].
 */
import { describe, expect, it } from 'vitest'

import type { GoalNutrientKey, NutrientKey, UserGoal } from '../data/nutrients'
import { goalsByNutrient, resolveTarget, resolveTargets, type ReferenceTable } from '../targets'

const goal = (nutrient: GoalNutrientKey, target: number): UserGoal => ({
  nutrient,
  target,
  updatedAt: 1_700_000_000_000,
})

const table = (entries: ReferenceTable): ReferenceTable => entries

describe('resolveTarget', () => {
  it('prefers the user goal over the reference figure', () => {
    const resolved = resolveTarget(
      'energy',
      goalsByNutrient([goal('energy', 2200)]),
      table({ energy: { nutrient: 'energy', target: 2000 } }),
    )

    expect(resolved?.target).toBe(2200)
    expect(resolved?.origin).toBe('user')
  })

  it('falls back to the reference figure when there is no goal', () => {
    const resolved = resolveTarget(
      'energy',
      {},
      table({ energy: { nutrient: 'energy', target: 2000 } }),
    )

    expect(resolved?.target).toBe(2000)
    // The origin is what lets the view say "of the NRV" instead of "of your
    // goal". Getting it wrong misattributes the claim, not just the label.
    expect(resolved?.origin).toBe('reference')
  })

  it('reports no target when there is neither a goal nor a reference figure', () => {
    // Not zero, and not "met": an absent target is unknown (§3).
    expect(resolveTarget('vitaminD', {}, table({}))).toBeUndefined()
  })

  it('keeps the reference upper limit when a user goal wins the target', () => {
    const resolved = resolveTarget(
      'energy',
      goalsByNutrient([goal('energy', 2200)]),
      table({ energy: { nutrient: 'energy', target: 2000, upperLimit: 4000 } }),
    )

    // A ceiling is a safety figure, not a preference, so setting a goal must not
    // move or drop it.
    expect(resolved?.upperLimit).toBe(4000)
    expect(resolved?.origin).toBe('user')
  })

  it('leaves the upper limit absent when the reference table knows none', () => {
    const resolved = resolveTarget('energy', goalsByNutrient([goal('energy', 2200)]), table({}))

    // Absent means no limit is known (§5) — evaluation degrades to
    // shortfall-only rather than inventing a ceiling.
    expect(resolved?.upperLimit).toBeUndefined()
  })

  it('ignores a stored goal for a nutrient the user may not set', () => {
    // The allowlist can shrink, and stored rows outlive it. Cast because the
    // types forbid writing this — only old data can be shaped this way.
    const stale = { nutrient: 'vitaminD', target: 500, updatedAt: 1 } as unknown as UserGoal

    const resolved = resolveTarget(
      'vitaminD',
      goalsByNutrient([stale]),
      table({ vitaminD: { nutrient: 'vitaminD', target: 20, upperLimit: 100 } }),
    )

    expect(resolved?.target).toBe(20)
    expect(resolved?.origin).toBe('reference')
  })

  it('reads the shipped reference table when none is supplied', () => {
    // Asserted through a user goal, so this stays true once #16 fills the table.
    const resolved = resolveTarget('protein', goalsByNutrient([goal('protein', 140)]))

    expect(resolved?.target).toBe(140)
    expect(resolved?.origin).toBe('user')
  })
})

describe('resolveTargets', () => {
  const tracked: NutrientKey[] = ['energy', 'protein', 'vitaminD']

  it('resolves each nutrient in the tracked set', () => {
    const resolved = resolveTargets(
      tracked,
      goalsByNutrient([goal('energy', 2200)]),
      table({ protein: { nutrient: 'protein', target: 50 } }),
    )

    expect(resolved.energy?.origin).toBe('user')
    expect(resolved.protein?.origin).toBe('reference')
  })

  it('omits a nutrient with no target rather than zeroing it', () => {
    const resolved = resolveTargets(tracked, {}, table({}))

    expect(resolved).toEqual({})
    expect(Object.keys(resolved)).not.toContain('vitaminD')
  })
})

describe('goalsByNutrient', () => {
  it('indexes rows by nutrient', () => {
    const indexed = goalsByNutrient([goal('energy', 2200), goal('protein', 140)])

    expect(indexed.energy?.target).toBe(2200)
    expect(indexed.protein?.target).toBe(140)
  })

  it('has nothing for a nutrient without a goal', () => {
    expect(goalsByNutrient([]).energy).toBeUndefined()
  })
})
