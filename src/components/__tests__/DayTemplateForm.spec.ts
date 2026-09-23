// Saves through the repository, and jsdom has no IndexedDB.
import 'fake-indexeddb/auto'

import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { db, dayTemplates, mealTemplates } from '../../db'
import type { DayTemplate, MealTemplate } from '../../types'
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
})
