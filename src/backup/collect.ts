/**
 * Reading what a backup carries out of the database (§10), one class at a time.
 *
 * The rows go in exactly as stored: no restamping, no id remapping, no cleanup.
 * `updatedAt` is the write time that last-write-wins on restore depends on, and a
 * log entry's auto-increment id is what a restore matches it by, so a backup
 * that touched either would corrupt the very merge it exists for.
 *
 * Reading is separate from encrypting (envelope.ts) and from writing back
 * (restore); this module only knows which table each class name maps to.
 */
import { db } from '../db'
import type { BackupPayload, JsonValue } from './envelope'

/**
 * The data classes this build can back up, in the order they are listed to the
 * user. The names are the keys of the payload and appear in the envelope header,
 * so renaming one breaks every existing backup. Restore reads this list too.
 */
export const BACKUP_CLASSES = [
  'foods',
  'logEntries',
  'mealTemplates',
  'dayTemplates',
  'goals',
] as const

export type CollectedClass = (typeof BACKUP_CLASSES)[number]

/** Class name -> the Dexie table behind it. `goals` is the `nutrientGoals` table. */
const tableFor = (name: CollectedClass) => {
  switch (name) {
    case 'foods':
      return db.foods
    case 'logEntries':
      return db.logEntries
    case 'mealTemplates':
      return db.mealTemplates
    case 'dayTemplates':
      return db.dayTemplates
    case 'goals':
      return db.nutrientGoals
  }
}

/** How many rows each class holds right now. */
export async function countClasses(): Promise<Record<CollectedClass, number>> {
  const counts = await db.transaction('r', db.tables, () =>
    Promise.all(BACKUP_CLASSES.map((name) => tableFor(name).count())),
  )

  return Object.fromEntries(BACKUP_CLASSES.map((name, i) => [name, counts[i]])) as Record<
    CollectedClass,
    number
  >
}

/**
 * The chosen classes, read in one transaction so the file is a single moment
 * rather than a blend of reads either side of a write. Every stored row is plain
 * JSON by design (db.ts `plain`), so the cast to JsonValue is a statement of that
 * invariant, not a conversion.
 */
export async function collectBackup(classes: readonly CollectedClass[]): Promise<BackupPayload> {
  const chosen = BACKUP_CLASSES.filter((name) => classes.includes(name))

  const rows = await db.transaction('r', db.tables, () =>
    Promise.all(chosen.map((name) => tableFor(name).toArray())),
  )

  return Object.fromEntries(chosen.map((name, i) => [name, rows[i] as unknown as JsonValue[]]))
}
