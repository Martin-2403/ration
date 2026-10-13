import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  BACKUP_MAX_AGE_MS,
  IOS_TAB_BACKUP_MAX_AGE_MS,
  MIN_DATA_AGE_MS,
  SNOOZE_MS,
  isBackupStale,
  shouldNudge,
  type NudgeInput,
} from '../backup/nudge'
import { lastSnoozedAt, snoozeNudge } from '../backup/snooze'

const NOW = Date.UTC(2026, 9, 12, 12, 0, 0)

const input = (over: Partial<NudgeInput> = {}): NudgeInput => ({
  now: NOW,
  lastBackupAt: NOW - 1000,
  oldestEntryAt: NOW - 30 * 24 * 60 * 60 * 1000,
  lastSnoozedAt: undefined,
  installed: false,
  platform: 'other',
  ...over,
})

describe('shouldNudge', () => {
  it('asks for a first backup when there has never been one', () => {
    expect(shouldNudge(input({ lastBackupAt: undefined }))).toBe('first')
  })

  it('stays quiet while the last backup of the log is recent', () => {
    expect(shouldNudge(input({ lastBackupAt: NOW - BACKUP_MAX_AGE_MS + 1 }))).toBeUndefined()
  })

  it('calls a backup overdue once it is as old as the cadence', () => {
    expect(shouldNudge(input({ lastBackupAt: NOW - BACKUP_MAX_AGE_MS }))).toBe('overdue')
  })

  describe('how old the data is', () => {
    const never = { lastBackupAt: undefined }

    it('stays quiet when the log is empty', () => {
      expect(shouldNudge(input({ ...never, oldestEntryAt: undefined }))).toBeUndefined()
    })

    it('stays quiet while the oldest entry is younger than the minimum', () => {
      expect(
        shouldNudge(input({ ...never, oldestEntryAt: NOW - MIN_DATA_AGE_MS + 1 })),
      ).toBeUndefined()
    })

    it('asks once the oldest entry is as old as the minimum', () => {
      expect(shouldNudge(input({ ...never, oldestEntryAt: NOW - MIN_DATA_AGE_MS }))).toBe('first')
    })

    it('applies to an overdue prompt as well', () => {
      const overdue = { lastBackupAt: NOW - 2 * BACKUP_MAX_AGE_MS, oldestEntryAt: NOW - 1000 }

      expect(shouldNudge(input(overdue))).toBeUndefined()
    })

    it('does not apply in an iOS tab, which asks from the first log', () => {
      expect(shouldNudge(input({ ...never, platform: 'ios', oldestEntryAt: NOW - 1000 }))).toBe(
        'ios-tab',
      )
      expect(shouldNudge(input({ ...never, platform: 'ios', oldestEntryAt: undefined }))).toBe(
        'ios-tab',
      )
    })

    it('does apply to an installed iOS app', () => {
      expect(
        shouldNudge(
          input({ ...never, platform: 'ios', installed: true, oldestEntryAt: NOW - 1000 }),
        ),
      ).toBeUndefined()
    })
  })

  describe('snooze', () => {
    it('holds a never-backed-up prompt back, and lets it return', () => {
      const base = input({ lastBackupAt: undefined })

      expect(shouldNudge({ ...base, lastSnoozedAt: NOW - SNOOZE_MS + 1 })).toBeUndefined()
      expect(shouldNudge({ ...base, lastSnoozedAt: NOW - SNOOZE_MS })).toBe('first')
    })

    it('holds an overdue prompt back', () => {
      const base = input({ lastBackupAt: NOW - 3 * BACKUP_MAX_AGE_MS })

      expect(shouldNudge({ ...base, lastSnoozedAt: NOW - 1000 })).toBeUndefined()
    })

    it('ignores a snooze from the future instead of staying quiet for good', () => {
      expect(shouldNudge(input({ lastBackupAt: undefined, lastSnoozedAt: NOW + SNOOZE_MS }))).toBe(
        'first',
      )
    })
  })

  describe('platform', () => {
    const stale = NOW - BACKUP_MAX_AGE_MS - 1

    it.each([
      ['an iOS tab, never backed up', 'ios', false, undefined, 'ios-tab'],
      ['an iOS tab, overdue', 'ios', false, stale, 'ios-tab'],
      ['installed on iOS, never backed up', 'ios', true, undefined, 'first'],
      ['installed on iOS, overdue', 'ios', true, stale, 'overdue'],
      ['another platform in a tab, overdue', 'other', false, stale, 'overdue'],
      ['another platform, installed, never', 'other', true, undefined, 'first'],
    ] as const)('%s', (_name, platform, installed, lastBackupAt, expected) => {
      expect(shouldNudge(input({ platform, installed, lastBackupAt }))).toBe(expected)
    })

    it('asks sooner in an iOS tab than anywhere else', () => {
      const between = NOW - (IOS_TAB_BACKUP_MAX_AGE_MS + BACKUP_MAX_AGE_MS) / 2

      expect(IOS_TAB_BACKUP_MAX_AGE_MS).toBeLessThan(BACKUP_MAX_AGE_MS)
      expect(shouldNudge(input({ platform: 'ios', lastBackupAt: between }))).toBe('ios-tab')
      expect(shouldNudge(input({ platform: 'ios', installed: true, lastBackupAt: between }))).toBe(
        undefined,
      )
      expect(shouldNudge(input({ platform: 'other', lastBackupAt: between }))).toBeUndefined()
    })

    it('stays quiet on iOS when the backup is recent enough', () => {
      expect(
        shouldNudge(input({ platform: 'ios', lastBackupAt: NOW - IOS_TAB_BACKUP_MAX_AGE_MS + 1 })),
      ).toBeUndefined()
    })

    it('snoozes the iOS prompt like any other', () => {
      expect(
        shouldNudge(input({ platform: 'ios', lastBackupAt: undefined, lastSnoozedAt: NOW - 1000 })),
      ).toBeUndefined()
    })
  })
})

