// Saves through the repository, and jsdom has no IndexedDB.
import 'fake-indexeddb/auto'

import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createPinia, setActivePinia } from 'pinia'

import { db, dayTemplates, mealTemplates } from '../../db'
import type { DayTemplate, MealTemplate } from '../../types'
import { listMealTemplates } from '../../template-lookup'
import DayRunner from '../DayRunner.vue'
import DayTemplateForm from '../DayTemplateForm.vue'

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

const render = async (draft?: DayTemplate, existing?: boolean) => {
  const wrapper = mount(DayTemplateForm, { props: { draft, existing } })
  await flushPromises()

  return wrapper
}

type Wrapper = Awaited<ReturnType<typeof render>>

const buttonNamed = (wrapper: Wrapper, label: string) =>
  wrapper.findAll('button').find((button) => button.text() === label)!

const labelled = (wrapper: Wrapper, label: string) =>
  wrapper.findAll('button').find((button) => button.attributes('aria-label') === label)!

/** Picks a meal in the dropdown and adds it to the day. */
const addMeal = async (wrapper: Wrapper, id: string) => {
  await wrapper.find('#day-add-meal').setValue(id)
  await buttonNamed(wrapper, 'Add meal').trigger('click')
}

/** The first meal the dropdown offers, so a day can be saved without the food. */
const listFirstId = async () => (await listMealTemplates())[0]?.template.id

const order = (wrapper: Wrapper) => wrapper.findAll('.meal-name').map((row) => row.text())

beforeEach(async () => {
  await Promise.all([db.dayTemplates.clear(), db.mealTemplates.clear()])
})

describe('DayTemplateForm', () => {
  it('offers the seeds and anything the user built', async () => {
    await mealTemplates.put(meal('lunch', 'Cheese sandwich'))
    const wrapper = await render()

    // Same list the meals entry reads (#96), so a day can be made of either.
    expect(wrapper.findAll('#day-add-meal option').map((option) => option.text())).toEqual([
      'Cheese sandwich',
      'Porridge',
    ])
  })

  it('refuses to save without a name', async () => {
    const wrapper = await render()
    await addMeal(wrapper, 'porridge')

    expect(wrapper.text()).toContain('The day needs a name')
    expect(buttonNamed(wrapper, 'Save the day').attributes('disabled')).toBeDefined()
  })

  it('refuses to save a day with no meals', async () => {
    const wrapper = await render()
    await wrapper.find('#day-name').setValue('Workday')

    // It would run to completion having logged nothing.
    expect(wrapper.text()).toContain('A day needs at least one meal')
    expect(buttonNamed(wrapper, 'Save the day').attributes('disabled')).toBeDefined()
  })

  it('stores the meals in the order they were added', async () => {
    await mealTemplates.put(meal('lunch', 'Cheese sandwich'))
    const wrapper = await render()
    await wrapper.find('#day-name').setValue('  Workday  ')
    await addMeal(wrapper, 'porridge')
    await addMeal(wrapper, 'lunch')
    await buttonNamed(wrapper, 'Save the day').trigger('click')
    await flushPromises()

    const [stored] = await db.dayTemplates.toArray()
    expect(stored!.name).toBe('Workday')
    expect(stored!.mealTemplateIds).toEqual(['porridge', 'lunch'])
    expect(wrapper.emitted('saved')).toHaveLength(1)
  })

  it('keeps a meal the day repeats', async () => {
    const wrapper = await render()
    await wrapper.find('#day-name').setValue('Oats twice')
    await addMeal(wrapper, 'porridge')
    await addMeal(wrapper, 'porridge')
    await buttonNamed(wrapper, 'Save the day').trigger('click')
    await flushPromises()

    // A meal eaten twice is named twice; deduplicating would drop the second.
    const [stored] = await db.dayTemplates.toArray()
    expect(stored!.mealTemplateIds).toEqual(['porridge', 'porridge'])
  })

  it('moves a meal up the order', async () => {
    await mealTemplates.put(meal('lunch', 'Cheese sandwich'))
    const wrapper = await render()
    await addMeal(wrapper, 'porridge')
    await addMeal(wrapper, 'lunch')

    await labelled(wrapper, 'Move Cheese sandwich earlier').trigger('click')

    expect(order(wrapper)).toEqual(['Cheese sandwich', 'Porridge'])
  })

  it('cannot move the first meal earlier or the last later', async () => {
    await mealTemplates.put(meal('lunch', 'Cheese sandwich'))
    const wrapper = await render()
    await addMeal(wrapper, 'porridge')
    await addMeal(wrapper, 'lunch')

    expect(labelled(wrapper, 'Move Porridge earlier').attributes('disabled')).toBeDefined()
    expect(labelled(wrapper, 'Move Cheese sandwich later').attributes('disabled')).toBeDefined()
  })

  it('removes a meal from the order', async () => {
    await mealTemplates.put(meal('lunch', 'Cheese sandwich'))
    const wrapper = await render()
    await addMeal(wrapper, 'porridge')
    await addMeal(wrapper, 'lunch')

    await labelled(wrapper, 'Remove Porridge').trigger('click')

    expect(order(wrapper)).toEqual(['Cheese sandwich'])
  })

  it('starts from a clone without touching the day it came from', async () => {
    const wrapper = await render({
      id: 'copy-id',
      name: 'Workday (copy)',
      mealTemplateIds: ['porridge'],
    })

    expect((wrapper.find('#day-name').element as HTMLInputElement).value).toBe('Workday (copy)')
    expect(order(wrapper)).toEqual(['Porridge'])

    await buttonNamed(wrapper, 'Save the day').trigger('click')
    await flushPromises()

    // The id the clone already carries: the copy was made before the form
    // opened, so saving it cannot overwrite the original.
    const stored = await db.dayTemplates.toArray()
    expect(stored.map((day) => day.id)).toEqual(['copy-id'])
  })

  it('stores one day however quickly the button is pressed twice', async () => {
    const wrapper = await render()
    await wrapper.find('#day-name').setValue('Workday')
    await addMeal(wrapper, 'porridge')

    // Both clicks land before the first write resolves; without the guard each
    // minted its own id, so the list grew a second identical day.
    const save = buttonNamed(wrapper, 'Save the day')
    save.trigger('click')
    save.trigger('click')
    await flushPromises()

    expect(await db.dayTemplates.count()).toBe(1)
    expect(wrapper.emitted('saved')).toHaveLength(1)
  })

  it('names a meal that is no longer saved rather than dropping it', async () => {
    const wrapper = await render({ id: 'day', name: 'Workday', mealTemplateIds: ['gone'] })

    // Quietly shortening the day is the §3 mistake in another place.
    expect(order(wrapper)).toEqual(['gone (no longer saved)'])
  })
})

