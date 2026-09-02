// The view reads the log store, which opens Dexie.
import 'fake-indexeddb/auto'

import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { db } from '../../db'
import router from '../../router'
import DayView from '../DayView.vue'

const render = async () => {
  router.push('/')
  await router.isReady()
  const wrapper = mount(DayView, { global: { plugins: [router] }, attachTo: document.body })
  await flushPromises()

  return wrapper
}

const logLink = (wrapper: Awaited<ReturnType<typeof render>>) => wrapper.find('.log')

beforeEach(async () => {
  await Promise.all([db.logEntries.clear(), db.foods.clear()])
  setActivePinia(createPinia())
})

afterEach(() => {
  document.body.innerHTML = ''
})

describe('DayView', () => {
  it('shows the day rather than a page of forms', async () => {
    const wrapper = await render()

    // The screen is named after the day, so it opens showing the day (#53) —
    // not editable forms prefilled with fixture values.
    expect(wrapper.find('#food-name').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('Rolled oats')
  })

  it('sends logging to its own route', async () => {
    const wrapper = await render()

    // A link, not a sheet: logging carries its own date rather than inheriting
    // whichever day this screen happens to show (#61, #62).
    expect(logLink(wrapper).text()).toBe('Log something')
    expect(logLink(wrapper).attributes('href')).toBe('/log')
  })

  it('leaves nothing modal behind', async () => {
    const wrapper = await render()

    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
    expect(wrapper.find('.page').attributes('inert')).toBeUndefined()
  })

  it('keeps showing the day summary and the log', async () => {
    const wrapper = await render()

    // Lower case: the eyebrow is uppercased by CSS, not in the markup.
    expect(wrapper.text()).toContain('Intake')
    expect(wrapper.text()).toContain('Nothing logged yet')
  })
})
