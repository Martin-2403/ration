/**
 * Resolving what intake is measured against (§5, §9).
 *
 * No Vue imports, like totals.ts: precedence and provenance are rules worth
 * testing as plain functions rather than through a store.
 *
 * The reference table is a parameter with a default rather than a hard import,
 * so tests can resolve against a table with figures in it while #16 keeps the
 * real one empty.
 */
import {
  isGoalNutrient,
  type NutrientKey,
  type ReferenceTarget,
  type ResolvedTarget,
  type UserGoal,
} from './data/nutrients'
import { REFERENCE_TARGETS } from './data/rdi'

export type GoalMap = Partial<Record<NutrientKey, UserGoal>>
export type ReferenceTable = Partial<Record<NutrientKey, ReferenceTarget>>

/** Indexes stored goal rows for lookup, newest write per nutrient last. */
export function goalsByNutrient(rows: readonly UserGoal[]): GoalMap {
  return Object.fromEntries(rows.map((goal) => [goal.nutrient, goal]))
}

/**
 * A user goal beats the reference figure; the upper limit comes from the
 * reference table either way (see ResolvedTarget — a ceiling is a safety
 * figure, not a preference).
 *
 * `undefined` means no target is known for this nutrient. Callers must render
 * that as "no target": not as 0, and not as met (§3).
 */
export function resolveTarget(
  nutrient: NutrientKey,
  goals: GoalMap,
  reference: ReferenceTable = REFERENCE_TARGETS,
): ResolvedTarget | undefined {
  const referenced = reference[nutrient]
  const upperLimit = referenced?.upperLimit
  const goal = goals[nutrient]

  // A stored goal for a nutrient that is no longer user-settable is ignored
  // rather than honoured: the allowlist can shrink, and rows outlive it.
  if (goal && isGoalNutrient(nutrient)) {
    return { nutrient, target: goal.target, origin: 'user', upperLimit }
  }

  if (referenced) {
    return { nutrient, target: referenced.target, origin: 'reference', upperLimit }
  }

  return undefined
}

/**
 * Targets for a set of nutrients. Nutrients with no target are absent from the
 * map rather than present with a zero, the same shape rule as NutrientTotals.
 */
export function resolveTargets(
  nutrients: readonly NutrientKey[],
  goals: GoalMap,
  reference: ReferenceTable = REFERENCE_TARGETS,
): Partial<Record<NutrientKey, ResolvedTarget>> {
  const resolved: Partial<Record<NutrientKey, ResolvedTarget>> = {}

  for (const nutrient of nutrients) {
    const target = resolveTarget(nutrient, goals, reference)

    if (target) resolved[nutrient] = target
  }

  return resolved
}
