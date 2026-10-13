/**
 * When to ask for a backup (#147): one pure decision, and the numbers it turns on.
 *
 * Backups are manual because a web app cannot run on a schedule or write a file
 * unprompted, so the app asks after a log. Martin chose a prompt over automation
 * and wants to revisit it if it proves tedious. The cadence and the amount of
 * friction are the thing under test, so every knob is a constant in this file and
 * nothing else decides: tuning the prompt means editing the block below.
 *
 * The decision never claims the data is safe or at risk beyond what the research
 * supports (#8). A prompt is a reminder, not a verdict.
 */

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR

/*
 * ---- The knobs ------------------------------------------------------------
 *
 * Sources for the iOS reasoning below, retrieved 2026-10-12 (research on #8):
 * - WebKit, "Full Third-Party Cookie Blocking and More" (2020-03-24),
 *   https://webkit.org/blog/10218/full-third-party-cookie-blocking-and-more/
 *   Safari deletes a site's script-writable storage, IndexedDB and localStorage
 *   included, "after seven days of Safari use without user interaction on the
 *   site". Home Screen web apps "are not part of Safari and thus have their own
 *   counter of days of use".
 * - WebKit Tracking Prevention, https://webkit.org/tracking-prevention/
 * - WebKit, "Updates to Storage Policy" (2023-08-10),
 *   https://webkit.org/blog/14403/updates-to-storage-policy/ (does not mention
 *   the seven-day rule, and no source says it was removed).
 *
 * Not confirmed from a primary source: whether the seven-day rule still applies
 * to non-installed Safari sites in current releases. That is why the cadence stays
 * on everywhere and only the iOS tab gets stronger copy.
 *
 * Re-check these when #8 is closed. The sources justify treating an iOS browser
 * tab differently; the particular numbers are design choices, not sourced values.
 */

/** A backup that included the log is "recent" for this long; older, or none, is overdue. */
export const BACKUP_MAX_AGE_MS = 1 * DAY

/**
 * The same, in an iOS browser tab: the highest-risk place for the data to live,
 * so asking earlier. Set equal to BACKUP_MAX_AGE_MS to remove the difference.
 */
export const IOS_TAB_BACKUP_MAX_AGE_MS = 12 * HOUR

/**
 * Outside an iOS tab, the log must hold data at least this old before the prompt
 * appears: a day-one user with a single meal has little to lose, and asking at
 * once would be the most tedious moment to ask. Age is the oldest entry's
 * createdAt (when it was written, not when it was eaten). An iOS tab ignores
 * this and asks from the first log. Set to 0 to ask from the first log everywhere.
 */
export const MIN_DATA_AGE_MS = 1 * DAY

/** After "Not now", stay quiet for this long. Raise it if the prompt is tedious. */
export const SNOOZE_MS = 1 * DAY

/**
 * Where "Back up now" lands: the hash on the Settings route that brings the
 * export form into view and focuses its first field.
 */
export const BACKUP_SECTION_HASH = '#backup'

/* ---------------------------------------------------------------------------- */

/**
 * Which wording to show:
 * - 'first': never backed up the log, and the log holds data at least a day old.
 * - 'overdue': backed up before, but not recently.
 * - 'ios-tab': in an iOS browser tab, either case, with the install hint.
 */
export type NudgeVariant = 'first' | 'overdue' | 'ios-tab'

export interface NudgeInput {
  /** Epoch milliseconds. Passed in so the decision is pure. */
  now: number
  /** The last export that included the log, or undefined if there never was one. */
  lastBackupAt: number | undefined
  /**
   * When the oldest log entry was written (createdAt), or undefined if the log is
   * empty or could not be read.
   */
  oldestEntryAt: number | undefined
  /** When the prompt was last dismissed, or undefined. */
  lastSnoozedAt: number | undefined
  /** Running as an installed app rather than in a browser tab. */
  installed: boolean
  platform: 'ios' | 'other'
}

/** Undefined means: say nothing. */
export function shouldNudge(input: NudgeInput): NudgeVariant | undefined {
  const { now, lastBackupAt, oldestEntryAt, lastSnoozedAt, installed, platform } = input
  const iosTab = platform === 'ios' && !installed

  const maxAge = iosTab ? IOS_TAB_BACKUP_MAX_AGE_MS : BACKUP_MAX_AGE_MS

  if (lastBackupAt !== undefined && now - lastBackupAt < maxAge) return undefined

  // A snooze stamped in the future (the clock moved back) is ignored rather than
  // honoured: asking once too often is the safe way to be wrong.
  if (lastSnoozedAt !== undefined && lastSnoozedAt <= now && now - lastSnoozedAt < SNOOZE_MS) {
    return undefined
  }

  if (iosTab) return 'ios-tab'

  // Nothing worth backing up yet: no entry, or only entries younger than the knob.
  if (oldestEntryAt === undefined || now - oldestEntryAt < MIN_DATA_AGE_MS) return undefined

  return lastBackupAt === undefined ? 'first' : 'overdue'
}
