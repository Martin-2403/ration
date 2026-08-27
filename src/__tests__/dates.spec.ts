import { describe, expect, it } from 'vitest'

import { addLocalDays, nextLocalMidnight, startOfLocalDay } from '../dates'

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
