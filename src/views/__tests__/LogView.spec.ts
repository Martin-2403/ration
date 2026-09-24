// Logging writes through the store, which opens Dexie.
import 'fake-indexeddb/auto'

import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { addLocalDays, localMiddayFromISODate, startOfLocalDay, toISODate } from '../../dates'
import { db, dayTemplates, mealTemplates } from '../../db'
import router from '../../router'
import { useLogStore } from '../../stores/log'
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

/** Days sit one step in as well, above the meals they are made of (#52). */
const openDays = async (wrapper: Awaited<ReturnType<typeof render>>) => {
  await optionNamed(wrapper, 'A usual day').trigger('click')
  await flushPromises()
}

const optionNamed = (wrapper: Awaited<ReturnType<typeof render>>, label: string) =>
  wrapper.findAll('.options button').find((button) => button.text().includes(label))!

const buttonNamed = (wrapper: Awaited<ReturnType<typeof render>>, label: string) =>
  wrapper.findAll('button').find((button) => button.text() === label)!

/** The row actions beside a list entry carry their subject in the label. */
const labelled = (wrapper: Awaited<ReturnType<typeof render>>, label: string) =>
  wrapper.findAll('button').find((button) => button.attributes('aria-label') === label)!

const yesterday = () => toISODate(addLocalDays(startOfLocalDay(), -1))

