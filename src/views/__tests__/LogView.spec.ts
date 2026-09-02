// Logging writes through the store, which opens Dexie.
import 'fake-indexeddb/auto'

import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { addLocalDays, localMiddayFromISODate, startOfLocalDay, toISODate } from '../../dates'
import { db } from '../../db'
import router from '../../router'
import LogView from '../LogView.vue'

const render = async () => {
  router.push('/log')
  await router.isReady()
  const wrapper = mount(LogView, { global: { plugins: [router] } })
  await flushPromises()

  return wrapper
}

const optionNamed = (wrapper: Awaited<ReturnType<typeof render>>, label: string) =>
  wrapper.findAll('.options button').find((button) => button.text().includes(label))!

const buttonNamed = (wrapper: Awaited<ReturnType<typeof render>>, label: string) =>
  wrapper.findAll('button').find((button) => button.text() === label)!

const yesterday = () => toISODate(addLocalDays(startOfLocalDay(), -1))

beforeEach(async () => {
  await Promise.all([db.logEntries.clear(), db.foods.clear()])
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

  it('offers a choice per meal template plus hand entry', async () => {
    const wrapper = await render()

    expect(optionNamed(wrapper, 'Porridge')).toBeDefined()
    expect(optionNamed(wrapper, 'A food by hand')).toBeDefined()
  })

  it('logs a meal against today at the time of the write', async () => {
    const wrapper = await render()
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
    await optionNamed(wrapper, 'Porridge').trigger('click')
    await flushPromises()
    await buttonNamed(wrapper, 'Log meal').trigger('click')

    await vi.waitFor(() => expect(wrapper.find('.options').exists()).toBe(true))
    // Backfilling a day means logging several meals against it in a row.
    expect((wrapper.find('#log-date').element as HTMLInputElement).value).toBe(yesterday())
  })

  it('returns to the list without logging', async () => {
    const wrapper = await render()
    await optionNamed(wrapper, 'Porridge').trigger('click')

    await buttonNamed(wrapper, '← Everything else').trigger('click')

    expect(wrapper.find('.options').exists()).toBe(true)
    expect(await db.logEntries.count()).toBe(0)
  })
})
