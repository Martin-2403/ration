// The view reads the log store, which opens Dexie.
import 'fake-indexeddb/auto'

import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { db } from '../../db'
import TodayView from '../TodayView.vue'

const render = async () => {
  const wrapper = mount(TodayView, { attachTo: document.body })
  await flushPromises()

  return wrapper
}

const logButton = (wrapper: Awaited<ReturnType<typeof render>>) => wrapper.find('button.log')

beforeEach(async () => {
  await Promise.all([db.logEntries.clear(), db.foods.clear()])
  setActivePinia(createPinia())
})

afterEach(() => {
  document.body.innerHTML = ''
})

describe('TodayView', () => {
  it('shows the day rather than a page of forms', async () => {
    const wrapper = await render()

    // The screen is named after the day, so it opens showing the day (#53) —
    // not three editable forms prefilled with fixture values.
    expect(wrapper.text()).toContain('Today')
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
    expect(wrapper.find('#food-name').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('Rolled oats')
  })

  it('offers one deliberate way in', async () => {
    const wrapper = await render()

    expect(logButton(wrapper).text()).toBe('Log something')
  })

  it('opens the sheet on request', async () => {
    const wrapper = await render()

    await logButton(wrapper).trigger('click')

    expect(wrapper.find('[role="dialog"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('A food by hand')
  })

  it('makes the page behind the sheet inert', async () => {
    const wrapper = await render()
    expect(wrapper.find('.page').attributes('inert')).toBeUndefined()

    await logButton(wrapper).trigger('click')

    // Otherwise the day navigation and the delete buttons behind the sheet stay
    // clickable, and Tab walks into them.
    expect(wrapper.find('.page').attributes('inert')).toBeDefined()
  })

  it('closes the sheet and gives the page back', async () => {
    const wrapper = await render()
    await logButton(wrapper).trigger('click')

    await wrapper.find('button[aria-label="Close"]').trigger('click')

    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
    expect(wrapper.find('.page').attributes('inert')).toBeUndefined()
  })

  it('keeps showing the day summary and the log', async () => {
    const wrapper = await render()

    // Lower case: the eyebrow is uppercased by CSS, not in the markup.
    expect(wrapper.text()).toContain('Today')
    expect(wrapper.text()).toContain('Nothing logged yet')
  })
})
