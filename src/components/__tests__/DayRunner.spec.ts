// Logging writes through the store, which opens Dexie.
import 'fake-indexeddb/auto'

import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { db, mealTemplates } from '../../db'
import type { DayTemplate, MealTemplate } from '../../types'
import DayRunner from '../DayRunner.vue'

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

const day = (mealTemplateIds: string[]): DayTemplate => ({
  id: 'workday',
  name: 'Workday',
  mealTemplateIds,
})

const render = async (template: DayTemplate, eatenAt?: number) => {
  const wrapper = mount(DayRunner, { props: { template, eatenAt } })
  await flushPromises()

  return wrapper
}

type Wrapper = Awaited<ReturnType<typeof render>>

const buttonNamed = (wrapper: Wrapper, label: string) =>
  wrapper.findAll('button').find((button) => button.text() === label)!

/** Moves past the meal on screen, letting the next builder resolve its foods. */
const press = async (wrapper: Wrapper, label: string) => {
  await buttonNamed(wrapper, label).trigger('click')
  await flushPromises()
}

/** Logs the meal on screen and waits for the entry to land. */
const logMeal = async (wrapper: Wrapper, expected: number) => {
  await buttonNamed(wrapper, 'Log meal').trigger('click')
  await vi.waitFor(async () => expect(await db.logEntries.count()).toBe(expected))
  await flushPromises()
}

beforeEach(async () => {
  await Promise.all([db.logEntries.clear(), db.foods.clear(), db.mealTemplates.clear()])
  setActivePinia(createPinia())
})

describe('DayRunner', () => {
  it('walks the meals in order, one entry each', async () => {
    await mealTemplates.put(meal('lunch', 'Cheese sandwich'))
    const wrapper = await render(day(['porridge', 'lunch']))

    expect(wrapper.text()).toContain('Meal 1 of 2')
    expect(wrapper.text()).toContain('Porridge')

    await logMeal(wrapper, 1)
    expect(wrapper.text()).toContain('Meal 2 of 2')
    expect(wrapper.text()).toContain('Cheese sandwich')

    await logMeal(wrapper, 2)

    // Real entries through the ordinary builder, not a bulk write: each one
    // carries its own snapshot and its own confirmed amounts (§9, #52).
    const entries = await db.logEntries.toArray()
    expect(entries.map((entry) => entry.name)).toEqual(['Porridge', 'Cheese sandwich'])
    expect(entries.every((entry) => entry.templateId !== undefined)).toBe(true)
  })

  it('gives a repeated meal a fresh draft rather than the one left behind', async () => {
    const wrapper = await render(day(['porridge', 'porridge']))
    await wrapper.findAll('input')[0]!.setValue('75')
    await press(wrapper, 'Skip this meal')

    // The builder resets itself after logging, so only a skip exposes this:
    // without a draft per position, the amount typed for the porridge that was
    // not eaten would be logged for the one that was.
    expect((wrapper.findAll('input')[0]!.element as HTMLInputElement).value).toBe('50')

    await logMeal(wrapper, 1)
    const [entry] = await db.logEntries.toArray()
    expect(entry!.items[0]!.kind === 'food' && entry!.items[0]!.grams).toBe(50)
  })

  it('skips a meal without logging it and carries on', async () => {
    await mealTemplates.put(meal('lunch', 'Cheese sandwich'))
    const wrapper = await render(day(['porridge', 'lunch']))

    // A usual day is usual, not certain: a runner that could only be completed
    // or abandoned would be abandoned the first time lunch was different.
    await press(wrapper, 'Skip this meal')

    expect(wrapper.text()).toContain('Meal 2 of 2')
    await logMeal(wrapper, 1)
    expect((await db.logEntries.toArray())[0]!.name).toBe('Cheese sandwich')
  })

  it('reports a meal that is no longer saved instead of passing over it', async () => {
    const wrapper = await render(day(['gone', 'porridge']))

    // Running the rest would log an incomplete day that looks complete (§3).
    expect(wrapper.text()).toContain('Meal 1 of 2')
    expect(wrapper.text()).toContain('no longer saved')
    expect(buttonNamed(wrapper, 'Log meal')).toBeUndefined()

    await press(wrapper, 'Continue')
    expect(wrapper.text()).toContain('Porridge')
  })

  it('counts what was logged rather than what was planned', async () => {
    await mealTemplates.put(meal('lunch', 'Cheese sandwich'))
    const wrapper = await render(day(['porridge', 'lunch']))
    await logMeal(wrapper, 1)
    await press(wrapper, 'Skip this meal')

    expect(wrapper.text()).toContain('Logged 1 of 2')
  })

  it('names the meals it could not log at the end', async () => {
    const wrapper = await render(day(['porridge', 'gone']))
    await logMeal(wrapper, 1)
    await press(wrapper, 'Continue')

    expect(wrapper.text()).toContain('no longer saved: gone')
  })

  it('finishes on the user saying so, with the count it logged', async () => {
    const wrapper = await render(day(['porridge']))
    await logMeal(wrapper, 1)

    // The end of the run is a step, not an exit: it is the one place the whole
    // day can be read back.
    expect(wrapper.emitted('done')).toBeUndefined()
    await buttonNamed(wrapper, 'Done').trigger('click')

    expect(wrapper.emitted('done')).toEqual([[1]])
  })

  it('backdates every meal it logs', async () => {
    const eatenAt = Date.parse('2026-09-18T12:00:00Z')
    const wrapper = await render(day(['porridge']), eatenAt)
    await logMeal(wrapper, 1)

    // The date is the log screen's to decide (#61); the runner only passes it
    // down, once per meal.
    expect((await db.logEntries.toArray())[0]!.timestamp).toBe(eatenAt)
  })
})
