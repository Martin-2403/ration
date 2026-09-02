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
 * 8. With no days logged there is no denominator, so there is no comparison:
 *    targets read as absent rather than being scaled to zero, which would
 *    otherwise report every nutrient as reached.
 */
import type { NutrientKey, NutrientTotal, ResolvedTarget } from './data/nutrients'
import { addLocalDays, nextLocalMidnight, startOfLocalDay } from './dates'
import { mergeTotals } from './totals'
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
  // The day containing `at` is part of the window, so the exclusive bound is the
  // next midnight rather than this one — otherwise today's intake never counts.
  const to = nextLocalMidnight(at)

  // addLocalDays, not `to - days * 86_400_000`: a day spanning a DST change is
  // 23 or 25 hours long, and the fixed offset lands in the wrong day twice a
  // year, stretching the window to an extra day or shrinking it by one.
  return { from: addLocalDays(to, -days), to, days }
}

/**
 * Distinct local days within the window that hold at least one entry. This is
 * §9's denominator — see rule 3 for why it is not the elapsed day count.
 *
 * Entries outside the window are ignored rather than trusted, so a caller may
 * pass a wider set than it queried.
 */
export function daysLogged(entries: LogEntry[], window: DayWindow): Coverage {
  // A set of local midnights rather than a walk over the window: it counts the
  // days that actually hold something, which is the denominator §9 asks for, and
  // it cannot drift the way stepping by a fixed 86_400_000 does across DST.
  const days = new Set<number>()

  for (const entry of entries) {
    if (entry.timestamp < window.from || entry.timestamp >= window.to) continue

    days.add(startOfLocalDay(entry.timestamp))
  }

  return { logged: days.size, days: window.days }
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
  const inWindow = entries.filter(
    (entry) => entry.timestamp >= window.from && entry.timestamp < window.to,
  )
  const intakeByNutrient = mergeTotals(inWindow.map((entry) => entry.totals))
  const coverage = daysLogged(inWindow, window)

  const nutrientKeys = new Set<NutrientKey>()
  for (const key in targets) {
    nutrientKeys.add(key as NutrientKey)
  }
  for (const key in intakeByNutrient) {
    nutrientKeys.add(key as NutrientKey)
  }

  const evaluations: NutrientEvaluation[] = []
  for (const nutrient of nutrientKeys) {
    const intake = intakeByNutrient[nutrient]
    const resolvedTarget = targets[nutrient]

    if (!intake && !resolvedTarget) {
      continue
    }

    // A target the entries carry no value for is not an intake of zero: the
    // entries in the window are contributors that had nothing for it, which is
    // what `missing` counts, and the display rules then read it as no data (§3).
    const intakeTotal: NutrientTotal = intake ?? {
      amount: 0,
      bySource: {},
      missing: inWindow.length,
    }

    // Scaled only when there is something to scale by. Zero days logged means no
    // denominator, so nothing is comparable and both figures read as absent —
    // multiplying by zero would report every target as reached (rule 8).
    const scaledTarget =
      resolvedTarget && coverage.logged > 0 ? resolvedTarget.target * coverage.logged : undefined
    const scaledLimit =
      resolvedTarget?.upperLimit !== undefined && coverage.logged > 0
        ? resolvedTarget.upperLimit * coverage.logged
        : undefined

    const comparable = scaledTarget !== undefined && scaledTarget > 0

    evaluations.push({
      nutrient,
      intake: intakeTotal,
      target: scaledTarget,
      limit: scaledLimit,
      origin: resolvedTarget?.origin,
      share: comparable ? intakeTotal.amount / scaledTarget! : undefined,
      atOrAboveTarget: comparable ? intakeTotal.amount >= scaledTarget! : false,
      overLimit: scaledLimit !== undefined && scaledLimit > 0 && intakeTotal.amount > scaledLimit,
    })
  }

  return evaluations
}

/**
 * §9's ordering: largest shortfall first — the "what am I missing" view — with
 * anything over a known limit pinned above all of it, because an exceeded limit
 * is more actionable than a small gap.
 *
 * Separate from `evaluate` so the ordering can be asserted on its own.
 */
export function byUrgency(evaluations: NutrientEvaluation[]): NutrientEvaluation[] {
  /**
   * The fraction of the target still missing: 1 when nothing has been logged
   * against a known target, 0 once it is reached. Relative rather than absolute
   * because the amounts are not comparable — an energy gap is thousands of kcal
   * and a selenium gap is tens of µg, so ranking by the raw difference sorts by
   * unit size and buries every micronutrient under the macros.
   *
   * -1 for a nutrient with no target, which puts it below everything that can be
   * ranked at all rather than tying it with the ones already met.
   */
  const unmetShare = (evaluation: NutrientEvaluation): number => {
    if (evaluation.target === undefined || evaluation.target <= 0) return -1

    return Math.max(1 - evaluation.intake.amount / evaluation.target, 0)
  }

  /** How far past a known limit, as a fraction of it. 0 when not over. */
  const excessShare = (evaluation: NutrientEvaluation): number => {
    if (!evaluation.overLimit || evaluation.limit === undefined || evaluation.limit <= 0) return 0

    return evaluation.intake.amount / evaluation.limit - 1
  }

  return [...evaluations].sort((a, b) => {
    // An exceeded limit is more actionable than any shortfall (§9), so it pins
    // to the top regardless of how the rest compare.
    if (a.overLimit !== b.overLimit) return a.overLimit ? -1 : 1

    if (a.overLimit && b.overLimit) {
      const excessDelta = excessShare(b) - excessShare(a)
      if (excessDelta !== 0) return excessDelta
    }

    const unmetDelta = unmetShare(b) - unmetShare(a)
    if (unmetDelta !== 0) return unmetDelta

    // Alphabetical last, so the order is stable rather than dependent on the
    // iteration order of the target map.
    return a.nutrient.localeCompare(b.nutrient)
  })
}
