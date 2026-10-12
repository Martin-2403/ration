/**
 * Applying a decrypted backup to the database (§10). Replace only: the classes
 * the backup carries are swapped wholesale, the others are left alone.
 *
 * Rows go in exactly as the backup holds them. They deliberately bypass the
 * repositories in db.ts, whose `put` stamps `updatedAt` with the write time —
 * a restore that did so would make every restored row look freshly edited and
 * defeat §10's last-write-wins merge. The rules the repositories enforce at the
 * write boundary (a named day with meals, a positive goal target on a goal
 * nutrient) are checked here instead, before anything is written.
 */
import type { Table } from 'dexie'

import { USER_GOAL_NUTRIENTS } from '../data/nutrients'
import { db } from '../db'
import type { BackupClass, BackupPayload, JsonValue } from './envelope'

export type RestoreErrorCode =
  /** A row in the backup is not something this app can store. Nothing was written. */
  | 'invalid-row'
  /** The database refused the write. The transaction was rolled back. */
  | 'write-failed'

export class RestoreError extends Error {
  readonly code: RestoreErrorCode
  constructor(code: RestoreErrorCode, message: string) {
    super(message)
    this.name = 'RestoreError'
    this.code = code
  }
}

type Row = Record<string, unknown>

/** Row counts per class name. */
export type ClassCounts = Record<string, number>

const isRow = (v: unknown): v is Row => typeof v === 'object' && v !== null && !Array.isArray(v)
const isText = (v: unknown): v is string => typeof v === 'string'
const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

type KnownClass = 'foods' | 'mealTemplates' | 'dayTemplates' | 'logEntries' | 'goals'

interface ClassSpec {
  /** The field that is the row's primary key. */
  key: string
  table: () => Table
  /** What is wrong with the row, or undefined when it can be stored. */
  check: (row: Row) => string | undefined
}

/** What each class needs of a row. */
const CLASSES: Record<KnownClass, ClassSpec> = {
  foods: {
    key: 'id',
    table: () => db.foods,
    check: (row) => {
      if (!isText(row.id) || row.id === '') return 'has no id'
      if (!isText(row.name)) return 'has no name'
      if (!isRow(row.per100g)) return 'has no nutrient values'
      if (row.barcode !== undefined && !isText(row.barcode)) return 'has an invalid barcode'
      if (row.servingWeight !== undefined && !isCount(row.servingWeight)) {
        return 'has an invalid serving weight'
      }
      if (!isCount(row.updatedAt)) return 'has no update time'
    },
  },
  mealTemplates: {
    key: 'id',
    table: () => db.mealTemplates,
    check: (row) => {
      if (!isText(row.id) || row.id === '') return 'has no id'
      if (!isText(row.name)) return 'has no name'
      if (!Array.isArray(row.slots) || !row.slots.every(isRow)) return 'has invalid slots'
      if (!isCount(row.updatedAt)) return 'has no update time'
    },
  },
  dayTemplates: {
    key: 'id',
    table: () => db.dayTemplates,
    // The same two rules as the repository's put: an unnamed day cannot be told
    // apart in a list, and a day with no meals runs to completion logging nothing.
    check: (row) => {
      if (!isText(row.id) || row.id === '') return 'has no id'
      if (!isText(row.name) || row.name.trim().length === 0) return 'has no name'
      if (
        !Array.isArray(row.mealTemplateIds) ||
        row.mealTemplateIds.length === 0 ||
        !row.mealTemplateIds.every(isText)
      ) {
        return 'names no meals'
      }
      if (!isCount(row.updatedAt)) return 'has no update time'
    },
  },
  logEntries: {
    key: 'id',
    table: () => db.logEntries,
    check: (row) => {
      if (!Number.isInteger(row.id)) return 'has no id'
      if (!isText(row.name)) return 'has no name'
      if (row.templateId !== undefined && !isText(row.templateId)) return 'has an invalid template'
      if (!isCount(row.timestamp)) return 'has no time eaten'
      if (!isCount(row.createdAt)) return 'has no creation time'
      if (!isCount(row.updatedAt)) return 'has no update time'
      if (!Array.isArray(row.items) || !row.items.every(isRow)) return 'has invalid items'
      if (!isRow(row.totals)) return 'has no totals'
    },
  },
  goals: {
    key: 'nutrient',
    table: () => db.nutrientGoals,
    // The same two rules as the repository's put.
    check: (row) => {
      if (
        !isText(row.nutrient) ||
        !(USER_GOAL_NUTRIENTS as readonly string[]).includes(row.nutrient)
      ) {
        return 'is not a nutrient a goal may be set for'
      }
      if (!isCount(row.target) || row.target <= 0) return 'has a target that is not above zero'
      if (!isCount(row.updatedAt)) return 'has no update time'
    },
  },
}

