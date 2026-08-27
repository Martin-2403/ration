/**
 * Day boundaries. §9 fixes a day as local midnight to local midnight, so every
 * window query goes through these rather than doing its own arithmetic.
 */

/** Local midnight at or before `at`. */
export function startOfLocalDay(at: number = Date.now()): number {
  const d = new Date(at)
  d.setHours(0, 0, 0, 0)

  return d.getTime()
}

/**
 * The next local midnight after the day containing `at` — the exclusive upper
 * bound of that day.
 *
 * Uses setDate rather than adding 86_400_000: a day spanning a DST change is 23
 * or 25 hours long, and a fixed offset would put the boundary an hour into the
 * wrong day twice a year.
 */
export function nextLocalMidnight(at: number = Date.now()): number {
  const d = new Date(startOfLocalDay(at))
  d.setDate(d.getDate() + 1)

  return d.getTime()
}

/** Shifts by whole local days, preserving midnight across DST changes. */
export function addLocalDays(at: number, days: number): number {
  const d = new Date(startOfLocalDay(at))
  d.setDate(d.getDate() + days)

  return d.getTime()
}
