// Before db.ts constructs its Dexie instance.
import 'fake-indexeddb/auto'

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope } from 'vue'

import { addLocalDays, startOfLocalDay } from '../../dates'
import { db, log } from '../../db'
import type { NewLogEntry } from '../../types'
import { useWindow } from '../useWindow'

const entry = (at: number, energy = 400): NewLogEntry => ({
  name: 'Porridge',
  timestamp: at,
  items: [{ kind: 'food', foodId: 'oats', grams: 50 }],
  totals: { energy: { amount: energy, bySource: { user: energy }, missing: 0 } },
})

const midday = (dayOffset: number) => addLocalDays(startOfLocalDay(), dayOffset) + 12 * 3_600_000

/** onScopeDispose needs an owning scope, which a component would normally give. */
const inScope = <T>(fn: () => T): T => effectScope().run(fn)!

beforeEach(async () => {
  await db.logEntries.clear()
})

describe('useWindow', () => {
  it('picks up entries inside the trailing week', async () => {
    await log.add(entry(midday(-1)))
    const w = inScope(() => useWindow())

    // liveQuery pushes asynchronously, so wait for the subscription rather than
    // refetching by hand.
    await vi.waitFor(() => expect(w.entries.value).toHaveLength(1))
    expect(w.loading.value).toBe(false)
  })

  it('excludes an entry older than the window', async () => {
    await log.add(entry(midday(-10)))
    const w = inScope(() => useWindow())

    await vi.waitFor(() => expect(w.loading.value).toBe(false))
    expect(w.entries.value).toEqual([])
  })

  it('includes today, which is what the window is for', async () => {
    await log.add(entry(midday(0)))
    const w = inScope(() => useWindow())

    await vi.waitFor(() => expect(w.entries.value).toHaveLength(1))
  })

  it('reports coverage as days holding records, not entries', async () => {
    await log.add(entry(midday(-1)))
    await log.add(entry(midday(-1) + 3_600_000))
    await log.add(entry(midday(-3)))
    const w = inScope(() => useWindow())

    await vi.waitFor(() => expect(w.entries.value).toHaveLength(3))
    expect(w.coverage.value).toEqual({ logged: 2, days: 7 })
  })

  it('requeries when the window length changes', async () => {
    await log.add(entry(midday(-1)))
    await log.add(entry(midday(-20)))
    const w = inScope(() => useWindow())

    await vi.waitFor(() => expect(w.entries.value).toHaveLength(1))

    w.days.value = 30

    await vi.waitFor(() => expect(w.entries.value).toHaveLength(2))
    expect(w.coverage.value).toEqual({ logged: 2, days: 30 })
  })

  it('reflects a later write without a manual refetch', async () => {
    const w = inScope(() => useWindow())
    await vi.waitFor(() => expect(w.loading.value).toBe(false))

    await log.add(entry(midday(0)))

    await vi.waitFor(() => expect(w.entries.value).toHaveLength(1))
  })

  it('reports an empty window as zero logged days rather than dividing by it', async () => {
    const w = inScope(() => useWindow())

    await vi.waitFor(() => expect(w.loading.value).toBe(false))
    expect(w.coverage.value).toEqual({ logged: 0, days: 7 })
  })
})
