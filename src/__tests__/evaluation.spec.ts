/**
 * Spec for the evaluation arithmetic (§9, §17).
 *
 * This is the module where a wrong number looks entirely plausible: a slipped
 * window edge or a denominator counting the wrong thing produces figures that
 * are internally consistent and completely false, and nobody notices by eye.
 *
 * DST assertions follow dates.spec.ts and stay timezone-agnostic — they sweep
 * several months and assert the property, so they hold whatever zone the runner
 * is in rather than encoding one zone's transition dates.
 */
import { describe, expect, it } from 'vitest'

import type { NutrientTotal, NutrientTotals, ResolvedTarget, Source } from '../data/nutrients'
import { addLocalDays, nextLocalMidnight, startOfLocalDay } from '../dates'
import { byUrgency, daysLogged, evaluate, trailingWindow } from '../evaluation'
import { hasNoData } from '../nutrient-display'
import type { LogEntry } from '../types'

const isLocalMidnight = (ts: number) => {
  const d = new Date(ts)

  return (
    d.getHours() === 0 && d.getMinutes() === 0 && d.getSeconds() === 0 && d.getMilliseconds() === 0
  )
}

const total = (amount: number, source: Source = 'user', missing = 0): NutrientTotal => ({
  amount,
  bySource: amount > 0 ? { [source]: amount } : {},
  missing,
})

const entry = (at: number, totals: NutrientTotals): LogEntry => ({
  id: 1,
  name: 'Porridge',
  timestamp: at,
  createdAt: at,
  updatedAt: at,
  items: [{ kind: 'food', foodId: 'oats', grams: 50 }],
  totals,
})

/** Midday on a day relative to today, built by local days rather than by offset. */
const midday = (dayOffset: number) => addLocalDays(startOfLocalDay(), dayOffset) + 12 * 3_600_000

const target = (
  nutrient: ResolvedTarget['nutrient'],
  value: number,
  origin: ResolvedTarget['origin'] = 'user',
  upperLimit?: number,
): ResolvedTarget => ({
  nutrient,
  target: value,
  origin,
  ...(upperLimit !== undefined && { upperLimit }),
})

const week = () => trailingWindow(7)

describe('trailingWindow', () => {
  it('covers today and the days before it, ending at the next local midnight', () => {
    const window = trailingWindow(7)

    expect(window.to).toBe(nextLocalMidnight())
    expect(window.from).toBe(addLocalDays(startOfLocalDay(), -6))
    expect(window.days).toBe(7)

    // The point of the whole thing: today's intake has to be inside the
    // trailing week. Ending the window at today's midnight excludes it.
    const now = midday(0)
    expect(now >= window.from && now < window.to).toBe(true)
  })

  it('starts and ends at a local midnight, not at the time of day it was called', () => {
    const window = trailingWindow(7, new Date(2026, 7, 27, 17, 42, 13).getTime())

    expect(isLocalMidnight(window.from)).toBe(true)
    expect(isLocalMidnight(window.to)).toBe(true)
  })

  it('spans exactly the requested number of local days, across a DST change', () => {
    // A fixed 86_400_000 offset lands an hour into the wrong day twice a year,
    // which silently stretches the window to eight days or shrinks it to six.
    for (const month of [0, 2, 3, 6, 9, 10]) {
      const window = trailingWindow(7, new Date(2026, month, 15, 12, 0).getTime())

      let cursor = window.from
      for (let step = 0; step < 7; step += 1) cursor = addLocalDays(cursor, 1)

      expect(cursor, `month ${month}`).toBe(window.to)
    }
  })

  it('covers a single day when asked for one', () => {
    const window = trailingWindow(1)

    expect(window.from).toBe(startOfLocalDay())
    expect(window.to).toBe(nextLocalMidnight())
  })
})

describe('daysLogged', () => {
  it('counts a day once however many entries it holds', () => {
    const entries = [
      entry(midday(-1), { energy: total(300) }),
      entry(midday(-1) + 3_600_000, { energy: total(500) }),
      entry(midday(-1) + 7_200_000, { energy: total(200) }),
    ]

    expect(daysLogged(entries, week())).toEqual({ logged: 1, days: 7 })
  })

  it('counts distinct days rather than the length of the window', () => {
    // The denominator is what §9 hangs on: reporting 7 of 7 for three logged
    // days scales every target by more than twice what it should be.
    const entries = [
      entry(midday(-1), { energy: total(300) }),
      entry(midday(-2), { energy: total(300) }),
      entry(midday(-5), { energy: total(300) }),
    ]

    expect(daysLogged(entries, week())).toEqual({ logged: 3, days: 7 })
  })

  it('ignores entries outside the window', () => {
    const entries = [
      entry(midday(-1), { energy: total(300) }),
      entry(midday(-20), { energy: total(300) }),
    ]

    // A caller may hand over a wider set than it queried.
    expect(daysLogged(entries, week()).logged).toBe(1)
  })

  it('counts an entry at the window start and excludes one at its end', () => {
    const window = week()

    expect(daysLogged([entry(window.from, { energy: total(1) })], window).logged).toBe(1)
    expect(daysLogged([entry(window.to, { energy: total(1) })], window).logged).toBe(0)
  })

  it('reports zero logged days for an empty log, without dividing by it', () => {
    expect(daysLogged([], week())).toEqual({ logged: 0, days: 7 })
  })
})

