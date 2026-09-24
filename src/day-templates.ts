/**
 * Day templates: an ordered set of meals that normally go together (§7, #52).
 *
 * The reading is the quick-log one — a day names meals, and running it walks
 * them through the ordinary meal builder so every amount is still confirmed and
 * every entry is a real logged entry (#52). Nothing here writes a log entry or
 * knows when a meal was eaten.
 *
 * Unlike foods and meal templates there is no seed path: a usual day is
 * personal in a way a porridge recipe is not, and there would be nothing to
 * compose one from on a fresh install. The *meals* it names still resolve
 * through §13's two paths, so a day can be built out of seeds.
 */
import { dayTemplates } from './db'
import { findMealTemplate } from './template-lookup'
import type { DayTemplate, MealTemplate } from './types'

/** One meal of a day, and whatever its id resolved to. */
export interface ResolvedMeal {
  id: string
  /** Absent when the meal template has been deleted since the day named it. */
  template?: MealTemplate
}

export interface ResolvedDayTemplate {
  /** Every meal the day names, in order, repeats included. */
  meals: ResolvedMeal[]
  /** The ids that resolved to nothing, in order, without repeats. */
  missing: string[]
}

/**
 * Days that still name a meal, given the days already on hand.
 *
 * Takes the list rather than reading the store itself: LogView already holds
 * one in a ref for the days screen, and re-querying Dexie for something the
 * caller already has would be a second source of the same truth (#101).
 */
export function daysUsingMeal(days: readonly DayTemplate[], mealId: string): DayTemplate[] {
  return days.filter((day) => day.mealTemplateIds.includes(mealId))
}

/** Every stored day, alphabetical. */
export async function listDayTemplates(): Promise<DayTemplate[]> {
  const stored = await dayTemplates.list()

  return stored.sort((a, b) => a.name.localeCompare(b.name))
}

export function findDayTemplate(id: string): Promise<DayTemplate | undefined> {
  return dayTemplates.get(id)
}

/**
 * Resolves the meals a day names.
 *
 * A meal that no longer exists is reported, never dropped: silently running
 * two meals of a three-meal day would log an incomplete day that looks
 * complete, which is the same failure as rendering an unknown nutrient as zero
 * (§3). The caller decides whether to offer the rest or refuse the day.
 */
export async function resolveDayTemplate(template: DayTemplate): Promise<ResolvedDayTemplate> {
  const meals = await Promise.all(
    template.mealTemplateIds.map(async (id) => ({ id, template: await findMealTemplate(id) })),
  )

  const missing = meals.filter((meal) => meal.template === undefined).map((meal) => meal.id)

  return { meals, missing: [...new Set(missing)] }
}

/**
 * A copy under a new id, so "rest day" can start from "workday" (#52).
 *
 * The meal ids are shared rather than copied, which is the point of referencing
 * them: correcting porridge corrects it in both days. Only the name and the
 * order are the clone's own.
 */
export function cloneDayTemplate(original: DayTemplate, name: string): DayTemplate {
  return {
    id: crypto.randomUUID(),
    name: name.trim(),
    mealTemplateIds: [...original.mealTemplateIds],
  }
}

/**
 * Moves one meal within the order, returning a new array.
 *
 * Index arithmetic rather than a swap: dragging breakfast to the end should
 * leave the others in their old order, and a swap would put dinner where
 * breakfast was. An index outside the array leaves the order untouched — the
 * caller's buttons are the guard, and a silent no-op beats a reshuffle.
 */
export function moveMeal(ids: readonly string[], from: number, to: number): string[] {
  const moved = [...ids]

  if (from < 0 || from >= moved.length || to < 0 || to >= moved.length) return moved

  const [meal] = moved.splice(from, 1)
  moved.splice(to, 0, meal!)

  return moved
}
