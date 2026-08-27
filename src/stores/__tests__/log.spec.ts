// Before db.ts constructs its Dexie instance.
import 'fake-indexeddb/auto'

import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { startOfLocalDay } from '../../dates'
import { db, foods } from '../../db'
import type { NewLogEntry } from '../../types'
import { useLogStore } from '../log'

const entry = (timestamp: number, energy: number, name = 'Porridge'): NewLogEntry => ({
  name,
  timestamp,
  items: [{ kind: 'food', foodId: 'oats', grams: 50 }],
  totals: {
    energy: { amount: energy, bySource: { 'off-packaging': energy }, missing: 0 },
  },
})

const middayToday = () => startOfLocalDay() + 12 * 60 * 60 * 1000

beforeEach(async () => {
  await Promise.all([db.logEntries.clear(), db.foods.clear()])
  setActivePinia(createPinia())
})

describe('log store', () => {
  it('starts on today', () => {
    const store = useLogStore()

    expect(store.day).toBe(startOfLocalDay())
    expect(store.isToday).toBe(true)
  })

  it('picks up an entry logged for today', async () => {
    const store = useLogStore()
    await store.logMeal(entry(middayToday(), 387))

    // liveQuery pushes asynchronously, so wait for the subscription rather than
    // refetching by hand.
    await vi.waitFor(() => expect(store.entries).toHaveLength(1))
    expect(store.entries[0]?.name).toBe('Porridge')
  })

  it('merges the day totals across entries', async () => {
    const store = useLogStore()
    await store.logMeal(entry(middayToday(), 387, 'Breakfast'))
    await store.logMeal(entry(middayToday() + 1000, 600, 'Lunch'))

    await vi.waitFor(() => expect(store.entries).toHaveLength(2))

    expect(store.dayTotals.energy?.amount).toBe(987)
    expect(store.dayTotals.energy?.bySource).toEqual({ 'off-packaging': 987 })
  })

  it('excludes an entry from another day', async () => {
    const store = useLogStore()
    await store.logMeal(entry(middayToday(), 387, 'today'))
    await store.logMeal(entry(startOfLocalDay() - 60_000, 500, 'yesterday'))

    await vi.waitFor(() => expect(store.entries).toHaveLength(1))
    expect(store.entries[0]?.name).toBe('today')
  })

  it('follows the day when it is shifted', async () => {
    const store = useLogStore()
    const yesterdayMidday = startOfLocalDay() - 12 * 60 * 60 * 1000
    await store.logMeal(entry(yesterdayMidday, 500, 'yesterday'))

    await vi.waitFor(() => expect(store.entries).toHaveLength(0))

    store.shiftDay(-1)

    await vi.waitFor(() => expect(store.entries).toHaveLength(1))
    expect(store.entries[0]?.name).toBe('yesterday')
    expect(store.isToday).toBe(false)
  })

  it('normalises an arbitrary timestamp to local midnight', () => {
    const store = useLogStore()
    store.goToDay(new Date(2026, 0, 15, 17, 42).getTime())

    expect(store.day).toBe(new Date(2026, 0, 15).getTime())
  })

  it('reflects a removal without a manual refetch', async () => {
    const store = useLogStore()
    const id = await store.logMeal(entry(middayToday(), 387))

    await vi.waitFor(() => expect(store.entries).toHaveLength(1))
    await store.removeEntry(id)

    await vi.waitFor(() => expect(store.entries).toHaveLength(0))
    expect(store.dayTotals).toEqual({})
  })

  it('reflects an edit and its new totals', async () => {
    const store = useLogStore()
    const id = await store.logMeal(entry(middayToday(), 387))
    await vi.waitFor(() => expect(store.entries).toHaveLength(1))

    await store.updateEntry({
      ...store.entries[0]!,
      id,
      totals: { energy: { amount: 40, bySource: { user: 40 }, missing: 0 } },
    })

    await vi.waitFor(() => expect(store.dayTotals.energy?.amount).toBe(40))
  })

  it('quick-logs a single food without a template', async () => {
    const store = useLogStore()

    await store.logFood(
      {
        id: 'apple',
        name: 'Apple',
        per100g: { energy: { value: 52, source: 'user' } },
      },
      150,
    )

    await vi.waitFor(() => expect(store.entries).toHaveLength(1))

    const logged = store.entries[0]!
    // §7's quick-log shape: no template, one item, no slot.
    expect(logged.templateId).toBeUndefined()
    expect(logged.items).toEqual([{ kind: 'food', foodId: 'apple', grams: 150 }])
    expect(logged.items[0]).not.toHaveProperty('slotId')
    expect(logged.totals.energy?.amount).toBeCloseTo(78, 6)
  })

  it('stores the food it quick-logs, so history stays resolvable', async () => {
    const store = useLogStore()

    await store.logFood({ id: 'apple', name: 'Apple', per100g: {} }, 100)

    // A log entry pointing at an id that resolves to nothing would leave history
    // unreadable, and §13 pins foods that have been logged.
    expect((await foods.get('apple'))?.name).toBe('Apple')
  })

  it('re-snapshots totals from the items when an entry is revised', async () => {
    const store = useLogStore()
    // logFood upserts the food, so the values have to come in through it —
    // storing them separately first would just get overwritten.
    const id = await store.logFood(
      { id: 'apple', name: 'Apple', per100g: { energy: { value: 52, source: 'user' } } },
      100,
    )
    await vi.waitFor(() => expect(store.entries).toHaveLength(1))

    await store.reviseEntry({
      ...store.entries[0]!,
      id,
      items: [{ kind: 'food', foodId: 'apple', grams: 200 }],
    })

    // Recomputed from the item, not patched: 52 per 100 g at 200 g.
    await vi.waitFor(() => expect(store.entries[0]?.totals.energy?.amount).toBeCloseTo(104, 6))
    expect(store.entries[0]?.items[0]).toMatchObject({ grams: 200 })
  })

  it('keeps createdAt and meal time when revising, but bumps updatedAt', async () => {
    const store = useLogStore()
    const id = await store.logFood({ id: 'apple', name: 'Apple', per100g: {} }, 100)
    await vi.waitFor(() => expect(store.entries).toHaveLength(1))
    const before = store.entries[0]!

    await store.reviseEntry({
      ...before,
      id,
      items: [{ kind: 'food', foodId: 'apple', grams: 150 }],
    })

    await vi.waitFor(() => expect(store.entries[0]?.items[0]).toMatchObject({ grams: 150 }))
    const after = store.entries[0]!

    expect(after.createdAt).toBe(before.createdAt)
    expect(after.timestamp).toBe(before.timestamp)
    expect(after.updatedAt).toBeGreaterThanOrEqual(before.updatedAt)
  })

  it('drops a nutrient to no data when its food no longer resolves', async () => {
    const store = useLogStore()
    const id = await store.logFood(
      { id: 'gone', name: 'Gone', per100g: { energy: { value: 100, source: 'user' } } },
      100,
    )
    await vi.waitFor(() => expect(store.entries[0]?.totals.energy?.amount).toBeCloseTo(100, 6))

    // The food is deleted, then the entry is revised. Re-resolving finds nothing,
    // so the revised total reports no data rather than keeping a stale number.
    await db.foods.delete('gone')
    await store.reviseEntry({
      ...store.entries[0]!,
      id,
      items: [{ kind: 'food', foodId: 'gone', grams: 100 }],
    })

    await vi.waitFor(() => expect(store.entries[0]?.totals).toEqual({}))
  })

  it('has empty totals for a day with nothing logged', async () => {
    const store = useLogStore()

    await vi.waitFor(() => expect(store.loading).toBe(false))
    expect(store.entries).toEqual([])
    // Empty, not zeroed: no records is not the same as no intake (§9).
    expect(store.dayTotals).toEqual({})
  })
})