describe('evaluate', () => {
  it('scales the target by days logged, not by the window length', () => {
    const entries = [entry(midday(-1), { energy: total(1800) })]

    const [energy] = evaluate(entries, { energy: target('energy', 2000) }, week())

    // One day logged against a 2000/day target is a 2000 target, not 14 000.
    // The wrong denominator reads as "1800 of 14000 kcal" after one normal day.
    expect(energy?.target).toBe(2000)
    expect(energy?.share).toBeCloseTo(0.9, 6)
  })

  it('reports a shortfall against the scaled target', () => {
    const entries = [
      entry(midday(-1), { energy: total(1500) }),
      entry(midday(-2), { energy: total(1500) }),
    ]

    const [energy] = evaluate(entries, { energy: target('energy', 2000) }, week())

    expect(energy?.target).toBe(4000)
    expect(energy?.share).toBeCloseTo(0.75, 6)
    expect(energy?.atOrAboveTarget).toBe(false)
  })

  it('reports at-or-above target without calling it met', () => {
    const entries = [entry(midday(-1), { energy: total(2000) })]

    const [energy] = evaluate(entries, { energy: target('energy', 2000) }, week())

    // Exactly on target counts as reached; §9's caveat about averages is the
    // view's wording problem, not this module's.
    expect(energy?.atOrAboveTarget).toBe(true)
    expect(energy?.overLimit).toBe(false)
  })

  it('reports over-limit only when an upper limit is known', () => {
    const entries = [entry(midday(-1), { vitaminD: total(120) })]

    const [withLimit] = evaluate(
      entries,
      { vitaminD: target('vitaminD', 20, 'reference', 100) },
      week(),
    )
    expect(withLimit?.limit).toBe(100)
    expect(withLimit?.overLimit).toBe(true)

    // Absent means no limit is known, never inferred (§5) — so an intake far
    // above target is still not over anything.
    const [withoutLimit] = evaluate(entries, { vitaminD: target('vitaminD', 20) }, week())
    expect(withoutLimit?.limit).toBeUndefined()
    expect(withoutLimit?.overLimit).toBe(false)
  })

  it('leaves share undefined when the nutrient has no target', () => {
    const entries = [entry(midday(-1), { energy: total(1800) })]

    const [energy] = evaluate(entries, {}, week())

    expect(energy?.target).toBeUndefined()
    expect(energy?.share).toBeUndefined()
    expect(energy?.atOrAboveTarget).toBe(false)
  })

  it('carries the target origin through, so the view can attribute it', () => {
    const entries = [entry(midday(-1), { energy: total(1800), vitaminD: total(5) })]

    const evaluations = evaluate(
      entries,
      {
        energy: target('energy', 2000, 'user'),
        vitaminD: target('vitaminD', 20, 'reference'),
      },
      week(),
    )

    expect(evaluations.find((e) => e.nutrient === 'energy')?.origin).toBe('user')
    expect(evaluations.find((e) => e.nutrient === 'vitaminD')?.origin).toBe('reference')
  })

  it('takes intake from the stored snapshots rather than recomputing it', () => {
    // The entry's items say 50 g of oats, but its stored totals say 999. §9
    // forbids recomputing history from the food cache, so 999 is the answer.
    const entries = [entry(midday(-1), { energy: total(999) })]

    const [energy] = evaluate(entries, { energy: target('energy', 2000) }, week())

    expect(energy?.intake.amount).toBe(999)
  })

  it('keeps a nutrient with intake but no target in the result', () => {
    const entries = [entry(midday(-1), { energy: total(1800) })]

    const evaluations = evaluate(entries, {}, week())

    expect(evaluations.map((e) => e.nutrient)).toEqual(['energy'])
  })

  it('omits a nutrient with neither intake nor target', () => {
    const entries = [entry(midday(-1), { energy: total(1800) })]

    const evaluations = evaluate(entries, { energy: target('energy', 2000) }, week())

    // Rendering a row for every registry nutrient would fill the view with
    // nutrients nothing is known about.
    expect(evaluations.map((e) => e.nutrient)).not.toContain('vitaminD')
  })

  it('does not treat a missing value as a zero contribution', () => {
    const entries = [
      entry(midday(-1), { vitaminD: { amount: 0, bySource: {}, missing: 2 } }),
      entry(midday(-2), { vitaminD: total(5) }),
    ]

    const [vitaminD] = evaluate(entries, { vitaminD: target('vitaminD', 20) }, week())

    // The two unknown contributors stay counted as unknown; the total is a
    // floor of 5, not a measurement of 5 (§9).
    expect(vitaminD?.intake.amount).toBe(5)
    expect(vitaminD?.intake.missing).toBe(2)
  })

  it('reads a nutrient with a target but no intake as no data, not as zero', () => {
    const entries = [
      entry(midday(-1), { energy: total(1800) }),
      entry(midday(-2), { energy: total(1900) }),
    ]

    const [vitaminD] = evaluate(
      entries,
      { vitaminD: target('vitaminD', 20, 'reference') },
      week(),
    ).filter((e) => e.nutrient === 'vitaminD')

    // Both entries are contributors that carried nothing for it, so the display
    // rules report no data rather than a measured zero (§3).
    expect(vitaminD?.intake.missing).toBe(2)
    expect(hasNoData(vitaminD!.intake)).toBe(true)
  })

  it('claims nothing when no days are logged', () => {
    const evaluations = evaluate([], { energy: target('energy', 2000, 'user', 4000) }, week())
    const [energy] = evaluations

    // target × 0 is not a target of zero: with no records there is no
    // denominator, so nothing is comparable and nothing may be claimed.
    expect(energy?.target).toBeUndefined()
    expect(energy?.limit).toBeUndefined()
    expect(energy?.share).toBeUndefined()
    expect(energy?.atOrAboveTarget).toBe(false)
    expect(energy?.overLimit).toBe(false)
  })

  it('ignores entries outside the window when scaling', () => {
    const entries = [
      entry(midday(-1), { energy: total(1800) }),
      entry(midday(-30), { energy: total(1800) }),
    ]

    const [energy] = evaluate(entries, { energy: target('energy', 2000) }, week())

    expect(energy?.intake.amount).toBe(1800)
    expect(energy?.target).toBe(2000)
  })
})

