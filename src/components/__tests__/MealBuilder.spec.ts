// Before anything that touches db.ts: logging writes through it, and jsdom has
// no IndexedDB.
import 'fake-indexeddb/auto'

import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { SEED_TEMPLATES } from '../../data/foods'
import { db } from '../../db'
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
