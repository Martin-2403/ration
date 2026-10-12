// Must come before db.ts, which constructs a Dexie instance on import.
import 'fake-indexeddb/auto'

import { beforeEach, describe, expect, it } from 'vitest'

import { BACKUP_CLASSES, collectBackup, countClasses } from '../backup/collect'
import { decryptBackup, encryptBackup } from '../backup/envelope'
import { db } from '../db'
import type { Food, MealTemplate, DayTemplate, StoredLogEntry } from '../types'
import type { UserGoal } from '../data/nutrients'

// Fixed stamps, far from any real clock, so a restamp cannot hide.
const food: Food = {
  id: 'oats',
  name: 'Oats',
  per100g: { energy: { amount: 370, source: 'off-packaging' } } as unknown as Food['per100g'],
  barcode: '4000000000001',
  updatedAt: 1_700_000_000_001,
}
const meal: MealTemplate = {
  id: 'm1',
  name: 'Breakfast',
  slots: [
    {
      id: 's1',
      label: 'Grain',
      kind: 'fixed',
      options: ['oats'],
      defaultOptionId: 'oats',
      defaultGrams: 50,
    },
  ],
  updatedAt: 1_700_000_000_002,
}
const day: DayTemplate = {
  id: 'd1',
  name: 'Workday',
  mealTemplateIds: ['m1', 'm1'],
  updatedAt: 1_700_000_000_003,
}
const entries: StoredLogEntry[] = [
  {
    id: 7,
    name: 'Porridge',
    timestamp: 1_700_000_100_000,
    createdAt: 1_700_000_200_000,
    updatedAt: 1_700_000_300_000,
    items: [{ kind: 'food', foodId: 'oats', grams: 50 }],
    totals: { energy: { amount: 185, bySource: { 'off-packaging': 185 }, missing: 0 } },
  },
  {
    id: 12,
    name: 'Toast',
    timestamp: 1_700_000_400_000,
    createdAt: 1_700_000_500_000,
    updatedAt: 1_700_000_600_000,
    items: [],
    totals: {},
  },
]
const goal: UserGoal = { nutrient: 'protein', target: 90, updatedAt: 1_700_000_000_004 }

beforeEach(async () => {
  await Promise.all([
    db.foods.clear(),
    db.mealTemplates.clear(),
    db.dayTemplates.clear(),
    db.logEntries.clear(),
    db.nutrientGoals.clear(),
  ])
  await db.foods.put(food)
  await db.mealTemplates.put(meal)
  await db.dayTemplates.put(day)
  await db.logEntries.bulkPut(entries)
  await db.nutrientGoals.put(goal)
})

describe('collectBackup', () => {
  it('lists exactly the five class names the envelope uses', () => {
    expect([...BACKUP_CLASSES]).toEqual([
      'foods',
      'logEntries',
      'mealTemplates',
      'dayTemplates',
      'goals',
    ])
  })

  it('reads every class untouched: ids, both timestamps and updatedAt as stored', async () => {
    const payload = await collectBackup(BACKUP_CLASSES)

    expect(payload).toEqual({
      foods: [food],
      logEntries: entries,
      mealTemplates: [meal],
      dayTemplates: [day],
      goals: [goal],
    })
  })

  it('reads only the classes asked for', async () => {
    const payload = await collectBackup(['goals', 'foods'])

    expect(Object.keys(payload).sort()).toEqual(['foods', 'goals'])
  })

  it('survives the round trip through encryption unchanged', async () => {
    const payload = await collectBackup(BACKUP_CLASSES)

    const envelope = await encryptBackup(payload, 'correct horse battery', { iterations: 1000 })
    const restored = await decryptBackup(JSON.stringify(envelope), 'correct horse battery')

    expect(envelope.classes).toEqual(Object.keys(payload))
    expect(restored).toEqual(payload)
    expect(restored.logEntries).toEqual(entries)
  })

  it('carries an empty class as an empty list, not as a missing one', async () => {
    await db.nutrientGoals.clear()

    expect((await collectBackup(['goals'])).goals).toEqual([])
  })
})

describe('countClasses', () => {
  it('counts the rows of each class', async () => {
    expect(await countClasses()).toEqual({
      foods: 1,
      logEntries: 2,
      mealTemplates: 1,
      dayTemplates: 1,
      goals: 1,
    })
  })

  it('keeps a zero as a zero', async () => {
    await db.foods.clear()

    expect((await countClasses()).foods).toBe(0)
  })
})