describe('byUrgency', () => {
  const evaluation = (
    nutrient: ResolvedTarget['nutrient'],
    amount: number,
    scaledTarget?: number,
    scaledLimit?: number,
  ) => ({
    nutrient,
    intake: total(amount),
    target: scaledTarget,
    limit: scaledLimit,
    origin: 'user' as const,
    share: scaledTarget ? amount / scaledTarget : undefined,
    atOrAboveTarget: scaledTarget !== undefined && amount >= scaledTarget,
    overLimit: scaledLimit !== undefined && amount > scaledLimit,
  })

  it('sorts the largest shortfall first', () => {
    const sorted = byUrgency([
      evaluation('energy', 1900, 2000),
      evaluation('protein', 40, 140),
      evaluation('fat', 60, 70),
    ])

    expect(sorted.map((e) => e.nutrient)).toEqual(['protein', 'fat', 'energy'])
  })

  it('ranks by relative shortfall rather than by absolute amount', () => {
    // Energy is short by 100 kcal and vitamin D by 18 µg. Sorting on the raw
    // difference puts energy first purely because kcal are bigger numbers, and
    // buries the nutrient at 10% of its target.
    const sorted = byUrgency([evaluation('energy', 1900, 2000), evaluation('vitaminD', 2, 20)])

    expect(sorted.map((e) => e.nutrient)).toEqual(['vitaminD', 'energy'])
  })

  it('pins an over-limit nutrient above every shortfall', () => {
    const sorted = byUrgency([evaluation('protein', 0, 140), evaluation('vitaminD', 150, 20, 100)])

    // A shortfall of the entire target still ranks below an exceeded limit.
    expect(sorted.map((e) => e.nutrient)).toEqual(['vitaminD', 'protein'])
  })

  it('orders the furthest over the limit first', () => {
    const sorted = byUrgency([
      evaluation('vitaminD', 110, 20, 100),
      evaluation('energy', 8000, 2000, 4000),
    ])

    expect(sorted.map((e) => e.nutrient)).toEqual(['energy', 'vitaminD'])
  })

  it('puts a nutrient without a target last', () => {
    const sorted = byUrgency([
      evaluation('carbohydrate', 200),
      evaluation('energy', 2100, 2000),
      evaluation('protein', 40, 140),
    ])

    // Nothing can be said about it, so it ranks below the ones already met
    // rather than tying with them.
    expect(sorted.map((e) => e.nutrient)).toEqual(['protein', 'energy', 'carbohydrate'])
  })

  it('leaves the input untouched', () => {
    const evaluations = [evaluation('energy', 1900, 2000), evaluation('protein', 40, 140)]
    const before = evaluations.map((e) => e.nutrient)

    byUrgency(evaluations)

    expect(evaluations.map((e) => e.nutrient)).toEqual(before)
  })
})
