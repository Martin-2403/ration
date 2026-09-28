// Clicking Edit mounts EntryEditor, which reads through the store and Dexie.
import 'fake-indexeddb/auto'

import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import { db } from '../../db'
import type { LogEntry, StoredLogEntry } from '../../types'
import DayLog from '../DayLog.vue'

const entry = (overrides: Partial<StoredLogEntry> = {}): StoredLogEntry => ({
  id: 1,
  name: 'Porridge',
  timestamp: 1000,
  createdAt: 1000,
  updatedAt: 1000,
  items: [{ kind: 'food', foodId: 'oats', grams: 50 }],
  totals: { energy: { amount: 185, bySource: { user: 185 }, missing: 0 } },
  ...overrides,
})

const render = (entries: LogEntry[]) => mount(DayLog, { props: { entries } })

const buttonNamed = (wrapper: ReturnType<typeof render>, label: string) =>
  wrapper.findAll('button').find((button) => button.text() === label)!

beforeEach(async () => {
  await db.logEntries.clear()
  setActivePinia(createPinia())
})

describe('DayLog', () => {
  it('says an empty day is not the same as a zero-intake one', () => {
    const wrapper = render([])

    expect(wrapper.text()).toContain('An empty day is not a zero-intake day')
  })

  it('shows the time, name and energy of a logged entry', () => {
    const wrapper = render([entry()])

    expect(wrapper.text()).toContain('Porridge')
    expect(wrapper.text()).toContain('185 kcal')
  })

  it('says No data rather than 0 for an entry with nothing to sum', () => {
    // §3: an unknown value is never rendered as zero.
    const wrapper = render([entry({ totals: {} })])

    expect(wrapper.text()).toContain('No data')
  })

  /**
   * Regression guard for #109: the row used to place Edit and Remove as two
   * of five direct siblings in `.summary`'s grid, which is exactly the shape
   * that widened the page on a phone. They now share one `.entry-actions`
   * wrapper — asserted here so a later edit can't silently unwrap them back
   * into separate grid tracks without a test noticing.
   */
  it('keeps Edit and Remove inside one shared actions element', () => {
    const wrapper = render([entry()])

    const actions = wrapper.find('.entry-actions')
    expect(actions.exists()).toBe(true)

    const buttons = actions.findAll('button')
    expect(buttons.map((button) => button.text())).toEqual(['Edit', 'Remove'])
  })

  it('removes the entry that was tapped, not another one', async () => {
    const wrapper = render([entry({ id: 1, name: 'Porridge' }), entry({ id: 2, name: 'Banana' })])

    await wrapper
      .findAll('button')
      .find((button) => button.attributes('aria-label') === 'Remove Banana')!
      .trigger('click')

    expect(wrapper.emitted('remove')).toEqual([[2]])
  })

  it('opens the editor on Edit and closes it again on a second tap', async () => {
    const wrapper = render([entry()])

    expect(wrapper.findComponent({ name: 'EntryEditor' }).exists()).toBe(false)

    await buttonNamed(wrapper, 'Edit').trigger('click')
    await flushPromises()
    expect(wrapper.findComponent({ name: 'EntryEditor' }).exists()).toBe(true)
    expect(buttonNamed(wrapper, 'Close')).toBeDefined()

    await buttonNamed(wrapper, 'Close').trigger('click')
    expect(wrapper.findComponent({ name: 'EntryEditor' }).exists()).toBe(false)
  })
})
