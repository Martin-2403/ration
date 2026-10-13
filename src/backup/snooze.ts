/**
 * When the backup prompt was last dismissed (#147), kept beside the last-backup
 * timestamps and for the same reasons (see last-backup.ts): localStorage, a bare
 * cached timestamp, outside every backup and restore, never throws. Losing it
 * only makes the prompt come back sooner, which is the safe way to be wrong.
 */
const KEY = 'ration.backupNudgeSnoozedAt'

/** Epoch milliseconds of the last "Not now", or undefined if there is none. */
export function lastSnoozedAt(): number | undefined {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw === null || raw.trim() === '') return undefined

    const value = Number(raw)

    return Number.isFinite(value) ? value : undefined
  } catch {
    return undefined
  }
}

/** Record a dismissal. Failing to note it must not break the screen. */
export function snoozeNudge(at: number = Date.now()): void {
  try {
    localStorage.setItem(KEY, String(at))
  } catch {
    // The prompt will simply come back at the next log.
  }
}
