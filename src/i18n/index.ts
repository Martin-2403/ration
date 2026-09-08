/**
 * The i18n layer (§14, #13).
 *
 * English-only for the MVP, but the machinery is real rather than a lookup
 * standing in for it: §14's discipline is that every human-readable string is a
 * localized lookup and never data, and a second locale should be a file rather
 * than a refactor.
 *
 * `legacy: false` selects the Composition API mode — the Options-API surface is
 * the v8 compatibility layer and there is nothing here to be compatible with.
 */
import { createI18n } from 'vue-i18n'

import { en, type MessageSchema } from './en'

export const i18n = createI18n<{ message: MessageSchema }, 'en'>({
  legacy: false,
  locale: 'en',
  // Same as `locale` while there is one locale. Kept explicit so adding a second
  // one cannot silently render a key instead of a string.
  fallbackLocale: 'en',
  messages: { en },
})

/**
 * Translation outside a component.
 *
 * Display helpers are plain functions by design (§17: the honesty rules are
 * testable as functions rather than only through markup), so they reach the
 * global instance rather than `useI18n`, which requires a component scope. `t`
 * reads the reactive locale either way, so a computed that calls this still
 * re-evaluates when the locale changes.
 */
export const t = i18n.global.t
