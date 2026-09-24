// Reads stored days through Dexie, and jsdom has no IndexedDB.
import 'fake-indexeddb/auto'

import { beforeEach, describe, expect, it } from 'vitest'

import {
  cloneDayTemplate,
  daysUsingMeal,
  findDayTemplate,
  listDayTemplates,
  moveMeal,
  resolveDayTemplate,
} from '../day-templates'
import { db, dayTemplates, mealTemplates } from '../db'
import type { DayTemplate, MealTemplate } from '../types'

const day = (id: string, name: string, mealTemplateIds: string[] = ['porridge']): DayTemplate => ({
  id,
  name,
  mealTemplateIds,
})

const meal = (id: string, name: string): MealTemplate => ({
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

beforeEach(async () => {
  await Promise.all([db.dayTemplates.clear(), db.mealTemplates.clear()])
})

describe('listDayTemplates', () => {
  it('lists nothing on a fresh install', async () => {
    // No seed path, unlike foods and meals: a usual day is the user's own.
    expect(await listDayTemplates()).toEqual([])
  })

  it('lists what was stored, alphabetically', async () => {
    await dayTemplates.put(day('b', 'Workday'))
    await dayTemplates.put(day('a', 'Rest day'))

    expect((await listDayTemplates()).map((template) => template.name)).toEqual([
      'Rest day',
      'Workday',
    ])
  })
})

describe('findDayTemplate', () => {
  it('resolves a stored day by id', async () => {
    await dayTemplates.put(day('workday', 'Workday'))

    expect((await findDayTemplate('workday'))?.name).toBe('Workday')
  })

  it('resolves nothing for an id that does not exist', async () => {
    expect(await findDayTemplate('nope')).toBeUndefined()
  })
})

describe('resolveDayTemplate', () => {
  it('resolves a seed meal, so a day can be built out of what ships', async () => {
    const resolved = await resolveDayTemplate(day('workday', 'Workday', ['porridge']))

    expect(resolved.meals[0]?.template?.name).toBe('Porridge')
    expect(resolved.missing).toEqual([])
  })

  it('keeps the order the day names, repeats included', async () => {
    await mealTemplates.put(meal('lunch', 'Cheese sandwich'))

    // A meal eaten twice is one the day names twice; deduplicating here would
    // drop the second one silently.
    const resolved = await resolveDayTemplate(
      day('workday', 'Workday', ['porridge', 'lunch', 'porridge']),
    )

    expect(resolved.meals.map((entry) => entry.template?.name)).toEqual([
      'Porridge',
      'Cheese sandwich',
      'Porridge',
    ])
  })

  it('reports a deleted meal rather than dropping it', async () => {
    const resolved = await resolveDayTemplate(day('workday', 'Workday', ['porridge', 'gone']))

    // Running the rest would log an incomplete day that looks complete (§3).
    expect(resolved.meals).toHaveLength(2)
    expect(resolved.meals[1]?.template).toBeUndefined()
    expect(resolved.missing).toEqual(['gone'])
  })

  it('names a missing meal once however often the day names it', async () => {
    const resolved = await resolveDayTemplate(day('workday', 'Workday', ['gone', 'gone']))

    expect(resolved.missing).toEqual(['gone'])
  })
})

describe('cloneDayTemplate', () => {
  it('copies the meals under a new id and name', () => {
    const original = day('workday', 'Workday', ['porridge', 'lunch'])
    const clone = cloneDayTemplate(original, '  Rest day  ')

    expect(clone.id).not.toBe(original.id)
    expect(clone.name).toBe('Rest day')
    expect(clone.mealTemplateIds).toEqual(['porridge', 'lunch'])
  })

  it('does not alias the original order', () => {
    const original = day('workday', 'Workday', ['porridge'])
    const clone = cloneDayTemplate(original, 'Rest day')

    clone.mealTemplateIds.push('lunch')

    expect(original.mealTemplateIds).toEqual(['porridge'])
  })
})

describe('moveMeal', () => {
  it('moves one meal and leaves the rest in their order', () => {
    // A swap would put dinner where breakfast was; the others must close up.
    expect(moveMeal(['breakfast', 'lunch', 'dinner'], 0, 2)).toEqual([
      'lunch',
      'dinner',
      'breakfast',
    ])
  })

  it('moves backwards as well', () => {
    expect(moveMeal(['breakfast', 'lunch', 'dinner'], 2, 0)).toEqual([
      'dinner',
      'breakfast',
      'lunch',
    ])
  })

  it('leaves the order untouched for an index outside the array', () => {
    expect(moveMeal(['breakfast', 'lunch'], 0, 2)).toEqual(['breakfast', 'lunch'])
    expect(moveMeal(['breakfast', 'lunch'], -1, 0)).toEqual(['breakfast', 'lunch'])
  })

  it('returns a new array rather than reordering in place', () => {
    const order = ['breakfast', 'lunch']
    moveMeal(order, 0, 1)

    expect(order).toEqual(['breakfast', 'lunch'])
  })
})

describe('daysUsingMeal', () => {
  it('finds every day that names the meal, in the order given', () => {
    const workday = day('workday', 'Workday', ['porridge', 'lunch'])
    const restDay = day('rest', 'Rest day', ['lunch'])
    const other = day('other', 'Something else', ['porridge'])

    expect(daysUsingMeal([workday, restDay, other], 'lunch')).toEqual([workday, restDay])
  })

  it('finds nothing when no day names the meal', () => {
    const other = day('other', 'Something else', ['porridge'])

    expect(daysUsingMeal([other], 'lunch')).toEqual([])
  })

  it('counts a day once even if it names the meal twice', () => {
    const twice = day('twice', 'Twice', ['lunch', 'lunch'])

    expect(daysUsingMeal([twice], 'lunch')).toEqual([twice])
  })
})
