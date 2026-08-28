/**
 * Parsing numeric input typed by a person.
 *
 * Deliberately not `<input type="number">`. That control behaves differently
 * across browsers in ways that matter here:
 *
 * - unparseable text may stay visible while `value` reports `''`, so the app
 *   cannot tell "blank" from "the user typed nonsense" and silently records no
 *   data for a field with content in it
 * - `validity.badInput` is the only signal for that case, and it is not reported
 *   consistently
 * - a keystroke leaving the parsed value unchanged may fire no `input` event
 * - the decimal comma, which is the separator in German (§14), is rejected
 *   outright in some locales and accepted in others
 *
 * With `type="text"` and `inputmode="decimal"` we see the raw string, decide for
 * ourselves, and can always say why something was refused. It is also testable
 * without a real browser, unlike everything above.
 */

export type ParsedAmount =
  { kind: 'blank' } | { kind: 'number'; value: number } | { kind: 'not-a-number' }

/**
 * Digits with an optional single decimal separator, either a dot or a comma.
 * Exponent notation is rejected on purpose: nobody types `1e3` grams, and
 * accepting it makes a typo look like a very large number.
 */
const NUMERIC = /^-?(\d+([.,]\d*)?|[.,]\d+)$/

export function parseAmount(raw: string): ParsedAmount {
  const trimmed = raw.trim()

  // Blank is meaningful, not an error: it is how the UI says "no data" (§3).
  if (trimmed === '') return { kind: 'blank' }

  if (!NUMERIC.test(trimmed)) return { kind: 'not-a-number' }

  const value = Number(trimmed.replace(',', '.'))

  // Belt and braces: the pattern should already have excluded these.
  if (!Number.isFinite(value)) return { kind: 'not-a-number' }

  // Sign is left to the caller so it can distinguish "not a number" from
  // "negative", which need different messages.
  return { kind: 'number', value }
}
