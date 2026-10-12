import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { backupFileName, canShareFile, handOffBackup } from '../backup/hand-off'
import { lastBackupAt, lastExport, lastLogExport, recordBackup } from '../backup/last-backup'

const file = () => new File(['{}'], 'ration-backup-2026-10-12.json', { type: 'application/json' })

describe('backupFileName', () => {
  it('uses the local calendar date', () => {
    // Late evening local time: the UTC date may differ, the local one must not.
    expect(backupFileName(new Date(2026, 9, 12, 23, 59).getTime())).toBe(
      'ration-backup-2026-10-12.json',
    )
    expect(backupFileName(new Date(2026, 0, 3, 0, 1).getTime())).toBe(
      'ration-backup-2026-01-03.json',
    )
  })
})

describe('handOffBackup', () => {
  const click = vi.fn()

  beforeEach(() => {
    URL.createObjectURL = vi.fn(() => 'blob:ration')
    URL.revokeObjectURL = vi.fn()
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(click)
    click.mockClear()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('shares the file where the browser accepts files', async () => {
    const share = vi.fn(async () => {})
    vi.stubGlobal('navigator', { canShare: () => true, share })

    expect(await handOffBackup(file())).toBe('shared')
    expect(share).toHaveBeenCalledOnce()
    expect(click).not.toHaveBeenCalled()
  })

  it('downloads when the browser cannot share files', async () => {
    const share = vi.fn()
    vi.stubGlobal('navigator', { canShare: () => false, share })

    expect(await handOffBackup(file())).toBe('downloaded')
    expect(share).not.toHaveBeenCalled()
    expect(click).toHaveBeenCalledOnce()
  })

  it('downloads when there is no share API at all', async () => {
    vi.stubGlobal('navigator', {})

    expect(await handOffBackup(file())).toBe('downloaded')
    expect(click).toHaveBeenCalledOnce()
  })

  it('reports a closed share sheet as cancelled, and does not download', async () => {
    const share = vi.fn(async () => {
      throw new DOMException('closed', 'AbortError')
    })
    vi.stubGlobal('navigator', { canShare: () => true, share })

    expect(await handOffBackup(file())).toBe('cancelled')
    expect(click).not.toHaveBeenCalled()
  })

  it('falls back to a download when sharing is refused for another reason', async () => {
    const share = vi.fn(async () => {
      throw new DOMException('no recent tap', 'NotAllowedError')
    })
    vi.stubGlobal('navigator', { canShare: () => true, share })

    expect(await handOffBackup(file())).toBe('fallback')
    expect(click).toHaveBeenCalledOnce()
  })
})

describe('canShareFile', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('is true only when the browser says it can share files', () => {
    vi.stubGlobal('navigator', { canShare: () => true })
    expect(canShareFile(file())).toBe(true)

    vi.stubGlobal('navigator', { canShare: () => false })
    expect(canShareFile(file())).toBe(false)

    vi.stubGlobal('navigator', {})
    expect(canShareFile(file())).toBe(false)
  })

  it('is false when asking throws', () => {
    vi.stubGlobal('navigator', {
      canShare: () => {
        throw new TypeError('nope')
      },
    })

    expect(canShareFile(file())).toBe(false)
  })
})

describe('last backup time', () => {
  beforeEach(() => localStorage.clear())

  it('is undefined until a backup is recorded', () => {
    expect(lastBackupAt()).toBeUndefined()
    expect(lastExport()).toBeUndefined()
    expect(lastLogExport()).toBeUndefined()
  })

  it('returns what was recorded, including an epoch of zero', () => {
    recordBackup(['logEntries'], 1_700_000_000_000)
    expect(lastBackupAt()).toBe(1_700_000_000_000)

    recordBackup(['logEntries'], 0)
    expect(lastBackupAt()).toBe(0)
  })

  it('remembers which classes the export held', () => {
    recordBackup(['logEntries', 'foods'], 5)

    expect(lastLogExport()).toEqual({ at: 5, classes: ['logEntries', 'foods'] })
  })

  it('is not moved by an export that left the log out', () => {
    recordBackup(['logEntries', 'foods'], 100)
    recordBackup(['foods', 'goals'], 200)

    expect(lastBackupAt()).toBe(100)
    expect(lastExport()).toEqual({ at: 200, classes: ['foods', 'goals'] })
  })

  it('does not count a partial export as a backup when there is no earlier one', () => {
    recordBackup(['goals'], 200)

    expect(lastBackupAt()).toBeUndefined()
    expect(lastExport()?.at).toBe(200)
  })

  it('is moved by a later export that includes the log', () => {
    recordBackup(['logEntries'], 100)
    recordBackup(['logEntries', 'goals'], 300)

    expect(lastBackupAt()).toBe(300)
  })

  it('ignores a stored value it cannot read', () => {
    localStorage.setItem('ration.lastExportWithLog', 'yesterday')
    localStorage.setItem('ration.lastExport', '{"at":"x","classes":[]}')

    expect(lastBackupAt()).toBeUndefined()
    expect(lastExport()).toBeUndefined()
  })
})
