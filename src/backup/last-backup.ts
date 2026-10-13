/**
 * When a backup was last handed off, and what it held. Feeds the reminder nudge
 * (#147) and the line in the backup panel.
 *
 * Which export counts: a backup of foods and goals alone is not a backup of what
 * the user would miss. The log is the irreplaceable part, so
 * `lastBackupAt()` (the name the nudge uses) is the time of the last export that
 * INCLUDED log entries, and a partial export never resets it. `lastExport()`
 * reports the latest export of any kind, so the panel can still be honest about
 * a partial one.
 *
 * localStorage, not Dexie, on purpose: these are only cached timestamps. Losing
 * them (a cleared browser takes the database with it anyway) makes the app say
 * "never" and nudge sooner, which is the safe way to be wrong. They also stay out
 * of the data classes, so they are never part of a backup or a restore. Nothing
 * secret is kept here.
 *
 * Reactive for the page: every read touches `revision` and `recordBackup` bumps it,
 * so a computed that calls `lastBackupAt()` re-evaluates once an export is recorded
 * (the restore confirm shows the figure while the export form sits on the same
 * page). A module-level ref rather than an event or polling: nothing to subscribe
 * to or tear down. A write from another tab is not seen until the next read.
 *
 * Never throws: storage can be missing (privacy modes) or full.
 */
import { ref } from 'vue'

const LATEST = 'ration.lastExport'
const WITH_LOG = 'ration.lastExportWithLog'

/** The class every "did I back up my data" question is really about. */
const LOG_CLASS = 'logEntries'

export interface ExportRecord {
  /** Epoch milliseconds. */
  at: number
  /** Class names the file held. */
  classes: string[]
}

/** Bumped by every recorded backup; reading it is what makes the getters reactive. */
const revision = ref(0)

function read(key: string): ExportRecord | undefined {
  void revision.value

  try {
    const raw = localStorage.getItem(key)
    if (raw === null) return undefined

    const value: unknown = JSON.parse(raw)
    if (typeof value !== 'object' || value === null) return undefined

    const { at, classes } = value as Partial<ExportRecord>

    return typeof at === 'number' &&
      Number.isFinite(at) &&
      Array.isArray(classes) &&
      classes.every((name) => typeof name === 'string')
      ? { at, classes }
      : undefined
  } catch {
    return undefined
  }
}

function write(key: string, record: ExportRecord): void {
  try {
    localStorage.setItem(key, JSON.stringify(record))
  } catch {
    // The backup happened; failing to note it must not turn that into an error.
  }
}

/** The latest export of any kind, partial or not. */
export function lastExport(): ExportRecord | undefined {
  return read(LATEST)
}

/** The latest export that included log entries, with what else it held. */
export function lastLogExport(): ExportRecord | undefined {
  return read(WITH_LOG)
}

/**
 * Epoch milliseconds of the last export that included log entries, or undefined
 * if there is none. An export without the log does not move this.
 */
export function lastBackupAt(): number | undefined {
  return lastLogExport()?.at
}

/** Call only once the file has actually left the app, never for a cancelled share. */
export function recordBackup(classes: readonly string[], at: number = Date.now()): void {
  const record = { at, classes: [...classes] }

  write(LATEST, record)
  if (record.classes.includes(LOG_CLASS)) write(WITH_LOG, record)

  revision.value++
}
