/**
 * Applying a decrypted backup to the database (§10), by replace or by merge.
 * Replace swaps the classes the backup carries wholesale; merge keeps what is on
 * this device and takes the backup's records where they are newer. Classes the
 * backup does not carry are left alone either way.
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
import { SEED_TEMPLATES } from '../data/foods'
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

/**
 * A nutrient value as §3 stores it: a number and where it came from. An unknown
 * nutrient is `{ value: 0, source: 'unknown' }`, so a bare number is never a
 * value. The source is only required to be text, and the nutrient keys are not
 * matched against this build's registry: a backup from a build that knows more
 * of either must still restore.
 */
const isNutrientValue = (v: unknown): boolean =>
  isRow(v) && isCount(v.value) && isText(v.source) && (v.at === undefined || isCount(v.at))

const isNutrientMap = (v: unknown): boolean => isRow(v) && Object.values(v).every(isNutrientValue)

/** A stored total: the sum of known contributions, a per-source breakdown, and how many were missing. */
const isNutrientTotal = (v: unknown): boolean =>
  isRow(v) && isCount(v.amount) && isCount(v.missing) && isRow(v.bySource)

const isNutrientTotals = (v: unknown): boolean =>
  isRow(v) && Object.values(v).every(isNutrientTotal)

/** One item of a log entry, by the two kinds of LogItem. */
function isLogItem(v: unknown): boolean {
  if (!isRow(v)) return false

  if (v.kind === 'food') {
    return isText(v.foodId) && isCount(v.grams) && (v.slotId === undefined || isText(v.slotId))
  }

  if (v.kind === 'supplement') {
    return isText(v.supplementId) && isCount(v.doses) && typeof v.confirmed === 'boolean'
  }

  return false
}

const isMealSlot = (v: unknown): boolean =>
  isRow(v) &&
  isText(v.id) &&
  isText(v.label) &&
  (v.kind === 'fixed' || v.kind === 'variable') &&
  Array.isArray(v.options) &&
  v.options.every(isText)

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
      if (!isNutrientMap(row.per100g)) return 'has invalid nutrient values'
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
      if (!Array.isArray(row.slots) || !row.slots.every(isMealSlot)) return 'has invalid slots'
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
      if (!Array.isArray(row.items) || !row.items.every(isLogItem)) return 'has invalid items'
      if (!isNutrientTotals(row.totals)) return 'has invalid totals'
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

/** How a backup is applied: swap the classes wholesale, or merge record by record. */
export type RestoreMode = 'replace' | 'merge'

/**
 * Checks every row of every restorable class, then that every meal a restored
 * day names can be found. Throws RestoreError naming the first problem; returns
 * normally only when the whole payload can be written. `now` is the clock the
 * future-dated check reads; tests pass their own.
 */
export async function validatePayload(
  payload: BackupPayload,
  mode: RestoreMode = 'replace',
  now: number = Date.now(),
): Promise<void> {
  checkRows(payload, now)
  await checkMealReferences(payload, mode)
}

/**
 * A restored day must not name a meal that cannot be found: it would run with a
 * gap the user never made. A meal resolves against the backup's own meal
 * templates when it carries them, otherwise against those on this device, and
 * always against the seed templates that ship with the app (§13), as
 * template-lookup does. A merge keeps this device's meals, so there a meal
 * resolves against the backup's and this device's together: the merged result.
 * (Every backup day is checked, including one that will lose to a newer local
 * day: the stricter reading, so a backup that cannot be fully resolved is
 * refused rather than half trusted.) A log entry's templateId is not checked: entries are
 * snapshots and read fine after their template is gone.
 */
async function checkMealReferences(payload: BackupPayload, mode: RestoreMode): Promise<void> {
  const days = payload.dayTemplates
  if (days === undefined) return

  const known = new Set<unknown>(SEED_TEMPLATES.map((template) => template.id))
  const fromBackup = payload.mealTemplates?.map((meal) => (meal as Row).id)

  if (fromBackup !== undefined) for (const id of fromBackup) known.add(id)

  if (fromBackup === undefined || mode === 'merge') {
    for (const id of await db.mealTemplates.toCollection().primaryKeys()) known.add(id)
  }

  for (const day of days as Row[]) {
    const missing = (day.mealTemplateIds as string[]).find((id) => !known.has(id))

    if (missing !== undefined) {
      throw new RestoreError(
        'invalid-row',
        `Day template "${String(day.name)}" names a meal template (${missing}) that is not in the backup or on this device.`,
      )
    }
  }
}

