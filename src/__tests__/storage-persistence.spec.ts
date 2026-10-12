import 'fake-indexeddb/auto'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { db, log, nutrientGoals } from '../db'
import {
  isInstalled,
  readEstimate,
  readPersistence,
  requestPersistence,
  resetPersistenceSession,
} from '../storage-persistence'

const stubStorage = (storage: Partial<StorageManager> | undefined) =>
  vi.stubGlobal('navigator', { storage })

beforeEach(() => {
  localStorage.clear()
  resetPersistenceSession()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('readPersistence', () => {
  it.each([
    ['granted', { persisted: async () => true }, 'granted'],
    ['not asked', { persisted: async () => false }, 'not-asked'],
    ['missing', undefined, 'unsupported'],
    [
      'throwing',
      {
        persisted: async () => {
          throw new Error('nope')
        },
      },
      'unsupported',
    ],
  ])('reports %s', async (_name, storage, expected) => {
    stubStorage(storage)

    expect(await readPersistence()).toBe(expected)
  })

  it('reports refused once this session asked and was declined', async () => {
    stubStorage({ persisted: async () => false, persist: async () => false })
    await requestPersistence()

    expect(await readPersistence()).toBe('refused')
  })

  it('reports not-asked, not refused, when an earlier grant is no longer in effect', async () => {
    // Nothing was asked this session, so a lost grant must not read as a refusal.
    stubStorage({ persisted: async () => false })

    expect(await readPersistence()).toBe('not-asked')
  })
})

describe('requestPersistence', () => {
  it('asks once per session however many writes follow', async () => {
    const persist = vi.fn(async () => true)
    stubStorage({ persisted: async () => false, persist })

    await Promise.all([requestPersistence(), requestPersistence()])
    await requestPersistence()

    expect(persist).toHaveBeenCalledTimes(1)
  })

  it('retries a refusal in a later session, and reads not-asked until then', async () => {
    const persist = vi.fn(async () => false)
    stubStorage({ persisted: async () => false, persist })
    await requestPersistence()

    resetPersistenceSession()
    expect(await readPersistence()).toBe('not-asked')
    await requestPersistence()

    expect(persist).toHaveBeenCalledTimes(2)
  })

  it('does not ask when the browser already reports persistent storage', async () => {
    const persist = vi.fn(async () => true)
    stubStorage({ persisted: async () => true, persist })

    await requestPersistence()

    expect(persist).not.toHaveBeenCalled()
  })

  it('tries again next session when the request rejects', async () => {
    const persist = vi.fn(async () => {
      throw new Error('boom')
    })
    stubStorage({ persisted: async () => false, persist })

    await expect(requestPersistence()).resolves.toBeUndefined()
    resetPersistenceSession()
    await requestPersistence()

    expect(persist).toHaveBeenCalledTimes(2)
  })

  it('does nothing without a Storage API', async () => {
    stubStorage(undefined)

    await expect(requestPersistence()).resolves.toBeUndefined()
  })
})

describe('a write', () => {
  beforeEach(async () => {
    await Promise.all([db.logEntries.clear(), db.nutrientGoals.clear()])
  })

  it('asks on the first write, not before', async () => {
    const persist = vi.fn(async () => true)
    stubStorage({ persisted: async () => false, persist })
    expect(persist).not.toHaveBeenCalled()

    await nutrientGoals.put({ nutrient: 'protein', target: 100 })
    await nutrientGoals.put({ nutrient: 'fat', target: 70 })

    expect(persist).toHaveBeenCalledTimes(1)
  })

  it('still succeeds when persist() rejects', async () => {
    stubStorage({
      persisted: async () => false,
      persist: async () => {
        throw new Error('refused hard')
      },
    })

    const id = await log.add({
      name: 'Porridge',
      timestamp: 1,
      items: [{ kind: 'food', foodId: 'oats', grams: 50 }],
      totals: {},
    })

    expect(await log.get(id)).toBeDefined()
  })
})

describe('readEstimate', () => {
  it('returns usage and quota', async () => {
    stubStorage({ estimate: async () => ({ usage: 0, quota: 1000 }) })

    expect(await readEstimate()).toEqual({ usage: 0, quota: 1000 })
  })

  it.each([
    ['missing', undefined],
    ['rejecting', { estimate: () => Promise.reject(new Error('x')) }],
    ['incomplete', { estimate: async () => ({ quota: 5 }) }],
  ])('is undefined when %s', async (_name, storage) => {
    stubStorage(storage)

    expect(await readEstimate()).toBeUndefined()
  })
})

describe('isInstalled', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('is true for the standalone display mode', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }))
    window.matchMedia = () => ({ matches: true }) as MediaQueryList

    expect(isInstalled()).toBe(true)
  })

  it('is true for iOS navigator.standalone', () => {
    vi.stubGlobal('navigator', { standalone: true })

    expect(isInstalled()).toBe(true)
  })

  it('is false in a tab', () => {
    window.matchMedia = () => ({ matches: false }) as MediaQueryList

    expect(isInstalled()).toBe(false)
  })
})
