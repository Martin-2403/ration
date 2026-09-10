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

/**
 * An entry carrying only salt: one of the three nutrients Annex XIII prints a
 * figure for without a direction, so #16 gave them no target (#17 supplies a
 * limit instead). This is what a nutrient with intake and no target looks like
 * now that every other tracked nutrient has a reference figure.
 */
const saltOnly = (at: number, salt: number): NewLogEntry => ({
  name: 'Crackers',
  timestamp: at,
  items: [{ kind: 'food', foodId: 'oats', grams: 50 }],
  totals: { salt: { amount: salt, bySource: { user: salt }, missing: 0 } },
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

  it('orders the largest relative shortfall first, and the unrankable last', async () => {
    // Renamed: this claimed to order an exceeded limit, which it never did —
    // no upper limits exist until #17, so nothing could be over one. What it
    // can now assert is the ordering §9 actually specifies, against real
    // reference figures: energy 500 of 2000 is 75% unmet, protein 45 of 50 is
    // 10% unmet, and salt has intake but no target at all.
    await log.add({
      name: 'Day',
      timestamp: midday(-1),
      items: [],
      totals: {
        energy: { amount: 500, bySource: { user: 500 }, missing: 0 },
        protein: { amount: 45, bySource: { user: 45 }, missing: 0 },
        salt: { amount: 3, bySource: { user: 3 }, missing: 0 },
      },
    })
    const wrapper = await render()

    await vi.waitFor(() => expect(wrapper.text()).toContain('500'))

    const labels = wrapper.findAll('.label').map((label) => label.text())

    // Relative, not absolute: ranking by the raw gap would sort by unit size
    // and bury every micronutrient under the macros.
    expect(labels.indexOf('Energy')).toBeLessThan(labels.indexOf('Protein'))

    // Below everything that can be ranked at all, rather than tied with the
    // nutrients already met.
    expect(labels[labels.length - 1]).toBe('Salt')
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

  it('renders intake with no target rather than hiding it', async () => {
    await log.add(saltOnly(midday(-1), 3))
    const wrapper = await render()

    await vi.waitFor(() => expect(wrapper.text()).toContain('Salt'))
    // Dropping it would hide logged intake for the three nutrients #16 left
    // without a direction, which is the opposite of what §3 asks for.
    expect(wrapper.text()).toContain('No target')
  })
})
