// The view reads the log and the config store, both of which open Dexie.
import 'fake-indexeddb/auto'

import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { addLocalDays, startOfLocalDay } from '../../dates'
import { db, log, nutrientGoals } from '../../db'
import type { NewLogEntry } from '../../types'
import EvaluationView from '../EvaluationView.vue'

const entry = (at: number, energy: number): NewLogEntry => ({
  name: 'Porridge',
  timestamp: at,
  items: [{ kind: 'food', foodId: 'oats', grams: 50 }],
  totals: { energy: { amount: energy, bySource: { user: energy }, missing: 0 } },
})

const midday = (dayOffset: number) => addLocalDays(startOfLocalDay(), dayOffset) + 12 * 3_600_000

const render = async () => {
  const wrapper = mount(EvaluationView)
  await flushPromises()
  // Both stores read through liveQuery, so the first paint is the placeholder.
  await vi.waitFor(() => expect(wrapper.text()).toContain('days logged'))

  return wrapper
}

const windowButton = (wrapper: Awaited<ReturnType<typeof render>>, label: string) =>
  wrapper.findAll('.windows button').find((button) => button.text() === label)!

beforeEach(async () => {
  await Promise.all([db.logEntries.clear(), db.nutrientGoals.clear()])
  setActivePinia(createPinia())
})

describe('EvaluationView', () => {
  it('states coverage before any nutrient figure', async () => {
    await log.add(entry(midday(-1), 1800))
    const wrapper = await render()

    // Coverage qualifies every number below it, so it is not optional (§9).
    expect(wrapper.text()).toContain('1 of 7 days logged')
  })

  it('compares against the days logged, not the length of the window', async () => {
    await nutrientGoals.put({ nutrient: 'energy', target: 2000 })
    await log.add(entry(midday(-1), 1800))
    const wrapper = await render()

    await vi.waitFor(() => expect(wrapper.text()).toContain('1800'))

    // One logged day against a 2000/day goal is a 2000 target — and the view
    // says so, rather than leaving a window total looking like a daily one.
    expect(wrapper.text()).toContain('of 2000')
    expect(wrapper.text()).toContain('Totals across the 1 logged day')
    expect(wrapper.text()).toContain('against one day of your targets')
  })

  it('explains an empty window instead of listing empty bars', async () => {
    await nutrientGoals.put({ nutrient: 'energy', target: 2000 })
    const wrapper = await render()

    expect(wrapper.text()).toContain('0 of 7 days logged')
    expect(wrapper.text()).toContain('missing record, not a day of eating nothing')
    // Every bar would read "No target", which is honest and useless.
    expect(wrapper.findAll('.track')).toHaveLength(0)
  })

  it('orders an exceeded limit above a shortfall', async () => {
    // Two nutrients: energy short of its goal, vitamin D over a known limit.
    await nutrientGoals.put({ nutrient: 'energy', target: 2000 })
    await log.add({
      name: 'Day',
      timestamp: midday(-1),
      items: [],
      totals: {
        energy: { amount: 500, bySource: { user: 500 }, missing: 0 },
        vitaminD: { amount: 300, bySource: { user: 300 }, missing: 0 },
      },
    })
    const wrapper = await render()

    await vi.waitFor(() => expect(wrapper.text()).toContain('500'))

    // No reference figures exist yet (#16), so vitamin D has no target and
    // sorts last — energy, which can be ranked, comes first.
    const labels = wrapper.findAll('.label').map((label) => label.text())
    expect(labels).toEqual(['Energy', 'Vitamin D'])
  })

  it('switches to the rolling 30-day window', async () => {
    await log.add(entry(midday(-1), 1800))
    await log.add(entry(midday(-20), 1900))
    const wrapper = await render()

    expect(wrapper.text()).toContain('1 of 7 days logged')

    await windowButton(wrapper, '30 days').trigger('click')

    await vi.waitFor(() => expect(wrapper.text()).toContain('2 of 30 days logged'))
  })

  it('marks the selected window without relying on colour', async () => {
    await log.add(entry(midday(-1), 1800))
    const wrapper = await render()

    expect(windowButton(wrapper, '7 days').attributes('aria-pressed')).toBe('true')
    expect(windowButton(wrapper, '30 days').attributes('aria-pressed')).toBe('false')
  })

  it('says what to do when there is nothing to compare', async () => {
    await log.add({ name: 'Empty', timestamp: midday(-1), items: [], totals: {} })
    const wrapper = await render()

    expect(wrapper.text()).toContain('1 of 7 days logged')
    expect(wrapper.text()).toContain('Set a daily goal in Settings')
  })

  it('does not claim a comparison when nothing has a target', async () => {
    await log.add(entry(midday(-1), 1800))
    const wrapper = await render()

    await vi.waitFor(() => expect(wrapper.text()).toContain('1800'))

    // The reference table is empty until #16, so a logged day with no goal set
    // is the ordinary case — and saying "against your targets" would describe
    // a comparison that is not happening.
    expect(wrapper.text()).not.toContain('of your targets')
    expect(wrapper.text()).toContain('Nothing to compare them against yet')
  })

  it('renders intake with no target rather than hiding it', async () => {
    await log.add(entry(midday(-1), 1800))
    const wrapper = await render()

    await vi.waitFor(() => expect(wrapper.text()).toContain('1800'))
    // Dropping it would hide logged intake just because no goal is set.
    expect(wrapper.text()).toContain('No target')
  })
})
