// Must come before db.ts, which constructs a Dexie instance on import.
import 'fake-indexeddb/auto'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { db, dayTemplates, foods, log, mealTemplates, nutrientGoals } from '../db'
import { requestPersistence } from '../storage-persistence'

vi.mock('../storage-persistence', () => ({
  requestPersistence: vi.fn(async () => {}),
}))

/**
 * Every user write asks the browser for persistent storage (§10). The call is
 * fire-and-forget, so nothing else notices when it goes missing: a merge once
 * dropped it from the template saves and every other test stayed green.
 */
beforeEach(async () => {
  vi.mocked(requestPersistence).mockClear()

  await Promise.all([
    db.foods.clear(),
    db.mealTemplates.clear(),
    db.dayTemplates.clear(),
    db.logEntries.clear(),
    db.nutrientGoals.clear(),
  ])
})

const logEntry = {
  name: 'Porridge',
  timestamp: Date.parse('2026-05-01T08:00:00'),
  items: [],
  totals: {},
}

describe('user writes ask for persistent storage', () => {
  it('on saving a meal template', async () => {
    await mealTemplates.put({ id: 'm1', name: 'Breakfast', slots: [] })

    expect(requestPersistence).toHaveBeenCalledTimes(1)
  })

  it('on saving a day template', async () => {
    await dayTemplates.put({ id: 'd1', name: 'Workday', mealTemplateIds: ['m1'] })

    expect(requestPersistence).toHaveBeenCalledTimes(1)
  })

  it('on adding a log entry', async () => {
    await log.add(logEntry)

    expect(requestPersistence).toHaveBeenCalledTimes(1)
  })

  it('on updating a log entry', async () => {
    const id = await log.add(logEntry)
    vi.mocked(requestPersistence).mockClear()

    await log.update({ ...logEntry, id, createdAt: 1, updatedAt: 1, name: 'Porridge, big' })

    expect(requestPersistence).toHaveBeenCalledTimes(1)
  })

  it('on saving a goal', async () => {
    await nutrientGoals.put({ nutrient: 'energy', target: 2000 })

    expect(requestPersistence).toHaveBeenCalledTimes(1)
  })

  it('but not on a food the resolver caches, which is not a user write', async () => {
    await foods.put({ id: 'oats', name: 'Oats', per100g: {} })

    expect(requestPersistence).not.toHaveBeenCalled()
  })
})
