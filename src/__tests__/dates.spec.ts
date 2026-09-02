import { describe, expect, it } from 'vitest'

import {
  addLocalDays,
  localMiddayFromISODate,
  nextLocalMidnight,
  startOfLocalDay,
  toISODate,
} from '../dates'

const isLocalMidnight = (ts: number) => {
  const d = new Date(ts)

  return (
    d.getHours() === 0 && d.getMinutes() === 0 && d.getSeconds() === 0 && d.getMilliseconds() === 0
  )
}

describe('startOfLocalDay', () => {
  it('returns local midnight of the containing day', () => {
    const midday = new Date(2026, 7, 27, 13, 45, 30, 500).getTime()

    expect(isLocalMidnight(startOfLocalDay(midday))).toBe(true)
    expect(new Date(startOfLocalDay(midday)).getDate()).toBe(27)
  })

  it('is a no-op on a value that is already midnight', () => {
    const midnight = new Date(2026, 7, 27, 0, 0, 0, 0).getTime()

    expect(startOfLocalDay(midnight)).toBe(midnight)
  })

  it('keeps a late-evening time on the same day', () => {
    // A 23:30 snack belongs to that day, not the next one (§9).
    const lateSnack = new Date(2026, 7, 27, 23, 30).getTime()

    expect(new Date(startOfLocalDay(lateSnack)).getDate()).toBe(27)
  })

  it('keeps a small-hours time on the previous calendar day only if it is after midnight', () => {
    // 00:30 on the 28th is the 28th. §9 draws the boundary at midnight, not at
    // some later "day starts when you wake up" hour.
    const earlyHours = new Date(2026, 7, 28, 0, 30).getTime()

    expect(new Date(startOfLocalDay(earlyHours)).getDate()).toBe(28)
  })
})

describe('nextLocalMidnight', () => {
  it('returns midnight of the following day', () => {
    const at = new Date(2026, 7, 27, 13, 0).getTime()
    const next = nextLocalMidnight(at)

    expect(isLocalMidnight(next)).toBe(true)
    expect(new Date(next).getDate()).toBe(28)
  })

  it('lands on midnight even across a DST change', () => {
    // Whatever the runner's timezone, the boundary must be midnight — which is
    // why this uses setDate rather than adding 86_400_000. In a DST-observing
    // zone a fixed offset lands at 23:00 or 01:00 twice a year.
    for (const month of [0, 2, 3, 6, 9, 10]) {
      const at = new Date(2026, month, 15, 12, 0).getTime()

      expect(isLocalMidnight(nextLocalMidnight(at)), `month ${month}`).toBe(true)
    }
  })

  it('is strictly after the start of the day', () => {
    const at = new Date(2026, 7, 27, 13, 0).getTime()

    expect(nextLocalMidnight(at)).toBeGreaterThan(startOfLocalDay(at))
  })
})

describe('addLocalDays', () => {
  it('moves forward by whole days', () => {
    const at = new Date(2026, 7, 27, 13, 0).getTime()

    expect(new Date(addLocalDays(at, 3)).getDate()).toBe(30)
  })

  it('moves backward and across a month boundary', () => {
    const at = new Date(2026, 7, 2, 13, 0).getTime()
    const back = new Date(addLocalDays(at, -3))

    expect(back.getMonth()).toBe(6)
    expect(back.getDate()).toBe(30)
  })

  it('always returns midnight', () => {
    const at = new Date(2026, 7, 27, 17, 42).getTime()

    expect(isLocalMidnight(addLocalDays(at, 1))).toBe(true)
    expect(isLocalMidnight(addLocalDays(at, -1))).toBe(true)
  })

  it('agrees with nextLocalMidnight for a single day forward', () => {
    const at = new Date(2026, 7, 27, 9, 15).getTime()

    expect(addLocalDays(at, 1)).toBe(nextLocalMidnight(at))
  })
})

describe('toISODate', () => {
  it('reports the local calendar date', () => {
    expect(toISODate(new Date(2026, 7, 27, 13, 45).getTime())).toBe('2026-08-27')
  })

  it('pads single-digit months and days', () => {
    expect(toISODate(new Date(2026, 0, 5, 9, 0).getTime())).toBe('2026-01-05')
  })

  it('reports the local day late in the evening, not the UTC one', () => {
    // toISOString would roll this into the 28th anywhere ahead of UTC, which is
    // the whole reason this is built from local parts.
    expect(toISODate(new Date(2026, 7, 27, 23, 30).getTime())).toBe('2026-08-27')
  })

  it('round-trips with localMiddayFromISODate', () => {
    const iso = toISODate(new Date(2026, 9, 25, 4, 0).getTime())

    expect(toISODate(localMiddayFromISODate(iso)!)).toBe(iso)
  })
})

describe('localMiddayFromISODate', () => {
  it('lands at midday on the named local day', () => {
    const at = localMiddayFromISODate('2026-08-27')!

    expect(new Date(at).getDate()).toBe(27)
    expect(new Date(at).getHours()).toBe(12)
  })

  // One test per month rather than a loop, so a failure names the month it
  // broke on instead of just the first one it hit.
  it.each(['2026-01-15', '2026-03-15', '2026-04-15', '2026-07-15', '2026-10-15', '2026-11-15'])(
    'names %s as the same day whatever the runner timezone',
    (iso) => {
      // `new Date('2026-08-27')` is UTC midnight, which is the 26th anywhere
      // behind UTC. Parsing by parts is what keeps this true.
      expect(toISODate(localMiddayFromISODate(iso)!)).toBe(iso)
    },
  )

  // The last Sunday of March and of October, where EU clocks move.
  it.each(['2026-03-29', '2026-10-25'])('sits inside %s across a DST change', (iso) => {
    const at = localMiddayFromISODate(iso)!

    expect(at).toBeGreaterThanOrEqual(startOfLocalDay(at))
    expect(at).toBeLessThan(nextLocalMidnight(at))
  })

  // A cleared field must block the write rather than pick a day for the user.
  it.each(['', '27.08.2026', '2026-8-27', 'today', '2026-08'])(
    'refuses %s, which is not a date',
    (value) => {
      expect(localMiddayFromISODate(value)).toBeUndefined()
    },
  )

  it('refuses a date that does not exist', () => {
    // The Date constructor rolls 31 February into March rather than refusing.
    expect(localMiddayFromISODate('2026-02-31')).toBeUndefined()
    expect(localMiddayFromISODate('2026-13-01')).toBeUndefined()
  })
})