describe('isBackupStale', () => {
  const stale = (over: Partial<NudgeInput> = {}) => isBackupStale(input(over))

  it('is stale with no backup, and at the cadence but not before it', () => {
    expect(stale({ lastBackupAt: undefined })).toBe(true)
    expect(stale({ lastBackupAt: NOW - BACKUP_MAX_AGE_MS + 1 })).toBe(false)
    expect(stale({ lastBackupAt: NOW - BACKUP_MAX_AGE_MS })).toBe(true)
  })

  it('uses the shorter cadence in an iOS tab only: 18 hours is stale there, not elsewhere', () => {
    const eighteenHours = NOW - 18 * 60 * 60 * 1000

    expect(stale({ lastBackupAt: eighteenHours, platform: 'ios', installed: false })).toBe(true)
    expect(stale({ lastBackupAt: eighteenHours, platform: 'ios', installed: true })).toBe(false)
    expect(stale({ lastBackupAt: eighteenHours, platform: 'other' })).toBe(false)
  })

  it('treats a backup dated in the future as recent', () => {
    expect(stale({ lastBackupAt: NOW + 1000 })).toBe(false)
  })

  it('agrees with shouldNudge on every side of the cadence', () => {
    for (const platform of ['ios', 'other'] as const) {
      for (const lastBackupAt of [
        undefined,
        NOW - 1000,
        NOW - IOS_TAB_BACKUP_MAX_AGE_MS,
        NOW - BACKUP_MAX_AGE_MS,
      ]) {
        const over = { platform, lastBackupAt }
        expect(shouldNudge(input(over)) !== undefined).toBe(stale(over))
      }
    }
  })
})

describe('snooze storage', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => vi.restoreAllMocks())

  it('is undefined until something is snoozed', () => {
    expect(lastSnoozedAt()).toBeUndefined()
  })

  it('keeps the time of the last dismissal', () => {
    snoozeNudge(NOW)

    expect(lastSnoozedAt()).toBe(NOW)
  })

  it('reads a damaged value as no snooze', () => {
    localStorage.setItem('ration.backupNudgeSnoozedAt', 'tomorrow')

    expect(lastSnoozedAt()).toBeUndefined()
  })

  it('does not throw when storage is unavailable', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('full')
    })

    expect(() => snoozeNudge(NOW)).not.toThrow()
    expect(lastSnoozedAt()).toBeUndefined()
  })
})
