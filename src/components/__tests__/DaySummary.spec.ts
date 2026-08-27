/**
 * §17 wants the honesty rules asserted on rendered markup, not only as
 * functions: "no data" instead of a zero, a partial total not presented as
 * complete, and estimated values marked without relying on colour (§15).
 */
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import DaySummary from '../DaySummary.vue'
import type { NutrientTotals } from '../../data/nutrients'

const render = (totals: NutrientTotals, loading = false) =>
  mount(DaySummary, { props: { totals, loading } })

describe('DaySummary', () => {
  it('renders no data rather than a zero when nothing is known', () => {
    const wrapper = render({
      energy: { amount: 0, bySource: {}, missing: 3 },
    })

    expect(wrapper.text()).toContain('No data')
    expect(wrapper.text()).not.toMatch(/\b0\s*kcal/)
  })

  it('renders no data for a nutrient absent from the totals entirely', () => {
    const wrapper = render({ energy: { amount: 500, bySource: { user: 500 }, missing: 0 } })

    // vitaminD is tracked by the registry but has no entry here.
    expect(wrapper.text()).toContain('Vitamin D')
    expect(wrapper.text()).toContain('No data')
  })

  it('shows the energy figure when it is known', () => {
    const wrapper = render({
      energy: { amount: 387.4, bySource: { 'off-packaging': 387.4 }, missing: 0 },
    })

    // energy renders at 0 decimals (§5). Scoped to the hero: the other tracked
    // nutrients have no entry here, so their rows correctly say "No data".
    expect(wrapper.find('.hero').text()).toContain('387')
    expect(wrapper.find('.hero').text()).not.toContain('No data')
  })

  it('never presents a partial total as complete', () => {
    const wrapper = render({
      energy: { amount: 200, bySource: { 'off-packaging': 200 }, missing: 2 },
    })

    expect(wrapper.text()).toContain('At least this much')
    expect(wrapper.text()).toContain('2 item(s) had no energy data')
  })

  it('says how many contributors lacked data for a nutrient row', () => {
    const wrapper = render({
      vitaminD: { amount: 3, bySource: { user: 3 }, missing: 2 },
    })

    expect(wrapper.text()).toContain('2 without data')
  })

  it('reports the estimated share of a total', () => {
    const wrapper = render({
      vitaminD: { amount: 10, bySource: { 'off-estimated': 4, 'off-packaging': 6 }, missing: 0 },
    })

    expect(wrapper.text()).toContain('40% estimated')
  })

  it('marks an estimated value without relying on colour', () => {
    const wrapper = render({
      vitaminD: { amount: 10, bySource: { 'off-estimated': 10 }, missing: 0 },
    })

    // §15: provenance must survive greyscale, so the marker is a class carrying
    // a dotted underline, not a hue.
    expect(wrapper.find('.estimated').exists()).toBe(true)
  })

  it('does not mark a value with no estimated contribution', () => {
    const wrapper = render({
      vitaminD: { amount: 10, bySource: { 'off-packaging': 10 }, missing: 0 },
    })

    expect(wrapper.find('.estimated').exists()).toBe(false)
  })

  it('shows a placeholder rather than a claim while loading', () => {
    const wrapper = render({}, true)

    expect(wrapper.text()).not.toContain('No data')
    expect(wrapper.text()).not.toContain('kcal')
  })
})
