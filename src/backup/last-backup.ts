/**
 * When the last backup was handed off, for the reminder nudge (#147) and the
 * line in the backup panel.
 *
 * localStorage, not Dexie, on purpose: this is only a cached timestamp. Losing it
 * (a cleared browser takes the database with it anyway) makes the app say "never"
 * and nudge sooner, which is the safe way to be wrong. It also stays out of the
 * data classes, so it is never part of a backup or a restore. Nothing secret is
 * kept here.
 *
 * Never throws: storage can be missing (privacy modes) or full.
 */
const KEY = 'ration.lastBackupAt'

/** Epoch milliseconds of the last successful export, or undefined if there is none. */
export function lastBackupAt(): number | undefined {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw === null) return undefined

    const at = Number(raw)

    return Number.isFinite(at) ? at : undefined
  } catch {
    return undefined
  }
}

/** Call only once the file has actually left the app, never for a cancelled share. */
export function recordBackup(at: number = Date.now()): void {
  try {
    localStorage.setItem(KEY, String(at))
  } catch {
    // The backup happened; failing to note it must not turn that into an error.
  }
}
