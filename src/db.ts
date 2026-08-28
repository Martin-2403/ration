/**
 * Persistence (§2, §10). The UI never touches Dexie directly — it goes through
 * the repository interfaces below, so the storage layer can change without
 * touching views.
 *
 * Only the entities that exist today get tables. Supplements, schedules and lab
 * results arrive in their own layers behind a version bump; Dexie adds tables
 * and indexes without losing data.
 *
 * Seed foods are NOT stored here. They ship in data/foods.ts and stay in the
 * module (§13): storing them would make them evictable by the LRU and would
 * freeze a wrong value on every install that already copied it.
 */
import Dexie, { type EntityTable } from 'dexie'

import {
  isGoalNutrient,
  type GoalNutrientKey,
  type NewUserGoal,
  type UserGoal,
} from './data/nutrients'
import type { Food, LogEntry, MealTemplate, NewLogEntry, StoredLogEntry } from './types'

const db = new Dexie('ration') as Dexie & {
  foods: EntityTable<Food, 'id'>
  mealTemplates: EntityTable<MealTemplate, 'id'>
  // Typed by the stored shape, where the id is always present. Using LogEntry
  // here would make Dexie infer add() as returning `number | undefined`,
  // because LogEntry.id is optional for entries that have not been saved yet.
  logEntries: EntityTable<StoredLogEntry, 'id'>
  nutrientGoals: EntityTable<UserGoal, 'nutrient'>
}

db.version(1).stores({
  // barcode is indexed for the resolver's cache hit (§4). Not unique: the same
  // barcode can legitimately resolve differently per region (§14).
  foods: 'id, barcode',
  mealTemplates: 'id',
  // timestamp drives day and rolling-window queries (§9); updatedAt drives the
  // last-write-wins merge on restore (§10).
  logEntries: '++id, timestamp, updatedAt',
})

// Only the added table is listed: Dexie carries the earlier version's schema
// forward, so an upgrade adds this store and leaves existing data alone.
db.version(2).stores({
  // Keyed by nutrient id, one row per goal. A single settings row would turn
  // clearing one goal into a read-modify-write over all of them, and two tabs
  // saving at once would drop a write; a delete of one row cannot.
  nutrientGoals: 'nutrient',
})

export { db }

/**
 * Strips Vue reactivity before a write.
 *
 * IndexedDB serialises with structured clone, which throws DataCloneError on a
 * Proxy — and anything held in a ref or a store is one. `toRaw` only unwraps the
 * top level, so a nested array like LogEntry.items would still fail. A JSON
 * round-trip is safe here because every stored shape is plain JSON data by
 * design; keep it that way (no Date, no Map, no class instances in §7's types).
 */
function plain<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

export interface FoodRepository {
  get(id: string): Promise<Food | undefined>
  findByBarcode(barcode: string): Promise<Food | undefined>
  /** Upsert. The resolver writes back whatever it resolved (§4). */
  put(food: Food): Promise<void>
}

export interface MealTemplateRepository {
  list(): Promise<MealTemplate[]>
  get(id: string): Promise<MealTemplate | undefined>
  put(template: MealTemplate): Promise<void>
  remove(id: string): Promise<void>
}

export interface LogRepository {
  /** Stamps createdAt and updatedAt, returns the new id. */
  add(entry: NewLogEntry): Promise<number>
  /** Bumps updatedAt, leaves createdAt alone. Used by a user edit (§7). */
  update(entry: StoredLogEntry): Promise<void>
  remove(id: number): Promise<void>
  get(id: number): Promise<LogEntry | undefined>
  /** Inclusive of `from`, exclusive of `to`, sorted oldest first. */
  between(from: number, to: number): Promise<LogEntry[]>
}

export interface NutrientGoalRepository {
  list(): Promise<UserGoal[]>
  get(nutrient: GoalNutrientKey): Promise<UserGoal | undefined>
  /** Upsert. Stamps updatedAt, and rejects anything the app must not store. */
  put(goal: NewUserGoal): Promise<void>
  remove(nutrient: GoalNutrientKey): Promise<void>
}

export const foods: FoodRepository = {
  get: (id) => db.foods.get(id),
  findByBarcode: (barcode) => db.foods.where('barcode').equals(barcode).first(),
  async put(food) {
    await db.foods.put(plain(food))
  },
}

export const mealTemplates: MealTemplateRepository = {
  list: () => db.mealTemplates.toArray(),
  get: (id) => db.mealTemplates.get(id),
  async put(template) {
    await db.mealTemplates.put(plain(template))
  },
  async remove(id) {
    await db.mealTemplates.delete(id)
  },
}

export const log: LogRepository = {
  // The repository stamps both timestamps rather than trusting callers: §10's
  // merge is only correct if updatedAt is always the real write time.
  add(entry) {
    const at = Date.now()
    return db.logEntries.add(plain({ ...entry, createdAt: at, updatedAt: at }))
  },

  async update(entry) {
    await db.logEntries.put(plain({ ...entry, updatedAt: Date.now() }))
  },

  async remove(id) {
    await db.logEntries.delete(id)
  },

  get: (id) => db.logEntries.get(id),

  between: (from, to) =>
    db.logEntries.where('timestamp').between(from, to, true, false).sortBy('timestamp'),
}

export const nutrientGoals: NutrientGoalRepository = {
  list: () => db.nutrientGoals.toArray(),

  get: (nutrient) => db.nutrientGoals.get(nutrient),

  // Both checks guard the write boundary, which is where a restored backup or an
  // older build's data would arrive (§10). A target of zero or below is not a
  // goal the evaluation can say anything useful about, and a micronutrient goal
  // is deliberately not offered at all (§20).
  async put(goal) {
    if (!isGoalNutrient(goal.nutrient)) {
      throw new Error(`${goal.nutrient} is not a nutrient the user may set a goal for`)
    }

    if (!Number.isFinite(goal.target) || goal.target <= 0) {
      throw new RangeError(`a goal target must be a positive number, got ${goal.target}`)
    }

    await db.nutrientGoals.put(plain({ ...goal, updatedAt: Date.now() }))
  },

  async remove(nutrient) {
    await db.nutrientGoals.delete(nutrient)
  },
}