/**
 * How far ahead of this device's clock a row's `updatedAt` may be. A merge keeps
 * the larger `updatedAt`, so a far-future stamp would win every later merge
 * forever. A day of slack lets a backup from a device whose clock runs a little
 * fast restore; anything beyond that is refused.
 */
const MAX_CLOCK_LEAD = 24 * 60 * 60 * 1000

function checkRows(payload: BackupPayload, now: number): void {
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
      // Every class's check has already required updatedAt to be a number.
      if ((row.updatedAt as number) > now + MAX_CLOCK_LEAD) return fail('is dated in the future')
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
export async function replaceFromBackup(
  given: BackupPayload,
  now: number = Date.now(),
): Promise<ClassCounts> {
  // IndexedDB cannot clone a Vue reactive Proxy, and a payload held in component
  // state is one. The payload is plain JSON by construction, so a round-trip is safe.
  const payload = JSON.parse(JSON.stringify(given)) as BackupPayload

  await validatePayload(payload, 'replace', now)

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

/** What a merge did, or would do, to one class: each record of the backup lands in exactly one. */
export interface MergeCounts {
  /** Only in the backup, so now on this device too. */
  added: number
  /** In both, and the backup's was written later: the backup's replaced this device's. */
  updated: number
  /** In both and this device's is as new or newer (identical records included): left as it was. */
  kept: number
}

export type MergeResult = Record<string, MergeCounts>

interface ClassPlan {
  counts: MergeCounts
  /** Rows to write under the key they carry. */
  put: Row[]
  /** Rows to write under a key the table assigns (log entries only). */
  add: Row[]
}

const newPlan = (): ClassPlan => ({ counts: { added: 0, updated: 0, kept: 0 }, put: [], add: [] })

/**
 * Last write wins on `updatedAt`, the write time. A tie keeps the local row. The
 * newer of the two is decided by the time each device saved it, so a device with
 * a wrong clock can win; validation only refuses stamps more than a day ahead of
 * this device's own clock (MAX_CLOCK_LEAD).
 */
const backupIsNewer = (incoming: Row, local: Row) =>
  (incoming.updatedAt as number) > (local.updatedAt as number)

/** Classes keyed by something both devices mint the same way: an id, a nutrient. */
async function planByKey(name: KnownClass, rows: Row[]): Promise<ClassPlan> {
  const { key, table } = CLASSES[name]
  const local = new Map(((await table().toArray()) as Row[]).map((row) => [row[key], row]))
  const plan = newPlan()

  for (const row of rows) {
    const mine = local.get(row[key])

    if (mine === undefined) {
      plan.counts.added++
      plan.put.push(row)
    } else if (backupIsNewer(row, mine)) {
      plan.counts.updated++
      plan.put.push(row)
    } else {
      plan.counts.kept++
    }
  }

  return plan
}

/**
 * How a merge matches log entries.
 *
 * A log entry's `id` is an auto-increment that is only unique per device: two
 * devices routinely hold different entries under the same id, so the id alone
 * cannot say whether a backup entry is this device's entry or a stranger. What
 * does not change over an entry's life is `createdAt`, the millisecond the
 * repository stamped when it was logged. (`timestamp` and `name` can be edited,
 * and `updatedAt` always is.) A backup entry is the same record as a local one
 * when:
 *
 * 1. the `createdAt` and the `id` both match: the same row, however either side
 *    has edited it since; or
 * 2. the `createdAt`, `timestamp` and `name` all match under different ids: the
 *    entry an earlier merge re-numbered here, which nothing has edited since.
 *
 * The same record resolves by last write wins on `updatedAt`, and a winning
 * backup entry is written under the local id. Anything else is a different
 * entry and is always added, never written over a local one: it keeps its id
 * when no local entry holds that id, and otherwise is added without one so the
 * table assigns a fresh id. The kept-id writes go first, so a fresh id is
 * always above every id this merge preserves. A local entry matches at most one
 * backup entry, so two backup entries are never folded into one.
 *
 * Merging the same backup again therefore adds nothing. The rule can err in
 * only one direction: an entry that was re-numbered here and then edited
 * (`timestamp` or `name`) before the same backup is merged again is not
 * recognised, and comes in as a second copy. That duplicates a record; it never
 * overwrites one. Rows are otherwise written exactly as stored.
 */
async function planLogEntries(rows: Row[]): Promise<ClassPlan> {
  const local = (await CLASSES.logEntries.table().toArray()) as Row[]
  const idsInUse = new Set(local.map((row) => row.id))
  const byCreated = new Map<unknown, Row[]>()
  const claimed = new Set<unknown>()
  const plan = newPlan()

  for (const row of local) {
    byCreated.set(row.createdAt, [...(byCreated.get(row.createdAt) ?? []), row])
  }

  for (const row of rows) {
    const candidates = (byCreated.get(row.createdAt) ?? []).filter(
      (candidate) => !claimed.has(candidate.id),
    )
    const mine =
      candidates.find((candidate) => candidate.id === row.id) ??
      candidates.find(
        (candidate) => candidate.timestamp === row.timestamp && candidate.name === row.name,
      )

    if (mine !== undefined) {
      claimed.add(mine.id)

      if (backupIsNewer(row, mine)) {
        plan.counts.updated++
        plan.put.push({ ...row, id: mine.id })
      } else {
        plan.counts.kept++
      }
    } else {
      plan.counts.added++

      if (idsInUse.has(row.id)) {
        // Another entry holds this id here: let the table assign one.
        const fresh = { ...row }
        delete fresh.id
        plan.add.push(fresh)
      } else {
        plan.put.push(row)
      }
    }
  }

  return plan
}

async function planMerge(payload: BackupPayload, names: KnownClass[]) {
  const plans = new Map<KnownClass, ClassPlan>()

  for (const name of names) {
    const rows = rowsOf(payload, name) as Row[]
    plans.set(
      name,
      name === 'logEntries' ? await planLogEntries(rows) : await planByKey(name, rows),
    )
  }

  return plans
}

const mergeResult = (plans: Map<KnownClass, ClassPlan>): MergeResult =>
  Object.fromEntries([...plans].map(([name, plan]) => [name, plan.counts]))

const restorableNames = (payload: BackupPayload) =>
  RESTORABLE_CLASSES.filter((name) => payload[name] !== undefined)

/** What a merge would add, update and keep. Reads only; the confirm step shows it. */
export async function previewMerge(given: BackupPayload): Promise<MergeResult> {
  const payload = JSON.parse(JSON.stringify(given)) as BackupPayload
  const names = restorableNames(payload)

  return db.transaction(
    'r',
    names.map((name) => CLASSES[name].table()),
    async () => mergeResult(await planMerge(payload, names)),
  )
}

/**
 * Merges the backup into this device, record by record, last write wins on
 * `updatedAt` (§10). A record only in the backup is added, one only here is
 * kept, and one in both goes to whichever was written later; a tie keeps this
 * device's. Nothing is ever deleted: deletions are not tracked, so a record
 * removed here comes back from the backup.
 *
 * Same guarantees as a replace: the payload is validated first and the writes
 * share one transaction, so a failure leaves the database as it was; rows are
 * written exactly as the backup holds them, never restamped. Log entries are
 * matched by identity rather than id; see planLogEntries. Returns the counts.
 */
export async function mergeFromBackup(
  given: BackupPayload,
  now: number = Date.now(),
): Promise<MergeResult> {
  const payload = JSON.parse(JSON.stringify(given)) as BackupPayload

  await validatePayload(payload, 'merge', now)

  const names = restorableNames(payload)

  try {
    return await db.transaction(
      'rw',
      names.map((name) => CLASSES[name].table()),
      async () => {
        // Planned inside the transaction, so what was compared is what is written over.
        const plans = await planMerge(payload, names)

        for (const [name, plan] of plans) {
          const table = CLASSES[name].table()
          await table.bulkPut(plan.put)
          for (const row of plan.add) await table.add(row)
        }

        return mergeResult(plans)
      },
    )
  } catch (error) {
    throw new RestoreError(
      'write-failed',
      `The database refused the restore: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
}
