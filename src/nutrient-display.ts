/**
 * Turning totals into what the UI is allowed to claim (§9, §15).
 *
 * Kept out of the components so the honesty rules are testable as functions
 * rather than only through rendered markup.
 */
import { NUTRIENT_LABELS } from './data/nutrient-labels.en'
import { NUTRIENTS, type NutrientKey, type NutrientTotal } from './data/nutrients'

export function labelFor(key: NutrientKey): string {
  return NUTRIENT_LABELS[key]
}

export function unitFor(key: NutrientKey): string {
  return NUTRIENTS[key].unit
}

/** Rounds for display only — stored values keep full precision (§7). */
export function formatAmount(key: NutrientKey, amount: number): string {
  return amount.toFixed(NUTRIENTS[key].decimals)
}

/**
 * True when nothing is known: no contributor supplied a value, though at least
 * one was asked. Renders as "no data", never as a zero (§3).
 */
export function hasNoData(total: NutrientTotal): boolean {
  return total.missing > 0 && Object.keys(total.bySource).length === 0
}

/**
 * True when a real figure exists but some contributors had none, so the total is
 * a floor rather than a measurement. The UI must not present it as complete.
 */
export function isPartial(total: NutrientTotal): boolean {
  return total.missing > 0 && Object.keys(total.bySource).length > 0
}

/**
 * Share of the total that came from ingredient-based estimates (§9's "40% of
 * that from estimated values"). 0 when nothing is known, so callers can treat
 * it as "no estimate involved" without a special case.
 */
export function estimatedShare(total: NutrientTotal): number {
  if (total.amount === 0) return 0

  return (total.bySource['off-estimated'] ?? 0) / total.amount
}

/** Whole percent, for display. */
export function estimatedPercent(total: NutrientTotal): number {
  return Math.round(estimatedShare(total) * 100)
}
