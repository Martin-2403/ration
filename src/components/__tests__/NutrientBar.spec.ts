/**
 * §15's target-and-over-limit treatments and §9's honesty rules are partly a
 * rendering concern, so they get asserted directly rather than only through the
 * arithmetic that feeds them (§17). A bar that draws a shortfall as though it
 * were met is a correctness bug, not a cosmetic one.
 */
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import type { NutrientKey, NutrientTotal, Source } from '../../data/nutrients'
import NutrientBar from '../NutrientBar.vue'

const total = (amount: number, source: Source = 'user', missing = 0): NutrientTotal => ({
  amount,
  bySource: amount > 0 ? { [source]: amount } : {},
  missing,
})

const render = (props: {
  nutrient?: NutrientKey
  total: NutrientTotal
  target?: number
  limit?: number
  origin?: 'user' | 'reference'
}) => mount(NutrientBar, { props: { nutrient: 'energy', ...props } })

/** Width of the fill and position of the tick, as percentages of the track. */
const geometry = (wrapper: ReturnType<typeof render>) => ({
  fill: Number.parseFloat(
    (wrapper.find('.fill').attributes('style') ?? '').replace(/\D*([\d.]+).*/, '$1'),
  ),
  tick: Number.parseFloat(
    (wrapper.find('.tick').attributes('style') ?? '').replace(/\D*([\d.]+).*/, '$1'),
  ),
})

describe('NutrientBar', () => {
  it('shows the intake against the target', () => {
    const wrapper = render({ total: total(1500), target: 2000, origin: 'user' })

    expect(wrapper.text()).toContain('1500 kcal')
    expect(wrapper.text()).toContain('of 2000')
    expect(wrapper.text()).toContain('75% of your goal')
  })

  it('stops the bar short of the tick below target', () => {
    const wrapper = render({ total: total(1500), target: 2000 })
    const { fill, tick } = geometry(wrapper)

    // §15: below target the bar stops short of the tick, which sits at 100% of
    // target — here the right-hand edge, because nothing exceeds it.
    expect(fill).toBeLessThan(tick)
    expect(tick).toBe(100)
    expect(wrapper.find('.fill').classes()).toContain('under')
  })

  it('runs the bar past the tick when intake exceeds the target', () => {
    const wrapper = render({ total: total(2500), target: 2000 })
    const { fill, tick } = geometry(wrapper)

    // The tick stays at 100% of target wherever that falls on the scale, so
    // overshoot is visible rather than clipped at the end of the track.
    expect(fill).toBeGreaterThan(tick)
    expect(tick).toBe(80)
    expect(wrapper.find('.fill').classes()).not.toContain('under')
  })

  it('labels an exceeded limit in text, not by colour alone', () => {
    const wrapper = render({ total: total(4500), target: 2000, limit: 4000 })

    // §15 forbids a third status colour, so the direction has to be readable
    // without seeing the bar at all.
    expect(wrapper.text()).toContain('over the limit')
    expect(wrapper.find('.fill').classes()).toContain('over')
  })

  it('never claims over-limit when no limit is known', () => {
    // Absent means no limit known, never zero (§5) — an intake far above target
    // is still not over anything.
    const wrapper = render({ total: total(9000), target: 2000 })

    expect(wrapper.text()).not.toContain('over the limit')
    expect(wrapper.find('.fill').classes()).not.toContain('over')
  })

  it('attributes the target to the reference when that is where it came from', () => {
    const wrapper = render({ total: total(1000), target: 2000, origin: 'reference' })

    // Saying "of your goal" against an NRV misattributes the claim (§3).
    expect(wrapper.text()).toContain('50% of the reference')
    expect(wrapper.text()).not.toContain('your goal')
  })

  it('draws no bar and claims no comparison without a target', () => {
    const wrapper = render({ total: total(1500) })

    expect(wrapper.find('.track').exists()).toBe(false)
    expect(wrapper.text()).toContain('No target')
    expect(wrapper.text()).toContain('1500 kcal')
  })

  it('reads an unknown nutrient as no data, never as zero', () => {
    const wrapper = render({ total: total(0, 'unknown', 3), target: 2000 })

    // §3: nothing is known, and a 0% bar would state that nothing was eaten.
    expect(wrapper.text()).toContain('No data')
    expect(wrapper.text()).not.toContain('0%')
    expect(wrapper.find('.track').exists()).toBe(false)
  })

  it('marks a partial total as a floor rather than a measurement', () => {
    const wrapper = render({ total: total(800, 'user', 2), target: 2000 })

    expect(wrapper.text()).toContain('at least this much')
    expect(wrapper.text()).toContain('2 without data')
  })

  it('reports the estimated share and marks it without colour', () => {
    const wrapper = render({
      total: { amount: 100, bySource: { 'off-estimated': 40, user: 60 }, missing: 0 },
      target: 200,
    })

    expect(wrapper.text()).toContain('40% estimated')
    // The dotted marker survives greyscale, same treatment as the day summary.
    expect(wrapper.find('.estimated').exists()).toBe(true)
  })

  it('treats a zero target as no target at all', () => {
    // §9 scales by daysLogged, which is zero for a window with no records. A
    // zero target compared against would report a full bar and a blank
    // percentage for a period nothing is known about.
    const wrapper = render({ total: total(500), target: 0, origin: 'user' })

    expect(wrapper.text()).toContain('No target')
    expect(wrapper.text()).not.toContain('of your goal')
    expect(wrapper.find('.track').exists()).toBe(false)
  })

  it('never claims over-limit against a zero limit', () => {
    // Same reason: a limit scaled to zero is not a limit that was exceeded.
    const wrapper = render({ total: total(500), target: 2000, limit: 0, origin: 'user' })

    expect(wrapper.text()).not.toContain('over the limit')
    expect(wrapper.find('.fill').classes()).not.toContain('over')
  })

  it('attributes the target to nobody when the caller did not say', () => {
    // Defaulting to "your goal" would state provenance the component was never
    // given, which is the misattribution §3 forbids.
    const wrapper = render({ total: total(1500), target: 2000 })

    expect(wrapper.text()).toContain('75%')
    expect(wrapper.text()).not.toContain('your goal')
    expect(wrapper.text()).not.toContain('the reference')
  })

  it('renders no notes line for a no-data nutrient', () => {
    const wrapper = render({ total: total(0, 'unknown', 3), target: 2000 })

    // Otherwise an empty paragraph still takes a row in the grid, leaving an
    // unexplained gap under the one row that has nothing to say.
    expect(wrapper.find('.notes').exists()).toBe(false)
  })

  it('hides the bar from assistive tech, since the text carries the same facts', () => {
    const wrapper = render({ total: total(1500), target: 2000 })

    expect(wrapper.find('.track').attributes('aria-hidden')).toBe('true')
  })
})
