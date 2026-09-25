// Before anything that touches db.ts: logging writes through it, and jsdom has
// no IndexedDB.
import 'fake-indexeddb/auto'

import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { SEED_TEMPLATES } from '../../data/foods'
import { db } from '../../db'
import { useLogStore } from '../../stores/log'
import MealBuilder from '../MealBuilder.vue'

const porridge = SEED_TEMPLATES.find((t) => t.id === 'porridge')!

const render = async () => {
  const wrapper = mount(MealBuilder, { props: { template: porridge } })
  await flushPromises()

  return wrapper
}

/** The three gram fields, in slot order. Selects are not inputs. */
const amountFields = (wrapper: Awaited<ReturnType<typeof render>>) => wrapper.findAll('input')

beforeEach(async () => {
  await Promise.all([db.foods.clear(), db.logEntries.clear()])
  setActivePinia(createPinia())
})

describe('MealBuilder', () => {
  it('starts from the template default amounts', async () => {
    const wrapper = await render()

    expect(amountFields(wrapper).map((field) => (field.element as HTMLInputElement).value)).toEqual(
      ['50', '200', '80'],
    )
  })

  it('logs once however quickly the button is pressed twice', async () => {
    // Spied before the mount: the store is a singleton per pinia, so this is
    // the object the component resolves, and it goes with the pinia beforeEach
    // replaces.
    const store = useLogStore()
    vi.spyOn(store, 'logMeal')

    const wrapper = await render()

    // Both clicks land before the write resolves. A duplicate entry doubles
    // the day's intake, and §9 reads the day's totals as measured — nothing in
    // the log distinguishes it from having eaten two portions (#106).
    const button = wrapper.findAll('button').find((b) => b.text() === 'Log meal')!
    button.trigger('click')
    button.trigger('click')

    // Counting the calls the guard is meant to stop, which is synchronous.
    // Rows and emits both arrive an unknown number of ticks later, and a test
    // that guesses how many is how a suite-order flake starts.
    expect(store.logMeal).toHaveBeenCalledTimes(1)
    await vi.waitFor(async () => expect(await db.logEntries.count()).toBe(1))
  })

  it('emits busy around the write, so a host can hold a control disabled for it', async () => {
    const wrapper = await render()

    const button = wrapper.findAll('button').find((b) => b.text() === 'Log meal')!
    await button.trigger('click')

    // true fires before the await, synchronously with the click — a host
    // wiring @busy needs it available on this exact tick, not a later one.
    expect(wrapper.emitted('busy')?.[0]).toEqual([true])

    await vi.waitFor(async () => expect(await db.logEntries.count()).toBe(1))

    // false is the last thing emitted, after the write and the reset — this
    // is the guarantee DayRunner's own disabled guard depends on (#108).
    const busy = wrapper.emitted('busy')!
    expect(busy[busy.length - 1]).toEqual([false])
  })

  it('still emits busy: false when the write fails, so nothing stays disabled forever', async () => {
    const store = useLogStore()
    vi.spyOn(store, 'logMeal').mockRejectedValue(new Error('write failed'))

    // A custom errorHandler rather than a bare try/catch around the click:
    // Vue routes an event handler's own rejection through app.config.errorHandler,
    // not through whatever awaited the trigger — an unhandled one is expected
    // here, and only the finally block's own guarantee is under test.
    const wrapper = mount(MealBuilder, {
      props: { template: porridge },
      global: { config: { errorHandler: () => {} } },
    })
    await flushPromises()

    const button = wrapper.findAll('button').find((b) => b.text() === 'Log meal')!
    await button.trigger('click')
    await flushPromises()

    const busy = wrapper.emitted('busy') ?? []
    expect(busy[busy.length - 1]).toEqual([false])
  })

  it('logs an amount typed with a decimal comma', async () => {
    const wrapper = await render()
    await amountFields(wrapper)[0]!.setValue('12,5')
    await wrapper.find('button').trigger('click')

    // The bug this replaces: a number input reported '12,5' as the empty string,
    // so the slot was logged as no data (§14).
    await vi.waitFor(async () =>
      expect((await db.logEntries.toArray())[0]?.items[0]).toMatchObject({
        foodId: 'oats',
        grams: 12.5,
      }),
    )
  })

  it('blocks the log and names the slot when an amount is not a number', async () => {
    const wrapper = await render()
    await amountFields(wrapper)[1]!.setValue('200g')

    expect(wrapper.find('button').attributes('disabled')).toBeDefined()
    expect(wrapper.text()).toContain('Needs an amount: Liquid')
    // Marked on the field too, and by text rather than colour alone (§15).
    expect(amountFields(wrapper)[1]!.attributes('aria-invalid')).toBe('true')
  })

  it('blocks the log when a slot is cleared', async () => {
    const wrapper = await render()
    await amountFields(wrapper)[2]!.setValue('')

    // An amount eaten has no meaningful blank: a slot contributing nothing
    // belongs off the template, not logged as none.
    expect(wrapper.find('button').attributes('disabled')).toBeDefined()
    expect(wrapper.text()).toContain('Needs an amount: Fruit')
  })

  it('resets to the defaults after logging', async () => {
    const wrapper = await render()
    await amountFields(wrapper)[0]!.setValue('75')
    await wrapper.find('button').trigger('click')
    await flushPromises()

    // The write settles over several macrotasks, so the reset that follows it
    // has not necessarily rendered yet — wait for it rather than assuming.
    await vi.waitFor(() =>
      expect((amountFields(wrapper)[0]!.element as HTMLInputElement).value).toBe('50'),
    )
  })
})
