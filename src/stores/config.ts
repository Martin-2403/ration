/**
 * Nutrient config (§5): which nutrients the app reports on, and what each one is
 * measured against. Reads through Dexie's liveQuery like the log store, so a
 * goal saved in another tab shows up without a refetch.
 *
 * The store holds no arithmetic — precedence and provenance live in targets.ts.
 */
import { liveQuery, type Subscription } from 'dexie'
import { defineStore } from 'pinia'
import { computed, onScopeDispose, ref } from 'vue'

import {
  NUTRIENTS,
  USER_GOAL_NUTRIENTS,
  type GoalNutrientKey,
  type NutrientKey,
  type UserGoal,
} from '../data/nutrients'
import { nutrientGoals } from '../db'
import { goalsByNutrient, resolveTargets } from '../targets'

export const useConfigStore = defineStore('config', () => {
  const goals = ref<UserGoal[]>([])
  const loading = ref(true)

  const subscription: Subscription = liveQuery(() => nutrientGoals.list()).subscribe({
    next: (rows) => {
      goals.value = rows
      loading.value = false
    },
  })

  onScopeDispose(() => subscription.unsubscribe())

  /**
   * Every nutrient the app reports on. Derived from the registry rather than
   * stored: a per-user tracked set needs a UI to be worth anything, and there is
   * no reason yet for one install to track a different set from the next. The
   * computed is where a stored set would later plug in.
   */
  const trackedNutrients = computed<NutrientKey[]>(() => Object.keys(NUTRIENTS) as NutrientKey[])

  /** Nutrients the user may set a goal for — what the settings UI offers (§20). */
  const goalNutrients = computed<readonly GoalNutrientKey[]>(() => USER_GOAL_NUTRIENTS)

  /**
   * Targets for the tracked set, each carrying its origin. A tracked nutrient
   * with neither a goal nor a reference figure is absent, not zeroed (§3).
   */
  const targets = computed(() =>
    resolveTargets(trackedNutrients.value, goalsByNutrient(goals.value)),
  )

  /** Validation lives at the repository's write boundary; this may throw. */
  async function setGoal(nutrient: GoalNutrientKey, target: number) {
    await nutrientGoals.put({ nutrient, target })
  }

  /** Clears the goal, which falls the nutrient back to the reference table. */
  async function clearGoal(nutrient: GoalNutrientKey) {
    await nutrientGoals.remove(nutrient)
  }

  return {
    goals,
    loading,
    trackedNutrients,
    goalNutrients,
    targets,
    setGoal,
    clearGoal,
  }
})
