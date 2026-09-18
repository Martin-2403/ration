// Logging writes through the store, which opens Dexie.
import 'fake-indexeddb/auto'

import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { addLocalDays, localMiddayFromISODate, startOfLocalDay, toISODate } from '../../dates'
import { db, mealTemplates } from '../../db'
import router from '../../router'
import LogView from '../LogView.vue'

const render = async () => {
  router.push('/log')
  await router.isReady()
  const wrapper = mount(LogView, { global: { plugins: [router] } })
  await flushPromises()

  // The template list is read from Dexie (#96) rather than imported, so the
  // count on the meals entry is not there on the first tick. One flush was
  // enough in isolation and not under the full suite, which is the worst way
  // for this to be wrong — wait for a resolved count rather than count ticks.
  await vi.waitFor(() => expect(wrapper.text()).toMatch(/[1-9]\d* saved/))

  return wrapper
}

/**
 * Meals sit one step in from the options (#98), so anything that logs a
 * template goes through here first.
 */
const openMeals = async (wrapper: Awaited<ReturnType<typeof render>>) => {
  await optionNamed(wrapper, 'A meal').trigger('click')
  await flushPromises()
}

const optionNamed = (wrapper: Awaited<ReturnType<typeof render>>, label: string) =>
  wrapper.findAll('.options button').find((button) => button.text().includes(label))!

const buttonNamed = (wrapper: Awaited<ReturnType<typeof render>>, label: string) =>
  wrapper.findAll('button').find((button) => button.text() === label)!

const yesterday = () => toISODate(addLocalDays(startOfLocalDay(), -1))

beforeEach(async () => {
  await Promise.all([db.logEntries.clear(), db.foods.clear(), db.mealTemplates.clear()])
  setActivePinia(createPinia())
})

