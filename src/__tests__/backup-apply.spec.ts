// Must come before db.ts, which constructs a Dexie instance on import.
import 'fake-indexeddb/auto'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { RestoreError, replaceFromBackup, validatePayload } from '../backup/apply'
import { decryptBackup, encryptBackup, type BackupPayload } from '../backup/envelope'
import { reactive } from 'vue'

import { db } from '../db'

const FAST = { iterations: 1_000 }

const food = (id: string, updatedAt = 1_000) => ({
  id,
  name: `Food ${id}`,
  per100g: { energy: { value: 100, source: 'off-packaging' } },
  updatedAt,
})
const meal = (id: string) => ({ id, name: `Meal ${id}`, slots: [], updatedAt: 2_000 })
const day = (id: string, meals = ['m1']) => ({
  id,
  name: `Day ${id}`,
  mealTemplateIds: meals,
  updatedAt: 3_000,
})
const entry = (id: number) => ({
  id,
  name: 'Porridge',
  timestamp: 1_760_000_000_000 + id,
  createdAt: 1_760_000_100_000,
  updatedAt: 1_760_000_200_000,
  items: [{ kind: 'food', foodId: 'f1', grams: 50 }],
  totals: { energy: { amount: 185, bySource: { 'off-packaging': 185 }, missing: 0 } },
})
const goal = (nutrient = 'energy', target = 2000) => ({ nutrient, target, updatedAt: 4_000 })

const backup = (): BackupPayload => ({
  foods: [food('f1'), food('f2', 1_234)],
  logEntries: [entry(7), entry(9)],
  mealTemplates: [meal('m1')],
  dayTemplates: [day('d1')],
  goals: [goal()],
})

async function snapshot() {
  return {
    foods: await db.foods.toArray(),
    logEntries: await db.logEntries.toArray(),
    mealTemplates: await db.mealTemplates.toArray(),
    dayTemplates: await db.dayTemplates.toArray(),
    goals: await db.nutrientGoals.toArray(),
  }
}

/** A device with its own, different data, so "replaced" and "untouched" are visible. */
async function seedLocal() {
  await db.foods.bulkPut([food('local-food', 999_999)] as never[])
  await db.logEntries.bulkPut([{ ...entry(1), name: 'Local' }] as never[])
  await db.mealTemplates.bulkPut([meal('local-meal')] as never[])
  await db.dayTemplates.bulkPut([day('local-day', ['local-meal'])] as never[])
  await db.nutrientGoals.bulkPut([goal('protein', 90)] as never[])
}