describe('DayTemplateForm, correcting a saved day', () => {
  const stored = { id: 'workday', name: 'Workday', mealTemplateIds: ['porridge'] }

  it('replaces the day rather than adding a near-copy', async () => {
    await dayTemplates.put(stored)
    const wrapper = await render(stored, true)
    await wrapper.find('#day-name').setValue('Office day')
    await buttonNamed(wrapper, 'Save the changes').trigger('click')
    await vi.waitFor(() => expect(wrapper.emitted('updated')).toHaveLength(1))

    const days = await db.dayTemplates.toArray()
    expect(days).toHaveLength(1)
    expect(days[0]).toMatchObject({ id: 'workday', name: 'Office day' })
  })

  it('announces a correction as one', async () => {
    await dayTemplates.put(stored)
    const wrapper = await render(stored, true)
    await buttonNamed(wrapper, 'Save the changes').trigger('click')
    await vi.waitFor(() => expect(wrapper.emitted('updated')).toHaveLength(1))

    expect(wrapper.emitted('saved')).toBeUndefined()
  })

  it('treats a clone as new, id and all', async () => {
    // A clone carries an id before the form opens, so the id cannot be what
    // tells the two apart.
    const wrapper = await render({ ...stored, id: 'copy-id', name: 'Workday (copy)' })
    await buttonNamed(wrapper, 'Save the day').trigger('click')
    await vi.waitFor(() => expect(wrapper.emitted('saved')).toHaveLength(1))

    expect(wrapper.emitted('updated')).toBeUndefined()
  })

  describe('Add a single food', () => {
    /** Walks the picker and the amount step for a seeded food. */
    const addSingle = async (wrapper: Wrapper, foodName: string, grams: string) => {
      await buttonNamed(wrapper, 'Add a single food').trigger('click')
      await flushPromises()
      await wrapper
        .findAll('.results button')
        .find((button) => button.text().includes(foodName))!
        .trigger('click')
      await flushPromises()
      await wrapper.find('#single-grams').setValue(grams)
      await buttonNamed(wrapper, 'Add to the day').trigger('click')
    }

    const save = async (wrapper: Wrapper) => {
      await wrapper.find('#day-name').setValue('Snack day')
      await buttonNamed(wrapper, 'Save the day').trigger('click')
      await vi.waitFor(() => expect(wrapper.emitted('saved')).toHaveLength(1))
    }

    beforeEach(async () => {
      await db.foods.clear()
      setActivePinia(createPinia())
    })

    it('stores a one-slot meal named after the food, and the day names it', async () => {
      const wrapper = await render()
      await addSingle(wrapper, 'Banana', '120')
      await save(wrapper)

      const [stored] = await db.mealTemplates.toArray()
      expect(stored).toMatchObject({
        name: 'Banana',
        slots: [{ label: 'Banana', kind: 'fixed', defaultGrams: 120 }],
      })
      expect(stored!.slots).toHaveLength(1)
      expect(stored!.slots[0]!.options).toEqual([stored!.slots[0]!.defaultOptionId])

      const [day] = await db.dayTemplates.toArray()
      expect(day!.mealTemplateIds).toEqual([stored!.id])
    })

    it('runs through DayRunner like any other meal, at the chosen amount', async () => {
      const wrapper = await render()
      await addSingle(wrapper, 'Banana', '120')
      await save(wrapper)

      const [day] = await db.dayTemplates.toArray()
      const runner = mount(DayRunner, { props: { template: day! } })
      await flushPromises()

      expect(runner.text()).toContain('Meal 1 of 1')
      expect(runner.text()).toContain('Banana')
      expect((runner.find('input[inputmode="decimal"]').element as HTMLInputElement).value).toBe(
        '120',
      )
    })

    it('reuses the same food at the same amount, but not at another', async () => {
      const wrapper = await render()
      await addSingle(wrapper, 'Banana', '120')
      await addSingle(wrapper, 'Banana', '120')
      await addSingle(wrapper, 'Banana', '60')
      await save(wrapper)

      const [day] = await db.dayTemplates.toArray()
      expect(day!.mealTemplateIds).toHaveLength(3)
      expect(day!.mealTemplateIds[0]).toBe(day!.mealTemplateIds[1])
      expect(new Set(day!.mealTemplateIds).size).toBe(2)
      expect(await db.mealTemplates.count()).toBe(2)
    })

    it('stores nothing when the day is cancelled', async () => {
      const wrapper = await render()
      await addSingle(wrapper, 'Banana', '120')
      await buttonNamed(wrapper, 'Cancel').trigger('click')

      expect(wrapper.emitted('cancel')).toHaveLength(1)
      expect(await db.mealTemplates.count()).toBe(0)
    })

    it('does not store a food that was removed from the day again', async () => {
      const wrapper = await render()
      await addSingle(wrapper, 'Banana', '120')
      await labelled(wrapper, 'Remove Banana').trigger('click')
      await addMeal(wrapper, (await listFirstId())!)
      await save(wrapper)

      expect(await db.mealTemplates.count()).toBe(0)
    })

    it('accepts a decimal comma and refuses zero', async () => {
      const wrapper = await render()
      await buttonNamed(wrapper, 'Add a single food').trigger('click')
      await flushPromises()
      await wrapper.find('.results button').trigger('click')
      await flushPromises()

      await wrapper.find('#single-grams').setValue('0')
      expect(buttonNamed(wrapper, 'Add to the day').attributes('disabled')).toBeDefined()

      await wrapper.find('#single-grams').setValue('12,5')
      expect(buttonNamed(wrapper, 'Add to the day').attributes('disabled')).toBeUndefined()
      await buttonNamed(wrapper, 'Add to the day').trigger('click')
      await save(wrapper)

      expect((await db.mealTemplates.toArray())[0]!.slots[0]!.defaultGrams).toBe(12.5)
    })
  })
})
