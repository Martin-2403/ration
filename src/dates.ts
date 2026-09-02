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

/**
 * A local calendar date as `yyyy-mm-dd`, which is the value format of a date
 * input. Built from the local parts rather than toISOString, which converts to
 * UTC first and therefore reports the wrong day either side of midnight.
 */
export function toISODate(at: number = Date.now()): string {
  const d = new Date(at)
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')

  return `${d.getFullYear()}-${month}-${day}`
}

/**
 * Midday on the local day a `yyyy-mm-dd` value names, or undefined when the
 * value is not a date. Undefined rather than a fallback: a cleared date field
 * must block a write, not silently pick a day.
 *
 * Parsed by parts rather than `new Date(iso)`, which reads a bare date as UTC
 * midnight — that lands on the previous local day for anywhere behind UTC.
 * Midday, because it sits inside the day whether that day is 23, 24 or 25 hours
 * long, so a §9 window can never disagree about which day an entry belongs to.
 */
export function localMiddayFromISODate(iso: string): number | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!match) return undefined

  const [, year, month, day] = match
  const at = new Date(Number(year), Number(month) - 1, Number(day), 12)

  // Rejects 2026-02-31 and friends, which the Date constructor rolls over
  // into the following month rather than refusing.
  if (at.getMonth() !== Number(month) - 1 || at.getDate() !== Number(day)) return undefined

  return at.getTime()
}
