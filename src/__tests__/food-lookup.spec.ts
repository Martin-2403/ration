// searchFoods reads the stored foods through Dexie, and jsdom has no IndexedDB.
import 'fake-indexeddb/auto'

import { beforeEach, describe, expect, it } from 'vitest'

import { SEED_FOODS } from '../data/foods'
import { db, foods } from '../db'
import { searchFoods } from '../food-lookup'
import type { Food } from '../types'

const stored = (id: string, name: string): Food => ({
  id,
  name,
  per100g: { energy: { value: 100, source: 'user' } },
})

const names = (matches: Awaited<ReturnType<typeof searchFoods>>) =>
  matches.map((match) => match.food.name)

beforeEach(async () => {
  await db.foods.clear()
})

describe('searchFoods', () => {
  it('lists what there is when nothing has been typed', async () => {
    // The picker opens before the user types, and an empty list would read as
    // "you have no foods" rather than "no query yet".
    expect(names(await searchFoods(''))).toEqual(
      [...SEED_FOODS].map((food) => food.name).sort((a, b) => a.localeCompare(b)),
    )
  })

  it('finds a stored food alongside the seeds', async () => {
    await foods.put(stored('apple', 'Apple'))

    // The whole point of #40: a hand-entered food was unreachable once saved.
    expect(names(await searchFoods('appl'))).toEqual(['Apple'])
  })

  it('ignores case and diacritics', async () => {
    await foods.put(stored('muesli', 'Müsli'))

    // §14 puts this app in Germany, and nobody types the umlaut when searching.
    expect(names(await searchFoods('musli'))).toEqual(['Müsli'])
    expect(names(await searchFoods('MÜSLI'))).toEqual(['Müsli'])
  })

  it('ranks a name that starts with the query above one that contains it', async () => {
    // "Oat drink, fortified" and "Rolled oats" both match "oat".
    expect(names(await searchFoods('oat'))).toEqual(['Oat drink, fortified', 'Rolled oats'])
  })

  it('orders alphabetically within the same kind of match', async () => {
    await foods.put(stored('a1', 'Bread'))
    await foods.put(stored('a2', 'Apricot'))

    // A single letter matches more than it looks like it should — "Blueberries"
    // and "Oat drink" both carry an r — which is the point: only "Rolled oats"
    // starts with one, and everything after it is alphabetical regardless of
    // whether it came from a seed or the store.
    expect(names(await searchFoods('r'))).toEqual([
      'Rolled oats',
      'Apricot',
      'Blueberries',
      'Bread',
      'Oat drink, fortified',
    ])
  })

  it('never offers a stored food that shadows a seed', async () => {
    // Same precedence findFood applies (§13): a release that corrects a seed
    // must win, so a stored copy under the same id is dropped rather than
    // listed twice or listed instead.
    await foods.put(stored('oats', 'Rolled oats (stale copy)'))

    const matches = await searchFoods('rolled')

    expect(names(matches)).toEqual(['Rolled oats'])
    expect(matches[0]!.origin).toBe('seed')
  })

  it('says which path each match came from', async () => {
    await foods.put(stored('apple', 'Apple'))

    expect((await searchFoods('apple'))[0]!.origin).toBe('stored')
    expect((await searchFoods('banana'))[0]!.origin).toBe('seed')
  })

  it('returns nothing for a query that matches nothing', async () => {
    expect(await searchFoods('zzzz')).toEqual([])
  })

  it('caps the number of results', async () => {
    for (let i = 0; i < 30; i += 1) await foods.put(stored(`f${i}`, `Food ${i}`))

    expect(await searchFoods('food', 5)).toHaveLength(5)
  })
})
