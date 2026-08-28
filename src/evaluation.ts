/**
 * Long-term intake evaluation (§9). Pure functions, no Vue and no Dexie: this is
 * the arithmetic the evaluation view renders, and §17 makes it the priority unit
 * surface because a wrong denominator or a slipped window edge produces numbers
 * that look entirely plausible.
 *
 * ── The rules being implemented, from §9 ──────────────────────────────────
 *
 * 1. A day is local midnight to local midnight — via dates.ts, never by adding
 *    86_400_000, which lands an hour into the wrong day twice a year.
 * 2. Windows are ROLLING: trailing 7 and 30 days. Not calendar weeks.
 * 3. The denominator is `target × daysLogged`, where daysLogged counts days in
 *    the window holding at least one entry. A day with no entries is a missing
 *    record, not a zero-intake day; dividing by elapsed days manufactures a
 *    shortfall out of nothing, which is the silent-zero mistake in a new hat.
 * 4. Coverage and provenance are separate axes. Neither collapses into the other.
 * 5. Two-sided: compare against the scaled target and, where an upperLimit is
 *    known, the scaled limit. Absent limit = no limit known, never inferred.
 * 6. Intake comes from each entry's stored `totals` snapshot via mergeTotals,
 *    never recomputed from the food cache — upstream changes must not rewrite
 *    history.
 * 7. An average meeting the target is a weaker claim than hitting it daily. This
 *    module therefore reports `atOrAboveTarget` and leaves the wording to the
 *    view; nothing here says "met".
 *
 * NOT IMPLEMENTED YET — the spec comes first (§19). Every function below throws.
 */
import type { NutrientKey, NutrientTotal, ResolvedTarget } from './data/nutrients'
import type { LogEntry } from './types'

/** A half-open range of local days: `from` inclusive, `to` exclusive. */
export interface DayWindow {
  from: number
  to: number
  /** Whole local days spanned. 7 for the trailing week. */
  days: number
}

/**
 * How much of the window has records at all (§9's "5 of 7 days logged"). Kept
 * separate from any nutrient figure: coverage is about the record, not the diet.
 */
export interface Coverage {
  logged: number
  days: number
}

/** Where one nutrient stands over a window. */
export interface NutrientEvaluation {
  nutrient: NutrientKey
  /** Merged from the entries' stored snapshots (§9). */
  intake: NutrientTotal
  /** `target × daysLogged`, or undefined when no target is known. */
  target?: number
  /** `upperLimit × daysLogged`, or undefined when no limit is known. */
  limit?: number
  /** Whose number the target is, for what the view is allowed to claim (§3). */
  origin?: ResolvedTarget['origin']
  /** intake / target. Undefined without a target — never 0, never 1. */
  share?: number
  /** True when intake is at or above the scaled target. Not "met" (see 7). */
  atOrAboveTarget: boolean
  /** True only when a limit is known and intake exceeds it. */
  overLimit: boolean
}

/**
 * The trailing `days` local days ending with the day containing `at`, inclusive
 * of that whole day. `trailingWindow(7)` therefore covers today and the six days
 * before it, and `to` is the next local midnight.
 */
export function trailingWindow(days: number, at: number = Date.now()): DayWindow {
  throw new Error(`not implemented: trailingWindow(${days}, ${at})`)
}

/**
 * Distinct local days within the window that hold at least one entry. This is
 * §9's denominator — see rule 3 for why it is not the elapsed day count.
 *
 * Entries outside the window are ignored rather than trusted, so a caller may
 * pass a wider set than it queried.
 */
export function daysLogged(entries: LogEntry[], window: DayWindow): Coverage {
  throw new Error(`not implemented: daysLogged(${entries.length} entries, ${window.days} days)`)
}

/**
 * Evaluates every nutrient that has a target, plus every nutrient the entries
 * carry intake for. A nutrient with neither is absent from the result rather
 * than present with zeroes.
 *
 * Scales each target by the days actually logged, not by the window length.
 */
export function evaluate(
  entries: LogEntry[],
  targets: Partial<Record<NutrientKey, ResolvedTarget>>,
  window: DayWindow,
): NutrientEvaluation[] {
  throw new Error(
    `not implemented: evaluate(${entries.length} entries, ${Object.keys(targets).length} targets, ${window.days} days)`,
  )
}

/**
 * §9's ordering: largest shortfall first — the "what am I missing" view — with
 * anything over a known limit pinned above all of it, because an exceeded limit
 * is more actionable than a small gap.
 *
 * Separate from `evaluate` so the ordering can be asserted on its own.
 */
export function byUrgency(evaluations: NutrientEvaluation[]): NutrientEvaluation[] {
  throw new Error(`not implemented: byUrgency(${evaluations.length} evaluations)`)
}
