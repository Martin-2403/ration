// Must come before db.ts, which constructs a Dexie instance on import: jsdom
// has no IndexedDB of its own.
import 'fake-indexeddb/auto'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { reactive } from 'vue'

import { db, foods, log, mealTemplates } from '../db'
import type { NewLogEntry } from '../types'

const entry = (timestamp: number, name = 'Porridge'): NewLogEntry => ({
  name,
  timestamp,
  items: [{ kind: 'food', foodId: 'oats', grams: 50 }],
  totals: { energy: { amount: 185, bySource: { 'off-packaging': 185 }, missing: 0 } },
})

/**
 * Pin the wall clock. Note this stubs Date.now only — vi.useFakeTimers() would
 * also fake the timer queue, and Dexie needs real timers to settle a
 * transaction, so faking them deadlocks every query.
 */
const clockAt = (iso: string) => vi.spyOn(Date, 'now').mockReturnValue(Date.parse(iso))

beforeEach(async () => {
  await Promise.all([db.foods.clear(), db.mealTemplates.clear(), db.logEntries.clear()])
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('food repository', () => {
  it('round-trips a food by id', async () => {
    await foods.put({ id: 'oats', name: 'Oats', per100g: {} })

    expect((await foods.get('oats'))?.name).toBe('Oats')
  })

  it('finds a food by barcode', async () => {
    await foods.put({ id: 'oats', name: 'Oats', per100g: {}, barcode: '4001234567890' })

    expect((await foods.findByBarcode('4001234567890'))?.id).toBe('oats')
  })

  it('returns undefined for an unknown barcode rather than throwing', async () => {
    expect(await foods.findByBarcode('0000000000000')).toBeUndefined()
  })

  it('upserts on put', async () => {
    await foods.put({ id: 'oats', name: 'Oats', per100g: {} })
    await foods.put({ id: 'oats', name: 'Rolled oats', per100g: {} })

    expect(await db.foods.count()).toBe(1)
    expect((await foods.get('oats'))?.name).toBe('Rolled oats')
  })
})

describe('meal template repository', () => {
  it('lists what was stored', async () => {
    await mealTemplates.put({ id: 'breakfast', name: 'Breakfast', slots: [] })

    expect((await mealTemplates.list()).map((t) => t.id)).toEqual(['breakfast'])
  })

  it('removes by id', async () => {
    await mealTemplates.put({ id: 'breakfast', name: 'Breakfast', slots: [] })
    await mealTemplates.remove('breakfast')

    expect(await mealTemplates.list()).toEqual([])
  })
})

describe('log repository', () => {
  it('stamps createdAt and updatedAt on add', async () => {
    clockAt('2026-08-27T08:00:00Z')

    const id = await log.add(entry(Date.parse('2026-08-27T07:30:00Z')))
    const stored = await log.get(id)

    expect(stored?.createdAt).toBe(Date.parse('2026-08-27T08:00:00Z'))
    expect(stored?.updatedAt).toBe(stored?.createdAt)
    // timestamp is when it was eaten, and must not be overwritten by write time.
    expect(stored?.timestamp).toBe(Date.parse('2026-08-27T07:30:00Z'))
  })

  it('bumps updatedAt on update but keeps createdAt', async () => {
    clockAt('2026-08-27T08:00:00Z')
    const id = await log.add(entry(1000))
    const created = (await log.get(id))!.createdAt

    clockAt('2026-08-27T09:00:00Z')
    await log.update({ ...(await log.get(id))!, id, name: 'Porridge with berries' })

    const stored = await log.get(id)
    expect(stored?.name).toBe('Porridge with berries')
    expect(stored?.createdAt).toBe(created)
    expect(stored?.updatedAt).toBe(Date.parse('2026-08-27T09:00:00Z'))
  })

  it('ignores a caller-supplied updatedAt', async () => {
    clockAt('2026-08-27T08:00:00Z')
    const id = await log.add(entry(1000))

    clockAt('2026-08-27T10:00:00Z')
    // A stale or forged updatedAt would corrupt §10's last-write-wins merge, so
    // the repository always stamps it itself.
    await log.update({ ...(await log.get(id))!, id, updatedAt: 0 })

    expect((await log.get(id))?.updatedAt).toBe(Date.parse('2026-08-27T10:00:00Z'))
  })

  it('queries a window inclusive of from and exclusive of to', async () => {
    await log.add(entry(1000, 'before'))
    await log.add(entry(2000, 'at from'))
    await log.add(entry(2500, 'inside'))
    await log.add(entry(3000, 'at to'))

    const found = await log.between(2000, 3000)

    expect(found.map((e) => e.name)).toEqual(['at from', 'inside'])
  })

  it('returns a window sorted oldest first', async () => {
    await log.add(entry(3000, 'third'))
    await log.add(entry(1000, 'first'))
    await log.add(entry(2000, 'second'))

    expect((await log.between(0, 9999)).map((e) => e.name)).toEqual(['first', 'second', 'third'])
  })

  it('returns an empty window rather than throwing', async () => {
    expect(await log.between(0, 100)).toEqual([])
  })

  it('removes by id', async () => {
    const id = await log.add(entry(1000))
    await log.remove(id)

    expect(await log.get(id)).toBeUndefined()
  })

  it('accepts reactive input that structured clone would otherwise reject', async () => {
    // Anything coming from a component or store is a Proxy, and IndexedDB
    // serialises with structured clone, which throws DataCloneError on one.
    // toRaw would not be enough either — items is a nested array. Removing
    // plain() in db.ts breaks this test and nothing else.
    const id = await log.add(reactive(entry(1000)))
    const stored = await log.get(id)

    expect(stored?.items).toHaveLength(1)
    expect(stored?.totals.energy?.amount).toBe(185)
  })
})
