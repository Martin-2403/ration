// Reads stored templates through Dexie, and jsdom has no IndexedDB.
import 'fake-indexeddb/auto'

import { beforeEach, describe, expect, it } from 'vitest'

import { SEED_TEMPLATES } from '../data/foods'
import { db, mealTemplates } from '../db'
import { findMealTemplate, listMealTemplates } from '../template-lookup'
import type { MealTemplate } from '../types'

const template = (id: string, name: string): MealTemplate => ({
  id,
  name,
  slots: [
    {
      id: 'only',
      label: 'Base',
      kind: 'fixed',
      options: ['oats'],
      defaultOptionId: 'oats',
      defaultGrams: 50,
    },
  ],
})

const names = (matches: Awaited<ReturnType<typeof listMealTemplates>>) =>
  matches.map((match) => match.template.name)

beforeEach(async () => {
  await db.mealTemplates.clear()
})

describe('listMealTemplates', () => {
  it('lists the seeds when nothing has been stored', async () => {
    expect(names(await listMealTemplates())).toEqual(SEED_TEMPLATES.map((t) => t.name))
  })

  it('lists a stored template alongside the seeds, alphabetically', async () => {
    await mealTemplates.put(template('lunch', 'Cheese sandwich'))

    // The gap this closes: the table and its repository existed and nothing
    // ever read them, so a saved template was unreachable.
    expect(names(await listMealTemplates())).toEqual(['Cheese sandwich', 'Porridge'])
  })

  it('says which path each came from', async () => {
    await mealTemplates.put(template('lunch', 'Cheese sandwich'))
    const matches = await listMealTemplates()

    expect(matches.map((match) => match.origin)).toEqual(['stored', 'seed'])
  })

  it('never offers a stored template that shadows a seed', async () => {
    await mealTemplates.put(template('porridge', 'Porridge (stale copy)'))

    // Same precedence findMealTemplate applies (§13): a release that corrects a
    // seed has to win.
    const matches = await listMealTemplates()
    expect(names(matches)).toEqual(['Porridge'])
    expect(matches[0]!.origin).toBe('seed')
  })
})

describe('findMealTemplate', () => {
  it('prefers a seed over a stored template with the same id', async () => {
    await mealTemplates.put(template('porridge', 'Porridge (stale copy)'))

    expect((await findMealTemplate('porridge'))!.name).toBe('Porridge')
  })

  it('falls through to the store for anything else', async () => {
    await mealTemplates.put(template('lunch', 'Cheese sandwich'))

    expect((await findMealTemplate('lunch'))!.name).toBe('Cheese sandwich')
  })

  it('resolves nothing for an id that does not exist', async () => {
    expect(await findMealTemplate('nope')).toBeUndefined()
  })
})
