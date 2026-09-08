import { describe, expect, it } from 'vitest'
import { createI18n } from 'vue-i18n'

import { NUTRIENTS, type NutrientKey } from '../data/nutrients'
import { en } from '../i18n/en'
import { labelFor } from '../nutrient-display'

const nutrientKeys = Object.keys(NUTRIENTS) as NutrientKey[]

describe('i18n', () => {
  it.each(nutrientKeys)('resolves a label for %s', (key) => {
    // Asserted against the message rather than "not the key": vue-i18n echoes
    // an unresolved key back, so a broken key convention returns a plausible
    // looking string instead of throwing, and a `not.toBe(key)` check passes on
    // the wrong prefix. Completeness of the messages object is a type error
    // (see en.ts); what this pins is that the lookup is actually wired.
    expect(labelFor(key)).toBe(en.nutrient[key])
  })

  it('works without mounting a component', () => {
    // Display helpers are plain functions (§17), so they reach the global
    // instance rather than useI18n. If that ever changes to a composable, every
    // unit test touching a label starts needing a component scope.
    expect(labelFor('vitaminD')).toBe('Vitamin D')
  })

  it('falls back to English rather than rendering a key', () => {
    // The guard for whenever a second locale lands: a de.ts missing a string
    // must read English, not `nutrient.protein`. Asserted against a throwaway
    // instance so the test does not mutate the app-wide locale.
    const partial = createI18n({
      legacy: false,
      locale: 'de',
      fallbackLocale: 'en',
      messages: { en, de: { nutrient: {} } },
    })

    expect(partial.global.t('nutrient.protein')).toBe('Protein')
  })
})
