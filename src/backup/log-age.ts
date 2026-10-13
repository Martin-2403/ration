import { db } from '../db'

/**
 * When the oldest log entry was written, or undefined if the log is empty (or
 * cannot be read), for the backup prompt's "is there anything worth backing up
 * yet" rule (#147).
 *
 * `createdAt` is not indexed, and adding an index would mean a schema migration
 * for a prompt. Entries get an auto-incrementing id as they are written, so the
 * lowest id, one primary-key read, is the oldest in the ordinary case. After a
 * restore that merged entries from another device an id can be out of step with
 * its age; that makes the prompt slightly early or late, never wrong about
 * whether there is data. Never throws: an unreadable log reads as nothing to
 * back up, which only delays a reminder.
 */
export async function oldestEntryAt(): Promise<number | undefined> {
  try {
    return (await db.logEntries.toCollection().first())?.createdAt
  } catch {
    return undefined
  }
}
