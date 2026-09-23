/**
 * Domain types from §7. Kept separate from db.ts: these describe the model, not
 * how it is stored, and the resolver and UI need them without importing Dexie.
 * Nutrient-level types live in data/nutrients.ts (§3, §5).
 */
import type { NutrientMap, NutrientTotals } from './data/nutrients'

export interface Food {
  id: string
  name: string // display only; localized lookup, not data (§14)
  per100g: NutrientMap // provenance per nutrient (§3)
  barcode?: string
  servingWeight?: number // grams, for per-serving sources
}

export interface MealSlot {
  id: string // stable; LogItem references this, never the label
  label: string // "Fruit"
  kind: 'fixed' | 'variable'
  options: string[] // Food ids — length 1 = fixed, >1 = dropdown
  defaultOptionId: string
  defaultGrams: number // prefilled, editable at log time
}

export interface MealTemplate {
  id: string
  name: string
  slots: MealSlot[]
}

/**
 * An ordered set of meals that normally go together — "a workday" (#52).
 *
 * The meals are referenced by id, not copied: a correction to a meal template
 * has to reach every day that uses it, the same way a corrected food reaches
 * every template naming it. The cost is that a day can name a meal that has
 * since been deleted, which resolves to a reported gap rather than silence.
 */
export interface DayTemplate {
  id: string
  name: string
  /** Meal template ids, in the order they are eaten. Repeats are allowed. */
  mealTemplateIds: string[]
}

// Food by mass or supplement by dose. One union keeps §8's single summing path
// true: nutrientsFor() resolves the quantity at the leaf.
export type LogItem =
  | { kind: 'food'; slotId?: string; foodId: string; grams: number }
  | { kind: 'supplement'; supplementId: string; doses: number; confirmed: boolean }

export interface LogEntry {
  id?: number
  templateId?: string // absent for a quick-log (§7)
  name: string
  timestamp: number // when it was eaten — NOT when the row was written
  createdAt: number
  updatedAt: number // write time; §10 merge resolves last-write-wins on this
  items: LogItem[]
  totals: NutrientTotals // denormalized snapshot at log time (§9)
}

/** A log entry before it is stored: the repository assigns id and timestamps. */
export type NewLogEntry = Omit<LogEntry, 'id' | 'createdAt' | 'updatedAt'>

/** A stored entry, where the id is known. */
export type StoredLogEntry = LogEntry & { id: number }
