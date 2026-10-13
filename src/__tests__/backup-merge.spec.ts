// Must come before db.ts, which constructs a Dexie instance on import.
import 'fake-indexeddb/auto'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { reactive } from 'vue'

import {
  RestoreError,
  mergeFromBackup,
  previewMerge,
  replaceFromBackup,
  validatePayload,
} from '../backup/apply'
import type { BackupPayload } from '../backup/envelope'
import { db } from '../db'

const food = (id: string, updatedAt: number, name = `Food ${id}`) => ({
  id,
  name,
  per100g: { energy: { value: 100, source: 'off-packaging' as const } },
  updatedAt,
})
const meal = (id: string, updatedAt = 2_000) => ({ id, name: `Meal ${id}`, slots: [], updatedAt })
const day = (id: string, meals: string[], updatedAt = 3_000) => ({
  id,
  name: `Day ${id}`,
  mealTemplateIds: meals,
  updatedAt,
})
const goal = (nutrient: string, target: number, updatedAt: number) => ({
  nutrient,
  target,
  updatedAt,
})

/** A log entry; `createdAt`, `timestamp` and `name` are what tell two entries apart. */
const entry = (
  id: number,
  over: Partial<{ name: string; timestamp: number; createdAt: number; updatedAt: number }> = {},
) => ({
  id,
  name: 'Porridge',
  timestamp: 1_760_000_000_000,
  createdAt: 1_760_000_100_000,
  updatedAt: 1_760_000_200_000,
  items: [{ kind: 'food', foodId: 'f1', grams: 50 }],
  totals: { energy: { amount: 185, bySource: { 'off-packaging': 185 }, missing: 0 } },
  ...over,
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

const count = { added: 0, updated: 0, kept: 0 }

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

describe('mergeFromBackup', () => {
  describe('last write wins on updatedAt, per record', () => {
    it('takes the backup row when it is newer and keeps the local row when it is older', async () => {
      await db.foods.bulkPut([
        food('newer-here', 5_000, 'local'),
        food('older-here', 1_000, 'local'),
      ])

      const counts = await mergeFromBackup({
        foods: [food('newer-here', 2_000, 'backup'), food('older-here', 3_000, 'backup')],
      })

      const byId = Object.fromEntries((await db.foods.toArray()).map((f) => [f.id, f]))
      expect(byId['newer-here']!.name).toBe('local')
      expect(byId['older-here']!.name).toBe('backup')
      expect(counts.foods).toEqual({ added: 0, updated: 1, kept: 1 })
    })

    it('writes the winning row exactly as stored, without restamping it', async () => {
      await db.foods.put(food('a', 1_000, 'local'))

      await mergeFromBackup({ foods: [food('a', 2_000, 'backup')] })

      expect(await db.foods.get('a')).toEqual(food('a', 2_000, 'backup'))
    })

    it('keeps the local row on a tie', async () => {
      await db.foods.put(food('a', 2_000, 'local'))

      const counts = await mergeFromBackup({ foods: [food('a', 2_000, 'backup')] })

      expect((await db.foods.get('a'))!.name).toBe('local')
      expect(counts.foods).toEqual({ added: 0, updated: 0, kept: 1 })
    })

    it('handles every class, and goals are keyed by nutrient', async () => {
      await db.mealTemplates.put(meal('m1', 1_000) as never)
      await db.dayTemplates.put(day('d1', ['m1'], 9_000) as never)
      await db.nutrientGoals.bulkPut([
        goal('energy', 2000, 1_000),
        goal('protein', 90, 9_000),
      ] as never[])

      const counts = await mergeFromBackup({
        mealTemplates: [{ ...meal('m1', 5_000), name: 'Renamed' }],
        dayTemplates: [{ ...day('d1', ['m1'], 2_000), name: 'Stale' }],
        goals: [goal('energy', 2400, 5_000), goal('protein', 50, 2_000), goal('fat', 70, 5_000)],
      })

      expect((await db.mealTemplates.get('m1'))!.name).toBe('Renamed')
      expect((await db.dayTemplates.get('d1'))!.name).toBe('Day d1')
      expect(await db.nutrientGoals.toArray()).toEqual(
        expect.arrayContaining([
          goal('energy', 2400, 5_000),
          goal('protein', 90, 9_000),
          goal('fat', 70, 5_000),
        ]),
      )
      expect(await db.nutrientGoals.count()).toBe(3)
      expect(counts.mealTemplates).toEqual({ added: 0, updated: 1, kept: 0 })
      expect(counts.dayTemplates).toEqual({ added: 0, updated: 0, kept: 1 })
      expect(counts.goals).toEqual({ added: 1, updated: 1, kept: 1 })
    })
  })

  describe('records on one side only', () => {
    it('adds what only the backup has and keeps what only this device has', async () => {
      await db.foods.put(food('local-only', 1_000))

      const counts = await mergeFromBackup({ foods: [food('backup-only', 1)] })

      expect((await db.foods.toArray()).map((f) => f.id).sort()).toEqual([
        'backup-only',
        'local-only',
      ])
      expect(counts.foods).toEqual({ added: 1, updated: 0, kept: 0 })
    })

    it('does not touch classes the backup does not carry', async () => {
      await db.nutrientGoals.put(goal('protein', 90, 1_000) as never)

      const counts = await mergeFromBackup({ foods: [food('a', 1)] })

      expect(await db.nutrientGoals.count()).toBe(1)
      expect(Object.keys(counts)).toEqual(['foods'])
    })

    it('brings back a record deleted locally, because deletions are not tracked', async () => {
      await db.foods.put(food('gone', 1_000))
      await db.foods.delete('gone')

      await mergeFromBackup({ foods: [food('gone', 1_000)] })

      expect(await db.foods.get('gone')).toBeDefined()
    })

    it('treats a class present but empty as nothing to merge, not as a wipe', async () => {
      await db.foods.put(food('a', 1_000))

      const counts = await mergeFromBackup({ foods: [] })

      expect(await db.foods.count()).toBe(1)
      expect(counts.foods).toEqual(count)
    })
  })

  describe('identical records', () => {
    it('are a no-op write-wise', async () => {
      await db.foods.put(food('a', 1_000))
      await db.logEntries.put(entry(1) as never)
      const bulkPut = vi.spyOn(db.foods, 'bulkPut')

      const counts = await mergeFromBackup({ foods: [food('a', 1_000)], logEntries: [entry(1)] })

      expect(bulkPut).toHaveBeenCalledWith([])
      expect(counts.foods).toEqual({ added: 0, updated: 0, kept: 1 })
      expect(counts.logEntries).toEqual({ added: 0, updated: 0, kept: 1 })
      expect(await db.logEntries.count()).toBe(1)
    })
  })

  describe('log entries', () => {
    it('ignores timestamp: an old backup of yesterday’s breakfast cannot beat a newer edit', async () => {
      const dayMs = 86_400_000
      const created = 1_760_000_000_000
      // Logged for one day, then this morning's edit moved it to the day before and
      // rewrote it. Written long after the backup was.
      await db.logEntries.put(
        entry(1, {
          createdAt: created,
          timestamp: created - dayMs,
          updatedAt: created + 2 * dayMs,
        }) as never,
      )
      // The backup holds the same entry from before the edit: an earlier write time
      // but a LATER time eaten, which is what a timestamp comparison would favour.
      const stale = {
        ...entry(1, { createdAt: created, timestamp: created, updatedAt: created + 1_000 }),
        items: [],
      }

      const counts = await mergeFromBackup({ logEntries: [stale] })

      const rows = await db.logEntries.toArray()
      expect(rows).toHaveLength(1)
      expect(rows[0]!.timestamp).toBe(created - dayMs)
      expect(rows[0]!.items).toHaveLength(1)
      expect(counts.logEntries).toEqual({ added: 0, updated: 0, kept: 1 })
    })

    it('lets an edit to the time eaten, written later, win over the older local row', async () => {
      await db.logEntries.put(entry(1, { timestamp: 1_000, updatedAt: 1_000 }) as never)

      await mergeFromBackup({ logEntries: [entry(1, { timestamp: 500, updatedAt: 2_000 })] })

      const rows = await db.logEntries.toArray()
      expect(rows).toHaveLength(1)
      expect(rows[0]!.timestamp).toBe(500)
    })

    it('keeps two entries created in the same millisecond apart', async () => {
      await db.logEntries.bulkPut([
        entry(1, { name: 'Breakfast', updatedAt: 1_000 }),
        entry(2, { name: 'Lunch', updatedAt: 1_000 }),
      ] as never[])

      const counts = await mergeFromBackup({
        logEntries: [
          { ...entry(2, { name: 'Lunch', updatedAt: 2_000 }), items: [] },
          entry(1, { name: 'Breakfast', updatedAt: 1_000 }),
        ],
      })

      expect((await db.logEntries.get(2))!.items).toEqual([])
      expect((await db.logEntries.get(1))!.items).toHaveLength(1)
      expect(counts.logEntries).toEqual({ added: 0, updated: 1, kept: 1 })
    })

    it('lets a backup entry written later win, whatever its timestamp says', async () => {
      await db.logEntries.put(entry(1, { updatedAt: 1_000 }) as never)

      const counts = await mergeFromBackup({
        logEntries: [{ ...entry(1, { updatedAt: 2_000 }), items: [] }],
      })

      expect((await db.logEntries.get(1))!.items).toEqual([])
      expect(counts.logEntries).toEqual({ added: 0, updated: 1, kept: 0 })
    })

    it('keeps both entries when two devices used the same id for different entries', async () => {
      const mine = entry(1, { name: 'Local lunch', createdAt: 1_000, timestamp: 1_000 })
      const theirs = entry(1, { name: 'Remote dinner', createdAt: 2_000, timestamp: 2_000 })
      await db.logEntries.put(mine as never)

      const counts = await mergeFromBackup({ logEntries: [theirs] })

      const rows = await db.logEntries.toArray()
      expect(rows).toHaveLength(2)
      expect(rows.find((r) => r.id === 1)).toEqual(mine)
      const added = rows.find((r) => r.id !== 1)!
      expect(added.id).toBeGreaterThan(1)
      expect({ ...added, id: 1 }).toEqual(theirs)
      expect(counts.logEntries).toEqual({ added: 1, updated: 0, kept: 0 })
    })

    it('never overwrites a different entry that shares an id, even when the backup one is newer', async () => {
      const mine = entry(1, { name: 'Local', createdAt: 1, updatedAt: 1 })
      await db.logEntries.put(mine as never)

      await mergeFromBackup({
        logEntries: [entry(1, { name: 'Other', createdAt: 2, updatedAt: 2_000_000 })],
      })

      expect(await db.logEntries.get(1)).toEqual(mine)
      expect(await db.logEntries.count()).toBe(2)
    })

    it('gives a colliding entry an id that no other backup entry then claims', async () => {
      // Local holds 1. Backup entry 1 collides and is re-numbered; backup entry 2 is free
      // and keeps its id. The fresh id must not land on 2.
      await db.logEntries.put(entry(1, { name: 'Local', createdAt: 1 }) as never)

      await mergeFromBackup({
        logEntries: [
          entry(1, { name: 'A', createdAt: 10 }),
          entry(2, { name: 'B', createdAt: 20 }),
          entry(3, { name: 'C', createdAt: 30 }),
        ],
      })

      const rows = await db.logEntries.toArray()
      expect(rows.map((r) => r.name).sort()).toEqual(['A', 'B', 'C', 'Local'])
      expect(new Set(rows.map((r) => r.id)).size).toBe(4)
      expect(rows.find((r) => r.name === 'B')!.id).toBe(2)
      expect(rows.find((r) => r.name === 'C')!.id).toBe(3)
    })

    it('matches an entry by what it is when the ids differ, and writes the winner under the local id', async () => {
      await db.logEntries.put(entry(5, { updatedAt: 1_000 }) as never)

      const counts = await mergeFromBackup({
        logEntries: [{ ...entry(2, { updatedAt: 2_000 }), items: [] }],
      })

      const rows = await db.logEntries.toArray()
      expect(rows).toHaveLength(1)
      expect(rows[0]!.id).toBe(5)
      expect(rows[0]!.items).toEqual([])
      expect(counts.logEntries).toEqual({ added: 0, updated: 1, kept: 0 })
    })

    it('does not fold two different backup entries into one local entry', async () => {
      await db.logEntries.put(entry(1) as never)

      await mergeFromBackup({ logEntries: [entry(1), entry(2)] })

      // Same identity twice in one backup: the second is a different record here.
      expect(await db.logEntries.count()).toBe(2)
    })

    it('is idempotent: merging the same backup twice adds nothing the second time', async () => {
      await db.logEntries.bulkPut([
        entry(1, { name: 'Local', createdAt: 1 }),
        entry(2, { name: 'Local 2', createdAt: 2 }),
      ] as never[])
      const incoming = {
        logEntries: [
          entry(1, { name: 'Remote', createdAt: 10 }),
          entry(2, { name: 'Remote 2', createdAt: 20 }),
          entry(3, { name: 'Remote 3', createdAt: 30 }),
        ],
      }

      const first = await mergeFromBackup(incoming)
      const after = await snapshot()
      const second = await mergeFromBackup(incoming)

      expect(first.logEntries).toEqual({ added: 3, updated: 0, kept: 0 })
      expect(second.logEntries).toEqual({ added: 0, updated: 0, kept: 3 })
      expect(await snapshot()).toEqual(after)
      expect(await db.logEntries.count()).toBe(5)
    })
  })

  describe('meals named by merged days', () => {
    it('resolves against the backup’s meals, this device’s meals and the seeds together', async () => {
      await db.mealTemplates.put(meal('local-meal') as never)

      await expect(
        mergeFromBackup({
          mealTemplates: [meal('backup-meal')],
          dayTemplates: [day('d1', ['backup-meal', 'local-meal'])],
        }),
      ).resolves.toBeDefined()

      expect(await db.dayTemplates.count()).toBe(1)
    })

    it('accepts a days-only backup that names a meal on this device', async () => {
      await db.mealTemplates.put(meal('local-meal') as never)

      await mergeFromBackup({ dayTemplates: [day('d1', ['local-meal'])] })

      expect(await db.dayTemplates.count()).toBe(1)
    })

    it('refuses a dangling meal and leaves the database untouched', async () => {
      await db.foods.put(food('a', 1_000))
      await db.mealTemplates.put(meal('local-meal') as never)
      const before = await snapshot()

      const attempt = mergeFromBackup({
        foods: [food('b', 1)],
        dayTemplates: [day('d1', ['local-meal', 'nowhere'])],
      })

      await expect(attempt).rejects.toBeInstanceOf(RestoreError)
      await expect(attempt).rejects.toThrow('nowhere')
      expect(await snapshot()).toEqual(before)
    })
  })

  describe('all or nothing', () => {
    it.each([
      ['a bad goal target', { goals: [goal('energy', 0, 1)] }, 'goals row 1'],
      ['a log entry with no id', { logEntries: [{ ...entry(1), id: 'x' }] }, 'logEntries row 1'],
      [
        'a repeated key',
        { foods: [food('a', 1), food('a', 2)] },
        'repeats the id of an earlier row',
      ],
    ])('refuses %s and writes nothing', async (_name, bad, message) => {
      await db.foods.put(food('local', 1_000))
      const before = await snapshot()

      const attempt = mergeFromBackup({ foods: [food('ok', 1)], ...bad } as BackupPayload)

      await expect(attempt).rejects.toBeInstanceOf(RestoreError)
      await expect(attempt).rejects.toThrow(message)
      expect(await snapshot()).toEqual(before)
    })

    it('rolls the transaction back when the database refuses a write', async () => {
      await db.foods.put(food('local', 1_000))
      const before = await snapshot()

      vi.spyOn(db.logEntries, 'bulkPut').mockRejectedValue(new Error('disk full'))
      const attempt = mergeFromBackup({ foods: [food('new', 1)], logEntries: [entry(1)] })

      await expect(attempt).rejects.toMatchObject({ code: 'write-failed' })
      expect(await snapshot()).toEqual(before)
    })

    it('accepts a payload held in reactive state', async () => {
      await mergeFromBackup(reactive({ foods: [food('a', 1)] }) as BackupPayload)

      expect(await db.foods.count()).toBe(1)
    })
  })
})

describe('previewMerge', () => {
  it('reports what a merge would do and writes nothing', async () => {
    await db.foods.bulkPut([food('a', 1_000), food('b', 5_000)])
    await db.logEntries.put(entry(1, { name: 'Local', createdAt: 1 }) as never)
    const before = await snapshot()
    const incoming: BackupPayload = {
      foods: [food('a', 2_000), food('b', 1_000), food('c', 1)],
      logEntries: [entry(1, { name: 'Other', createdAt: 2 })],
    }

    const counts = await previewMerge(incoming)

    expect(counts.foods).toEqual({ added: 1, updated: 1, kept: 1 })
    expect(counts.logEntries).toEqual({ added: 1, updated: 0, kept: 0 })
    expect(await snapshot()).toEqual(before)
    expect(await mergeFromBackup(incoming)).toEqual(counts)
  })

  it('reports the same counts as the merge on a mixed fixture, colliding log ids included', async () => {
    await db.foods.bulkPut([
      food('same', 1_000),
      food('local-newer', 5_000),
      food('backup-newer', 1_000),
    ])
    await db.nutrientGoals.put(goal('protein', 90, 1_000) as never)
    await db.logEntries.bulkPut([
      entry(1, { name: 'Local breakfast', createdAt: 10, updatedAt: 1_000 }),
      entry(2, { name: 'Local lunch', createdAt: 20, updatedAt: 5_000 }),
      entry(3, { name: 'Local dinner', createdAt: 30, updatedAt: 1_000 }),
    ] as never[])
    const incoming: BackupPayload = {
      foods: [
        food('same', 1_000),
        food('local-newer', 1_000),
        food('backup-newer', 5_000),
        food('only-backup', 1_000),
      ],
      goals: [goal('protein', 120, 2_000), goal('energy', 2000, 1_000)],
      logEntries: [
        // Same record as local 1, written later: updated.
        entry(1, { name: 'Local breakfast', createdAt: 10, updatedAt: 2_000 }),
        // Same record as local 2, written earlier: kept.
        entry(2, { name: 'Local lunch', createdAt: 20, updatedAt: 1_000 }),
        // A different entry that shares local 3's id: added under a fresh id.
        entry(3, { name: 'Remote snack', createdAt: 40, updatedAt: 1_000 }),
        // A different entry whose id is free here: added as it is.
        entry(8, { name: 'Remote supper', createdAt: 50, updatedAt: 1_000 }),
      ],
    }
    const before = await snapshot()

    const previewed = await previewMerge(incoming)

    expect(await snapshot()).toEqual(before)
    expect(previewed).toEqual({
      foods: { added: 1, updated: 1, kept: 2 },
      goals: { added: 1, updated: 1, kept: 0 },
      logEntries: { added: 2, updated: 1, kept: 1 },
    })
    expect(await mergeFromBackup(incoming)).toEqual(previewed)
    expect(await db.logEntries.count()).toBe(5)
  })
})

describe('a row dated in the future', () => {
  const NOW = 1_800_000_000_000
  const DAY = 86_400_000

  it('is refused in every class, naming the row, and nothing is written', async () => {
    await db.foods.put(food('local', 1_000))
    const before = await snapshot()
    const ahead = NOW + DAY + 1
    const rows: [string, BackupPayload][] = [
      ['foods row 2', { foods: [food('a', 1), food('b', ahead)] }],
      ['mealTemplates row 1', { mealTemplates: [meal('m1', ahead)] }],
      [
        'dayTemplates row 1',
        { dayTemplates: [day('d1', ['m1'], ahead)], mealTemplates: [meal('m1')] },
      ],
      ['logEntries row 1', { logEntries: [entry(1, { updatedAt: ahead })] }],
      ['goals row 1', { goals: [goal('energy', 2000, ahead)] }],
    ]

    for (const [where, payload] of rows) {
      const attempt = mergeFromBackup(payload, NOW)

      await expect(attempt).rejects.toBeInstanceOf(RestoreError)
      await expect(attempt).rejects.toThrow(`${where} is dated in the future.`)
      await expect(replaceFromBackup(payload, NOW)).rejects.toThrow('is dated in the future')
      await expect(validatePayload(payload, 'merge', NOW)).rejects.toMatchObject({
        code: 'invalid-row',
      })
    }

    expect(await snapshot()).toEqual(before)
  })

  it('allows a day of clock drift, and anything in the past', async () => {
    await expect(
      mergeFromBackup({ foods: [food('a', NOW + DAY), food('b', 1)] }, NOW),
    ).resolves.toBeDefined()
  })
})
