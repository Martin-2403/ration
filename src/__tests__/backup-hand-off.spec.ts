import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { backupFileName, handOffBackup } from '../backup/hand-off'
import { lastBackupAt, recordBackup } from '../backup/last-backup'

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

    expect(await handOffBackup(file())).toBe('downloaded')
    expect(click).toHaveBeenCalledOnce()
  })
})

describe('last backup time', () => {
  beforeEach(() => localStorage.clear())

  it('is undefined until a backup is recorded', () => {
    expect(lastBackupAt()).toBeUndefined()
  })

  it('returns what was recorded, including an epoch of zero', () => {
    recordBackup(1_700_000_000_000)
    expect(lastBackupAt()).toBe(1_700_000_000_000)

    recordBackup(0)
    expect(lastBackupAt()).toBe(0)
  })

  it('ignores a value that is not a number', () => {
    localStorage.setItem('ration.lastBackupAt', 'yesterday')

    expect(lastBackupAt()).toBeUndefined()
  })
})