const isKnown = (name: BackupClass): name is KnownClass =>
  Object.prototype.hasOwnProperty.call(CLASSES, name)

/** Class names this build can restore. */
export const RESTORABLE_CLASSES = Object.keys(CLASSES) as KnownClass[]

/** Classes in the payload that this build has no table for (written by a newer build). */
export function unknownClasses(payload: BackupPayload): string[] {
  return Object.keys(payload).filter((name) => !isKnown(name))
}

function rowsOf(payload: BackupPayload, name: KnownClass): JsonValue[] {
  return payload[name] ?? []
}

/**
 * Checks every row of every restorable class. Throws RestoreError naming the
 * first bad row; returns normally only when the whole payload can be written.
 */
export function validatePayload(payload: BackupPayload): void {
  for (const name of RESTORABLE_CLASSES) {
    const rows = payload[name]
    if (rows === undefined) continue

    const { key, check } = CLASSES[name]
    const seen = new Set<unknown>()

    rows.forEach((row, index) => {
      const fail = (what: string) => {
        throw new RestoreError('invalid-row', `${name} row ${index + 1} ${what}.`)
      }

      if (!isRow(row)) return fail('is not an object')
      const problem = check(row)
      if (problem) return fail(problem)
      if (seen.has(row[key])) return fail(`repeats the ${key} of an earlier row`)
      seen.add(row[key])
    })
  }
}

/** Row counts of what is on this device now, for the classes named. */
export async function localCounts(names: BackupClass[]): Promise<ClassCounts> {
  const counts: ClassCounts = {}

  for (const name of names) {
    if (isKnown(name)) counts[name] = await CLASSES[name].table().count()
  }

  return counts
}

/** Row counts of what the payload carries, restorable classes only. */
export function payloadCounts(payload: BackupPayload): ClassCounts {
  const counts: ClassCounts = {}

  for (const name of RESTORABLE_CLASSES) {
    if (payload[name] !== undefined) counts[name] = rowsOf(payload, name).length
  }

  return counts
}

/**
 * Replaces the local data of every class the backup carries with the backup's
 * rows. All or nothing: the payload is validated first, then one transaction
 * clears and refills the affected tables, so a failure part-way rolls back.
 * Classes absent from the backup are not touched. Returns what was written.
 */
export async function replaceFromBackup(given: BackupPayload): Promise<ClassCounts> {
  // IndexedDB cannot clone a Vue reactive Proxy, and a payload held in component
  // state is one. The payload is plain JSON by construction, so a round-trip is safe.
  const payload = JSON.parse(JSON.stringify(given)) as BackupPayload

  validatePayload(payload)

  const names = RESTORABLE_CLASSES.filter((name) => payload[name] !== undefined)
  const tables = names.map((name) => CLASSES[name].table())

  try {
    await db.transaction('rw', tables, async () => {
      for (const name of names) {
        const table = CLASSES[name].table()
        await table.clear()
        await table.bulkPut(rowsOf(payload, name))
      }
    })
  } catch (error) {
    throw new RestoreError(
      'write-failed',
      `The database refused the restore: ${error instanceof Error ? error.message : String(error)}`,
    )
  }

  return payloadCounts(payload)
}