describe('LogView', () => {
  it('defaults to today', async () => {
    const wrapper = await render()

    expect((wrapper.find('#log-date').element as HTMLInputElement).value).toBe(toISODate())
  })

  it('refuses a future date', async () => {
    const wrapper = await render()

    // An entry that has not happened is a plan, not intake — §8 models planned
    // intake separately and #52 deferred it to layer 4.
    expect(wrapper.find('#log-date').attributes('max')).toBe(toISODate())
  })

  it('offers every way of adding to a day', async () => {
    const wrapper = await render()

    // One home for all of them (#53, #62), so a new route in is an entry here
    // rather than another block on the summary screen.
    // One entry for meals rather than one per template: they are things among
    // verbs, and only they grow (#98).
    expect(optionNamed(wrapper, 'A meal')).toBeDefined()
    // The entry names a couple of meals in its summary, so asserting the
    // absence of "Porridge" would only be catching that text. The count is the
    // claim: four entries, however many templates exist.
    expect(wrapper.findAll('.options button')).toHaveLength(4)
    expect(optionNamed(wrapper, 'A meal').text()).toContain('1 saved · Porridge')
    expect(optionNamed(wrapper, 'A food you have already')).toBeDefined()
    expect(optionNamed(wrapper, 'A variation of a food')).toBeDefined()
    expect(optionNamed(wrapper, 'A food by hand')).toBeDefined()
  })

  it('offers the saved food before hand entry', async () => {
    const wrapper = await render()
    const labels = wrapper.findAll('.options button').map((button) => button.text())

    // Reaching for the form first is what fills the cache with copies of the
    // same apple, which is the cause #40 removes rather than cleaning up after.
    expect(labels.findIndex((l) => l.includes('already'))).toBeLessThan(
      labels.findIndex((l) => l.includes('by hand')),
    )
  })

  it('logs a saved food against the chosen day', async () => {
    const wrapper = await render()
    await wrapper.find('#log-date').setValue(yesterday())
    await optionNamed(wrapper, 'A food you have already').trigger('click')
    await flushPromises()

    const banana = wrapper
      .findAll('.results button')
      .find((button) => button.text().includes('Banana'))!
    await banana.trigger('click')
    await wrapper.find('#picker-grams').setValue('120')
    await wrapper.find('button.primary').trigger('click')

    await vi.waitFor(async () => expect(await db.logEntries.count()).toBe(1))
    const [entry] = await db.logEntries.toArray()
    // Backdating is the view's job, not the picker's — the same contract
    // FoodForm has, so neither component knows about #61.
    expect(entry!.timestamp).toBe(localMiddayFromISODate(yesterday()))
    expect(entry!.items[0]).toMatchObject({ foodId: 'banana', grams: 120 })
  })

  it('logs a meal against today at the time of the write', async () => {
    const wrapper = await render()
    await openMeals(wrapper)
    await optionNamed(wrapper, 'Porridge').trigger('click')
    await flushPromises()

    const before = Date.now()
    await buttonNamed(wrapper, 'Log meal').trigger('click')
    await vi.waitFor(async () => expect(await db.logEntries.count()).toBe(1))

    const [entry] = await db.logEntries.toArray()
    // Not a timestamp captured when the screen opened.
    expect(entry!.timestamp).toBeGreaterThanOrEqual(before)
    expect(entry!.timestamp).toBeLessThanOrEqual(Date.now())
  })

  it('logs a meal against a chosen earlier day', async () => {
    const wrapper = await render()
    await wrapper.find('#log-date').setValue(yesterday())
    await openMeals(wrapper)
    await optionNamed(wrapper, 'Porridge').trigger('click')
    await flushPromises()

    await buttonNamed(wrapper, 'Log meal').trigger('click')
    await vi.waitFor(async () => expect(await db.logEntries.count()).toBe(1))

    const [entry] = await db.logEntries.toArray()
    // Midday on the named day: inside it whether the day is 23, 24 or 25 hours
    // long, so no §9 window can disagree about which day it belongs to.
    expect(entry!.timestamp).toBe(localMiddayFromISODate(yesterday()))
  })

  it('logs a hand-entered food against the chosen day', async () => {
    const wrapper = await render()
    await wrapper.find('#log-date').setValue(yesterday())
    await optionNamed(wrapper, 'A food by hand').trigger('click')
    await flushPromises()

    await wrapper.find('#food-name').setValue('Apple')
    await wrapper.find('#food-grams').setValue('150')
    await wrapper.find('#food-energy').setValue('52')
    await wrapper.find('form').trigger('submit')

    await vi.waitFor(async () => expect(await db.logEntries.count()).toBe(1))
    const [entry] = await db.logEntries.toArray()
    expect(entry!.timestamp).toBe(localMiddayFromISODate(yesterday()))
    expect(entry!.items[0]).toMatchObject({ grams: 150 })
  })

  it('clones a food and logs the copy against the chosen day', async () => {
    const wrapper = await render()
    await wrapper.find('#log-date').setValue(yesterday())
    await optionNamed(wrapper, 'A variation of a food').trigger('click')
    await flushPromises()

    // Pick a source, which prefills the form rather than logging anything.
    const banana = wrapper
      .findAll('.results button')
      .find((button) => button.text().includes('Banana'))!
    await banana.trigger('click')
    await flushPromises()

    expect((wrapper.find('#food-name').element as HTMLInputElement).value).toBe('Banana')
    expect((wrapper.find('#food-energy').element as HTMLInputElement).value).toBe('90')

    await wrapper.find('#food-name').setValue('Banana, dried')
    await wrapper.find('#food-energy').setValue('340')
    await wrapper.find('#food-grams').setValue('30')
    await wrapper.find('form').trigger('submit')

    await vi.waitFor(async () => expect(await db.logEntries.count()).toBe(1))
    const [entry] = await db.logEntries.toArray()
    expect(entry!.name).toBe('Banana, dried')
    expect(entry!.timestamp).toBe(localMiddayFromISODate(yesterday()))

    // A new food, and the seed it came from is untouched — seeds are never
    // stored at all (§13), so the clone is the only thing in the table.
    const stored = await db.foods.toArray()
    expect(stored).toHaveLength(1)
    expect(stored[0]!.id).not.toBe('banana')
    expect(stored[0]!.name).toBe('Banana, dried')
  })

  it('lists a stored meal template alongside the seeds', async () => {
    await mealTemplates.put({
      id: 'lunch',
      name: 'Cheese sandwich',
      slots: [
        {
          id: 'bread',
          label: 'Bread',
          kind: 'fixed',
          options: ['oats'],
          defaultOptionId: 'oats',
          defaultGrams: 80,
        },
      ],
    })
    const wrapper = await render()

    // The view read SEED_TEMPLATES directly, so a template the user built was
    // unreachable — the same gap #40 closed for foods (#96).
    await openMeals(wrapper)

    expect(optionNamed(wrapper, 'Cheese sandwich')).toBeDefined()
    expect(optionNamed(wrapper, 'Cheese sandwich').text()).toContain('Yours')
    expect(optionNamed(wrapper, 'Porridge').text()).toContain('Comes with the app')
  })

  it('goes from building a meal straight into logging it', async () => {
    const wrapper = await render()
    await openMeals(wrapper)
    await optionNamed(wrapper, 'Build a meal').trigger('click')
    await flushPromises()

    await wrapper.find('#template-name').setValue('Second breakfast')
    await wrapper.find('#slot-0-label').setValue('Base')
    await wrapper.findAll('button').find((b) => b.text() === 'Add a food')!.trigger('click')
    await flushPromises()
    await wrapper
      .findAll('.results button')
      .find((b) => b.text().includes('Banana'))!
      .trigger('click')
    await flushPromises()
    await wrapper.findAll('button').find((b) => b.text() === 'Save the meal')!.trigger('click')
    await flushPromises()
    // Twice: the save awaits the write, and the handler then awaits a re-read
    // of the list before switching the view.
    await flushPromises()

    // Someone describing a meal is describing it because they are eating it;
    // sending them back to the list would make them find it again.
    expect(await db.mealTemplates.count()).toBe(1)
    expect(wrapper.text()).toContain('Log meal')
  })

  it('says when the date is not today', async () => {
    const wrapper = await render()
    expect(wrapper.text()).not.toContain('not today')

    await wrapper.find('#log-date').setValue(yesterday())

    // Backdating is deliberate, so it is stated rather than left to be noticed
    // in the log afterwards.
    expect(wrapper.text()).toContain(`Logging against ${yesterday()}`)
  })

  it('refuses to log at all without a usable date', async () => {
    const wrapper = await render()

    await wrapper.find('#log-date').setValue('')

    // A cleared field must block the write rather than fall back to a day the
    // user did not choose.
    expect(wrapper.text()).toContain('Pick a date before logging')
    expect(wrapper.find('.options').exists()).toBe(false)
  })

  it('confirms what was logged and against which day', async () => {
    const wrapper = await render()
    await wrapper.find('#log-date').setValue(yesterday())
    await openMeals(wrapper)
    await optionNamed(wrapper, 'Porridge').trigger('click')
    await flushPromises()

    await buttonNamed(wrapper, 'Log meal').trigger('click')

    await vi.waitFor(() => expect(wrapper.text()).toContain('Logged Porridge'))
    expect(wrapper.text()).toContain(yesterday())
    expect(wrapper.find('.confirmation a').attributes('href')).toBe('/')
  })

  it('returns to the list with the date intact, so a second meal is one tap away', async () => {
    const wrapper = await render()
    await wrapper.find('#log-date').setValue(yesterday())
    await openMeals(wrapper)
    await optionNamed(wrapper, 'Porridge').trigger('click')
    await flushPromises()
    await buttonNamed(wrapper, 'Log meal').trigger('click')

    await vi.waitFor(() => expect(wrapper.find('.options').exists()).toBe(true))
    // Backfilling a day means logging several meals against it in a row.
    expect((wrapper.find('#log-date').element as HTMLInputElement).value).toBe(yesterday())
  })

  it('steps back to the meals rather than out of them', async () => {
    const wrapper = await render()
    await openMeals(wrapper)
    await optionNamed(wrapper, 'Porridge').trigger('click')

    // One step out, not two. With the meals behind an entry of their own, a
    // single coarse back button discarded both (#98).
    await buttonNamed(wrapper, '← Other meals').trigger('click')

    expect(optionNamed(wrapper, 'Porridge')).toBeDefined()
    expect(optionNamed(wrapper, 'A food by hand')).toBeUndefined()
    expect(await db.logEntries.count()).toBe(0)
  })

  it('steps back from a variation to the picker, not out of the flow', async () => {
    const wrapper = await render()
    await optionNamed(wrapper, 'A variation of a food').trigger('click')
    await flushPromises()

    await wrapper
      .findAll('.results button')
      .find((button) => button.text().includes('Banana'))!
      .trigger('click')
    await flushPromises()

    // Picking the wrong source used to mean going out to the options and
    // losing everything typed — there was no step back at all (#95).
    await buttonNamed(wrapper, '← Other foods').trigger('click')
    await flushPromises()

    expect(wrapper.find('#picker-query').exists()).toBe(true)
  })

  it('leaves the options entirely from the top of a flow', async () => {
    const wrapper = await render()
    await optionNamed(wrapper, 'A food by hand').trigger('click')

    await buttonNamed(wrapper, '← Everything else').trigger('click')

    expect(optionNamed(wrapper, 'A meal')).toBeDefined()
    expect(await db.logEntries.count()).toBe(0)
  })
})