beforeEach(async () => {
  await Promise.all([
    db.foods.clear(),
    db.mealTemplates.clear(),
    db.dayTemplates.clear(),
    db.logEntries.clear(),
    db.nutrientGoals.clear(),
  ])
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('replaceFromBackup', () => {
  it('round-trips an encrypted backup into a seeded database, rows exactly as stored', async () => {
    await seedLocal()
    const envelope = await encryptBackup(backup(), 'correct horse', FAST)
    const opened = await decryptBackup(JSON.stringify(envelope), 'correct horse')

    const counts = await replaceFromBackup(opened)

    expect(counts).toEqual({ foods: 2, logEntries: 2, mealTemplates: 1, dayTemplates: 1, goals: 1 })
    const after = await snapshot()
    // Stamps are the backup's, not the restore time, and log ids are kept.
    expect(after.foods.sort((a, b) => a.id.localeCompare(b.id))).toEqual(backup().foods)
    expect(after.logEntries.sort((a, b) => a.id - b.id)).toEqual(backup().logEntries)
    expect(after.mealTemplates).toEqual(backup().mealTemplates)
    expect(after.dayTemplates).toEqual(backup().dayTemplates)
    expect(after.goals).toEqual(backup().goals)
  })

  it('keeps issuing fresh log ids above the restored ones', async () => {
    await replaceFromBackup({ logEntries: [entry(7), entry(9)] })

    const fresh: Partial<ReturnType<typeof entry>> = entry(0)
    delete fresh.id
    const next = await db.logEntries.add(fresh as never)

    expect(next).toBeGreaterThan(9)
  })

  it('leaves classes the backup does not carry alone', async () => {
    await seedLocal()
    const before = await snapshot()

    await replaceFromBackup({ foods: [food('f1')] })

    const after = await snapshot()
    expect(after.foods).toEqual([food('f1')])
    expect(after.logEntries).toEqual(before.logEntries)
    expect(after.mealTemplates).toEqual(before.mealTemplates)
    expect(after.dayTemplates).toEqual(before.dayTemplates)
    expect(after.goals).toEqual(before.goals)
  })

  it('treats a class present but empty as "replace with nothing"', async () => {
    await seedLocal()

    await replaceFromBackup({ goals: [] })

    expect(await db.nutrientGoals.count()).toBe(0)
    expect(await db.foods.count()).toBe(1)
  })

  describe('meals named by restored days', () => {
    it('resolves against the backup when it carries meals, not against this device', async () => {
      await seedLocal()

      // 'local-meal' is on this device, but the backup's meals replace it.
      await expect(
        replaceFromBackup({
          mealTemplates: [meal('m1')],
          dayTemplates: [day('d', ['local-meal'])],
        }),
      ).rejects.toThrow(/names a meal template \(local-meal\)/)

      await replaceFromBackup({ mealTemplates: [meal('m1')], dayTemplates: [day('d', ['m1'])] })
      expect((await db.dayTemplates.toArray()).map((d) => d.id)).toEqual(['d'])
    })

    it('refuses a days-only backup whose meal is not on this device, and writes nothing', async () => {
      await seedLocal()
      const before = await snapshot()

      await expect(replaceFromBackup({ dayTemplates: [day('d', ['m1'])] })).rejects.toThrow(
        /Day template "Day d" names a meal template \(m1\)/,
      )

      expect(await snapshot()).toEqual(before)
    })

    it('accepts a days-only backup naming a meal stored on this device', async () => {
      await seedLocal()

      await replaceFromBackup({ dayTemplates: [day('d', ['local-meal'])] })

      expect((await db.dayTemplates.toArray()).map((d) => d.id)).toEqual(['d'])
    })

    it('accepts a days-only backup naming a seed meal', async () => {
      await replaceFromBackup({ dayTemplates: [day('d', ['porridge'])] })

      expect(await db.dayTemplates.count()).toBe(1)
    })

    it('leaves a log entry whose template is gone alone', async () => {
      await replaceFromBackup({ logEntries: [{ ...entry(1), templateId: 'deleted-meal' }] })

      expect(await db.logEntries.count()).toBe(1)
    })
  })

  it('accepts a payload held in reactive state', async () => {
    await replaceFromBackup(reactive({ foods: [food('f1')] }) as BackupPayload)

    expect(await db.foods.toArray()).toEqual([food('f1')])
  })

  it('ignores classes this build has no table for', async () => {
    await replaceFromBackup({ foods: [food('f1')], labResults: [{ id: 'x' }] })

    expect(await db.foods.count()).toBe(1)
  })

  it.each<[string, BackupPayload, RegExp]>([
    ['a food without an id', { foods: [{ ...food('f1'), id: null }] }, /foods row 1/],
    ['a food without per100g', { foods: [{ ...food('f1'), per100g: 5 }] }, /foods row 1/],
    ['a row that is not an object', { foods: [food('f1'), 'nope'] }, /foods row 2/],
    [
      'a meal template without slots',
      { mealTemplates: [{ ...meal('m'), slots: null }] },
      /mealTemplates row 1/,
    ],
    [
      'an unnamed day',
      { dayTemplates: [{ ...day('d'), name: '   ' }] },
      /dayTemplates row 1 has no name/,
    ],
    ['a day with no meals', { dayTemplates: [day('d', [])] }, /names no meals/],
    [
      'a log entry with a text timestamp',
      { logEntries: [{ ...entry(1), timestamp: 'x' }] },
      /logEntries row 1/,
    ],
    ['a log entry without an id', { logEntries: [{ ...entry(1), id: null }] }, /no id/],
    ['a goal for a micronutrient', { goals: [goal('vitaminC')] }, /goals row 1/],
    ['a goal for an unknown nutrient', { goals: [goal('unobtainium')] }, /goals row 1/],
    ['a zero target', { goals: [goal('energy', 0)] }, /above zero/],
    ['a negative target', { goals: [goal('energy', -5)] }, /above zero/],
    ['a repeated id', { foods: [food('f1'), food('f1')] }, /repeats the id/],
    [
      'a bare number as a nutrient value',
      { foods: [{ ...food('f1'), per100g: { energy: 100 } }] },
      /foods row 1 has invalid nutrient values/,
    ],
    [
      'a nutrient value without a source',
      { foods: [{ ...food('f1'), per100g: { energy: { value: 1 } } }] },
      /foods row 1 has invalid nutrient values/,
    ],
    [
      'a meal slot without a kind',
      { mealTemplates: [{ ...meal('m'), slots: [{ id: 's', label: 'S', options: [] }] }] },
      /mealTemplates row 1 has invalid slots/,
    ],
    [
      'a log item with text grams',
      { logEntries: [{ ...entry(1), items: [{ kind: 'food', foodId: 'f', grams: '50' }] }] },
      /logEntries row 1 has invalid items/,
    ],
    [
      'a log item of an unknown kind',
      { logEntries: [{ ...entry(1), items: [{ kind: 'drink', foodId: 'f', grams: 5 }] }] },
      /has invalid items/,
    ],
    [
      'a supplement item that is not marked confirmed or not',
      {
        logEntries: [{ ...entry(1), items: [{ kind: 'supplement', supplementId: 's', doses: 1 }] }],
      },
      /has invalid items/,
    ],
    [
      'a bare number as a stored total',
      { logEntries: [{ ...entry(1), totals: { energy: 185 } }] },
      /logEntries row 1 has invalid totals/,
    ],
    [
      'a stored total without its missing count',
      {
        logEntries: [{ ...entry(1), totals: { energy: { amount: 1, bySource: {} } } }],
      },
      /has invalid totals/,
    ],
    [
      'a day naming a meal that is nowhere',
      { dayTemplates: [day('d', ['ok', 'ghost'])] },
      /Day template "Day d" names a meal template \(ghost\)/,
    ],
  ])('refuses %s and writes nothing, even to the other classes', async (_name, bad, message) => {
    await seedLocal()
    const before = await snapshot()

    // A valid class alongside the bad one, to show the whole restore is refused.
    const attempt = replaceFromBackup({ mealTemplates: [meal('ok')], ...bad })

    await expect(attempt).rejects.toBeInstanceOf(RestoreError)
    await expect(attempt).rejects.toThrow(message)
    expect(await snapshot()).toEqual(before)
  })

  it('rolls the transaction back when the database refuses a write', async () => {
    await seedLocal()
    const before = await snapshot()

    // The second table's write fails after the first has been cleared and filled.
    vi.spyOn(db.logEntries, 'bulkPut').mockRejectedValue(new Error('disk full'))
    const attempt = replaceFromBackup(backup())

    await expect(attempt).rejects.toBeInstanceOf(RestoreError)
    expect(await snapshot()).toEqual(before)
  })

  it('validatePayload accepts a whole, well-formed backup', async () => {
    await expect(validatePayload(backup())).resolves.toBeUndefined()
  })
})
