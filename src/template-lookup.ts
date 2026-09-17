/**
 * §13's two-path lookup for meal templates, alongside the one food-lookup.ts
 * does for foods (#96).
 *
 * Seeds ship in the module and are never stored, so a template id can live in
 * either place. Seeds are checked first: they travel with the app version, so a
 * corrected template in a release should win rather than be shadowed by
 * anything cached.
 */
import { SEED_TEMPLATES } from './data/foods'
import { mealTemplates } from './db'
import type { MealTemplate } from './types'

/** A template with which of the two paths it came from. */
export interface MealTemplateMatch {
  template: MealTemplate
  origin: 'seed' | 'stored'
}

const seedTemplate = (id: string) => SEED_TEMPLATES.find((template) => template.id === id)

export async function findMealTemplate(id: string): Promise<MealTemplate | undefined> {
  return seedTemplate(id) ?? (await mealTemplates.get(id))
}

/**
 * Every template a user can log, seeds and stored together, alphabetical.
 *
 * A stored template sharing a seed's id is dropped rather than listed — the
 * same precedence findMealTemplate applies, so a surface cannot offer a
 * shadowed copy of a template a release has since corrected.
 */
export async function listMealTemplates(): Promise<MealTemplateMatch[]> {
  const stored = await mealTemplates.list()
  const seeded = new Set(SEED_TEMPLATES.map((template) => template.id))

  return [
    ...SEED_TEMPLATES.map((template) => ({ template, origin: 'seed' as const })),
    ...stored
      .filter((template) => !seeded.has(template.id))
      .map((template) => ({ template, origin: 'stored' as const })),
  ].sort((a, b) => a.template.name.localeCompare(b.template.name))
}