beforeEach(async () => {
  await Promise.all([
    db.logEntries.clear(),
    db.foods.clear(),
    db.mealTemplates.clear(),
    db.dayTemplates.clear(),
  ])
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
    expect(optionNamed(wrapper, 'A usual day')).toBeDefined()
    expect(optionNamed(wrapper, 'A meal')).toBeDefined()
    // The entries name a couple of their contents in the summary, so asserting
    // the absence of "Porridge" would only be catching that text. The count is
    // the claim: five entries, however many templates exist.
    expect(wrapper.findAll('.options button')).toHaveLength(5)
    expect(optionNamed(wrapper, 'A meal').text()).toContain('1 saved · Porridge')
    expect(optionNamed(wrapper, 'A food you have already')).toBeDefined()
    expect(optionNamed(wrapper, 'A variation of a food')).toBeDefined()
    expect(optionNamed(wrapper, 'A food by hand')).toBeDefined()
  })

  it('says a day has to be built before there is one to run', async () => {
    const wrapper = await render()

    // Nothing ships: a usual day is personal in a way a porridge recipe is
    // not, so an empty list is the normal first state (#52).
    expect(optionNamed(wrapper, 'A usual day').text()).toContain('None yet')
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

  it('logs a picked food once however quickly the button is pressed twice', async () => {
    // Spied before the view mounts: the store is a singleton per pinia, so
    // this is the same object LogView resolves, and it dies with the pinia
    // that beforeEach replaces.
    const store = useLogStore()
    vi.spyOn(store, 'logFood')

    const wrapper = await render()
    await optionNamed(wrapper, 'A food you have already').trigger('click')
    await flushPromises()

    const banana = wrapper
      .findAll('.results button')
      .find((button) => button.text().includes('Banana'))!
    await banana.trigger('click')
    await wrapper.find('#picker-grams').setValue('120')

    // FoodPicker keeps its chosen food and amount after emitting, so the guard
    // has to sit where the await is (#106).
    const button = wrapper.find('button.primary')
    button.trigger('click')
    button.trigger('click')
    await flushPromises()

    // Counting the calls, not the rows: both emits are synchronous, while a
    // row only lands after a real timer tick — so counting rows after a flush
    // called an unguarded double write a pass.
    expect(store.logFood).toHaveBeenCalledTimes(1)

    // Settle before the test ends: a row landing after the next test's
    // beforeEach has cleared the table turns up as that test's entry.
    await vi.waitFor(async () => expect(await db.logEntries.count()).toBe(1))
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

  it('offers Edit on a meal the user built, not on one that ships', async () => {
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
    await openMeals(wrapper)

    // A seed is corrected by a release, and a stored copy of one is shadowed
    // by it anyway (§13) — so offering to edit it would be a dead end.
    expect(labelled(wrapper, 'Edit Cheese sandwich')).toBeDefined()
    expect(labelled(wrapper, 'Edit Porridge')).toBeUndefined()
  })

  it('corrects a saved meal in place and lands back on the meals', async () => {
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
    await openMeals(wrapper)
    await labelled(wrapper, 'Edit Cheese sandwich').trigger('click')
    await flushPromises()

    await wrapper.find('#slot-0-grams').setValue('95')
    await buttonNamed(wrapper, 'Save the changes').trigger('click')
    await vi.waitFor(() => expect(optionNamed(wrapper, 'Cheese sandwich')).toBeDefined())

    // Correcting an amount is not a step towards eating it, so the builder
    // would read as though the fix had logged something (#101).
    expect(wrapper.text()).not.toContain('Log meal')
    const stored = await db.mealTemplates.toArray()
    expect(stored).toHaveLength(1)
    expect(stored[0]!.slots[0]!.defaultGrams).toBe(95)
    expect(stored[0]!.slots[0]!.id).toBe('bread')
  })

  it('corrects a saved day in place and lands back on the days', async () => {
    await dayTemplates.put({ id: 'workday', name: 'Workday', mealTemplateIds: ['porridge'] })
    const wrapper = await render()
    await openDays(wrapper)
    await labelled(wrapper, 'Edit Workday').trigger('click')
    await flushPromises()

    await wrapper.find('#day-name').setValue('Office day')
    await buttonNamed(wrapper, 'Save the changes').trigger('click')
    await vi.waitFor(() => expect(optionNamed(wrapper, 'Office day')).toBeDefined())

    expect(wrapper.text()).not.toContain('Meal 1 of 1')
    const days = await db.dayTemplates.toArray()
    expect(days).toHaveLength(1)
    expect(days[0]).toMatchObject({ id: 'workday', name: 'Office day' })
  })

  it('requires a second tap before removing a saved meal', async () => {
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
    await openMeals(wrapper)
    await labelled(wrapper, 'Remove Cheese sandwich').trigger('click')

    // A template can be the only definition a day's slot falls back to, so
    // the first tap only arms it (#101).
    expect(await db.mealTemplates.count()).toBe(1)
    expect(wrapper.text()).toContain('Remove Cheese sandwich?')

    await labelled(wrapper, 'Cancel removing Cheese sandwich').trigger('click')
    expect(optionNamed(wrapper, 'Cheese sandwich')).toBeDefined()
    expect(await db.mealTemplates.count()).toBe(1)
  })

  it('removes a saved meal on the second tap', async () => {
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
    await openMeals(wrapper)
    await labelled(wrapper, 'Remove Cheese sandwich').trigger('click')
    await labelled(wrapper, 'Remove Cheese sandwich').trigger('click')

    await vi.waitFor(() => expect(optionNamed(wrapper, 'Cheese sandwich')).toBeUndefined())
    expect(await db.mealTemplates.count()).toBe(0)
  })

  it('arms only the row that was tapped, with more than one meal saved', async () => {
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
    await mealTemplates.put({
      id: 'wrap',
      name: 'Tortilla wrap',
      slots: [
        {
          id: 'shell',
          label: 'Shell',
          kind: 'fixed',
          options: ['oats'],
          defaultOptionId: 'oats',
          defaultGrams: 60,
        },
      ],
    })
    const wrapper = await render()
    await openMeals(wrapper)
    await labelled(wrapper, 'Remove Tortilla wrap').trigger('click')

    // Two rows can carry the exact same visible "Remove" text; only the
    // aria-label says which one is armed (#112).
    expect(wrapper.text()).toContain('Remove Tortilla wrap?')
    expect(labelled(wrapper, 'Remove Cheese sandwich')).toBeDefined()
    expect(labelled(wrapper, 'Edit Cheese sandwich')).toBeDefined()

    await labelled(wrapper, 'Cancel removing Tortilla wrap').trigger('click')
    await labelled(wrapper, 'Remove Cheese sandwich').trigger('click')

    expect(wrapper.text()).toContain('Remove Cheese sandwich?')
    expect(labelled(wrapper, 'Remove Tortilla wrap')).toBeDefined()
  })

  it('does not stay armed after leaving the meals list without cancelling', async () => {
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
    await openMeals(wrapper)
    await labelled(wrapper, 'Remove Cheese sandwich').trigger('click')
    expect(wrapper.text()).toContain('Remove Cheese sandwich?')

    // Left by the top-level back button, not by this row's own Cancel.
    await buttonNamed(wrapper, '← Everything else').trigger('click')
    await openMeals(wrapper)

    // Coming back should show the ordinary row — a tap here landed on
    // whatever this button now is, not a fresh Remove (#112).
    expect(wrapper.text()).not.toContain('Remove Cheese sandwich?')
    expect(labelled(wrapper, 'Remove Cheese sandwich')).toBeDefined()
  })

  it('clears an armed removal when a different meal is edited and saved', async () => {
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
    await mealTemplates.put({
      id: 'wrap',
      name: 'Tortilla wrap',
      slots: [
        {
          id: 'shell',
          label: 'Shell',
          kind: 'fixed',
          options: ['oats'],
          defaultOptionId: 'oats',
          defaultGrams: 60,
        },
      ],
    })
    const wrapper = await render()
    await openMeals(wrapper)
    await labelled(wrapper, 'Remove Cheese sandwich').trigger('click')

    // A totally unrelated round trip through the list — edit Tortilla wrap,
    // save it — used to leave Cheese sandwich armed for whoever came back.
    await labelled(wrapper, 'Edit Tortilla wrap').trigger('click')
    await flushPromises()
    await buttonNamed(wrapper, 'Save the changes').trigger('click')
    await vi.waitFor(() => expect(optionNamed(wrapper, 'Tortilla wrap')).toBeDefined())

    expect(wrapper.text()).not.toContain('Remove Cheese sandwich?')
  })

  it('names the days that still use a meal before it is removed', async () => {
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
    await dayTemplates.put({ id: 'workday', name: 'Workday', mealTemplateIds: ['porridge', 'lunch'] })
    const wrapper = await render()
    await openMeals(wrapper)
    await labelled(wrapper, 'Remove Cheese sandwich').trigger('click')

    // resolveDayTemplate already reports this gap at run time (§3); saying it
    // here means it is seen before the meal is gone, not after.
    expect(wrapper.text()).toContain('1 day(s) still name it — Workday')
  })

  it('offers no Edit or Remove on a meal that ships with the app', async () => {
    const wrapper = await render()
    await openMeals(wrapper)

    expect(labelled(wrapper, 'Edit Porridge')).toBeUndefined()
    expect(labelled(wrapper, 'Remove Porridge')).toBeUndefined()
  })

  it('requires a second tap before removing a saved day', async () => {
    await dayTemplates.put({ id: 'workday', name: 'Workday', mealTemplateIds: ['porridge'] })
    const wrapper = await render()
    await openDays(wrapper)
    await labelled(wrapper, 'Remove Workday').trigger('click')

    expect(await db.dayTemplates.count()).toBe(1)
    expect(wrapper.text()).toContain('Remove Workday?')

    await labelled(wrapper, 'Cancel removing Workday').trigger('click')
    expect(optionNamed(wrapper, 'Workday')).toBeDefined()
  })

  it('removes a saved day on the second tap, leaving its meals alone', async () => {
    await dayTemplates.put({ id: 'workday', name: 'Workday', mealTemplateIds: ['porridge'] })
    const wrapper = await render()
    await openDays(wrapper)
    await labelled(wrapper, 'Remove Workday').trigger('click')
    await labelled(wrapper, 'Remove Workday').trigger('click')

    await vi.waitFor(async () => expect(await db.dayTemplates.count()).toBe(0))
    // A day names meals by id; removing it must not touch what it named.
    expect(await db.mealTemplates.count()).toBe(0)
  })

  it('does not stay armed after leaving the days list without cancelling', async () => {
    await dayTemplates.put({ id: 'workday', name: 'Workday', mealTemplateIds: ['porridge'] })
    const wrapper = await render()
    await openDays(wrapper)
    await labelled(wrapper, 'Remove Workday').trigger('click')
    expect(wrapper.text()).toContain('Remove Workday?')

    await buttonNamed(wrapper, '← Everything else').trigger('click')
    await openDays(wrapper)

    expect(wrapper.text()).not.toContain('Remove Workday?')
    expect(labelled(wrapper, 'Remove Workday')).toBeDefined()
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

  it('runs a saved day meal by meal, against the chosen date', async () => {
    await dayTemplates.put({ id: 'workday', name: 'Workday', mealTemplateIds: ['porridge'] })
    const wrapper = await render()
    await wrapper.find('#log-date').setValue(yesterday())
    await openDays(wrapper)

    expect(optionNamed(wrapper, 'Workday').text()).toContain('1 meal(s)')
    await optionNamed(wrapper, 'Workday').trigger('click')
    await flushPromises()

    await buttonNamed(wrapper, 'Log meal').trigger('click')
    await vi.waitFor(async () => expect(await db.logEntries.count()).toBe(1))

    // A day is a shortcut through repetitive logging, not a second way of
    // writing entries: the meal went through the ordinary builder and the
    // date came from the log screen as it does everywhere else (#52, #61).
    const [entry] = await db.logEntries.toArray()
    expect(entry!.name).toBe('Porridge')
    expect(entry!.timestamp).toBe(localMiddayFromISODate(yesterday()))
  })

  it('confirms how much of the day was logged, not that the day was logged', async () => {
    await dayTemplates.put({ id: 'workday', name: 'Workday', mealTemplateIds: ['porridge'] })
    const wrapper = await render()
    await openDays(wrapper)
    await optionNamed(wrapper, 'Workday').trigger('click')
    await flushPromises()

    await buttonNamed(wrapper, 'Log meal').trigger('click')
    await vi.waitFor(() => expect(wrapper.text()).toContain('Logged 1 of 1'))

    await buttonNamed(wrapper, 'Done').trigger('click')

    // A day whose lunch was skipped did not log the day, and the confirmation
    // says which day it landed on, as every other path here does (#61).
    expect(wrapper.find('.confirmation').text()).toContain('Logged 1 meal(s) from Workday')
    expect(wrapper.find('.confirmation').text()).toContain(toISODate())
    // Back among the options, so the next thing eaten is one tap away.
    expect(optionNamed(wrapper, 'A usual day')).toBeDefined()
  })

  it('says nothing was logged when every meal of a day was skipped', async () => {
    await dayTemplates.put({ id: 'workday', name: 'Workday', mealTemplateIds: ['porridge'] })
    const wrapper = await render()
    await openDays(wrapper)
    await optionNamed(wrapper, 'Workday').trigger('click')
    await flushPromises()

    await buttonNamed(wrapper, 'Skip this meal').trigger('click')
    await buttonNamed(wrapper, 'Done').trigger('click')

    // "Logged 0 meal(s)" over an empty write claims intake that was never
    // recorded (§3).
    expect(wrapper.find('.confirmation').text()).toBe('Nothing logged from Workday.')
    expect(wrapper.find('.confirmation a').exists()).toBe(false)
    expect(await db.logEntries.count()).toBe(0)
  })

  it('goes from building a day straight into running it', async () => {
    const wrapper = await render()
    await openDays(wrapper)
    await optionNamed(wrapper, 'Build a day').trigger('click')
    await flushPromises()

    await wrapper.find('#day-name').setValue('Workday')
    await wrapper.find('#day-add-meal').setValue('porridge')
    await buttonNamed(wrapper, 'Add meal').trigger('click')
    await buttonNamed(wrapper, 'Save the day').trigger('click')
    await flushPromises()
    // Twice: the save awaits the write, and the handler then awaits a re-read
    // of the list before switching the view.
    await flushPromises()

    expect(await db.dayTemplates.count()).toBe(1)
    expect(wrapper.text()).toContain('Meal 1 of 1')
  })

  it('copies a day into a new one rather than editing it', async () => {
    await dayTemplates.put({ id: 'workday', name: 'Workday', mealTemplateIds: ['porridge'] })
    const wrapper = await render()
    await openDays(wrapper)

    await wrapper
      .findAll('button')
      .find((button) => button.attributes('aria-label') === 'Copy Workday')!
      .trigger('click')
    await flushPromises()

    // "Like my workday, but" is how the second one gets made (#52).
    expect((wrapper.find('#day-name').element as HTMLInputElement).value).toBe('Workday (copy)')

    await buttonNamed(wrapper, 'Save the day').trigger('click')
    await flushPromises()
    await flushPromises()

    const stored = await db.dayTemplates.toArray()
    expect(stored.map((day) => day.name).sort()).toEqual(['Workday', 'Workday (copy)'])
  })

  it('steps back from a running day to the other days', async () => {
    await dayTemplates.put({ id: 'workday', name: 'Workday', mealTemplateIds: ['porridge'] })
    const wrapper = await render()
    await openDays(wrapper)
    await optionNamed(wrapper, 'Workday').trigger('click')
    await flushPromises()

    await buttonNamed(wrapper, '← Other days').trigger('click')

    // One step out, as everywhere else on this screen (#98, #95).
    expect(optionNamed(wrapper, 'Workday')).toBeDefined()
    expect(optionNamed(wrapper, 'A food by hand')).toBeUndefined()
    expect(await db.logEntries.count()).toBe(0)
  })

  it('cancels building a meal back to the meals, not out of them', async () => {
    const wrapper = await render()
    await openMeals(wrapper)
    await optionNamed(wrapper, 'Build a meal').trigger('click')
    await flushPromises()

    // Cancel used to land on the options, two steps from where it started.
    await buttonNamed(wrapper, 'Cancel').trigger('click')

    expect(optionNamed(wrapper, 'Porridge')).toBeDefined()
    expect(optionNamed(wrapper, 'A food by hand')).toBeUndefined()
  })
})
