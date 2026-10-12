// Must come before db.ts, which constructs a Dexie instance on import.
import 'fake-indexeddb/auto'

import Dexie from 'dexie'
import { describe, expect, it, vi } from 'vitest'

import { SEED_FOODS, SEED_TEMPLATES, SEED_UPDATED_AT } from '../data/foods'

describe('schema version 4', () => {
  it('backfills updatedAt on foods, meal templates and day templates with the migration time', async () => {
    // The database as version 3 left it: rows with no updatedAt.
    const old = new Dexie('ration')
    old.version(1).stores({
      foods: 'id, barcode',
      mealTemplates: 'id',
      logEntries: '++id, timestamp, updatedAt',
    })
    old.version(2).stores({ nutrientGoals: 'nutrient' })
    old.version(3).stores({ dayTemplates: 'id' })
    await old.open()
    await old.table('foods').put({ id: 'oats', name: 'Oats', per100g: {} })
    await old.table('mealTemplates').put({ id: 'breakfast', name: 'Breakfast', slots: [] })
    await old
      .table('dayTemplates')
      .put({ id: 'workday', name: 'Workday', mealTemplateIds: ['breakfast'] })
    await old
      .table('logEntries')
      .put({ name: 'Porridge', timestamp: 1, createdAt: 5, updatedAt: 7, items: [], totals: {} })
    old.close()

    const migratedAt = Date.parse('2026-10-12T12:00:00Z')
    vi.spyOn(Date, 'now').mockReturnValue(migratedAt)
    const { db } = await import('../db')
    await db.open()

    expect((await db.foods.get('oats'))?.updatedAt).toBe(migratedAt)
    expect((await db.mealTemplates.get('breakfast'))?.updatedAt).toBe(migratedAt)
    expect((await db.dayTemplates.get('workday'))?.updatedAt).toBe(migratedAt)
    // A store that already carried a write time is left alone.
    expect((await db.logEntries.toArray())[0]?.updatedAt).toBe(7)
    // And the rows are otherwise intact.
    expect((await db.foods.get('oats'))?.name).toBe('Oats')
  })
})

describe('seeds', () => {
  it('carry the seed sentinel and are not stored rows', async () => {
    const { db, foods } = await import('../db')

    expect(SEED_FOODS.every((food) => food.updatedAt === SEED_UPDATED_AT)).toBe(true)
    expect(SEED_TEMPLATES.every((template) => template.updatedAt === SEED_UPDATED_AT)).toBe(true)
    // Nothing stores them; one that is put anyway is stamped as the real write.
    const banana = SEED_FOODS.find((food) => food.id === 'banana')!
    expect(await db.foods.get('banana')).toBeUndefined()
    await foods.put(banana)
    expect((await db.foods.get('banana'))?.updatedAt).toBeGreaterThan(SEED_UPDATED_AT)
  })
})
