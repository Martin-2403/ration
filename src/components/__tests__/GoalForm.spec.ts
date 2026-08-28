// Before db.ts constructs its Dexie instance.
import 'fake-indexeddb/auto'

import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { db, nutrientGoals } from '../../db'
import GoalForm from '../GoalForm.vue'

const render = async () => {
  const wrapper = mount(GoalForm)
  await flushPromises()
  // The store reads through liveQuery, which pushes asynchronously, and the form
  // shows a placeholder until it has. Every test below starts from a loaded form.
  await vi.waitFor(() => expect(wrapper.findAll('.row')).toHaveLength(4))

  return wrapper
}

const fieldFor = (wrapper: Awaited<ReturnType<typeof render>>, id: string) =>
  wrapper.find(`#goal-${id}`)

/** The row containing a nutrient's field, so text assertions stay local to it. */
const rowFor = (wrapper: Awaited<ReturnType<typeof render>>, id: string) =>
  wrapper.findAll('.row').find((row) => row.find(`#goal-${id}`).exists())!

beforeEach(async () => {
  await db.nutrientGoals.clear()
  setActivePinia(createPinia())
})

describe('GoalForm', () => {
  it('offers a field for energy and the macros only', async () => {
    const wrapper = await render()

    expect(wrapper.findAll('input')).toHaveLength(4)
    for (const key of ['energy', 'protein', 'carbohydrate', 'fat']) {
      expect(fieldFor(wrapper, key).exists()).toBe(true)
    }
    // A micronutrient target is a dosing decision, so it is not offered (§20).
    expect(fieldFor(wrapper, 'vitaminD').exists()).toBe(false)
  })

  it('reports no target for a nutrient without a goal', async () => {
    const wrapper = await render()

    // The reference table is empty until #16, so there is nothing to fall back
    // to — and that reads as no target, never as zero (§3).
    expect(rowFor(wrapper, 'energy').text()).toContain('No target yet')
  })

  it('seeds a field from the stored goal', async () => {
    await nutrientGoals.put({ nutrient: 'protein', target: 140 })
    const wrapper = await render()

    await vi.waitFor(() =>
      expect((fieldFor(wrapper, 'protein').element as HTMLInputElement).value).toBe('140'),
    )
    // 140.0, not 140: protein renders at the registry's display precision.
    expect(rowFor(wrapper, 'protein').text()).toContain('Your goal: 140.0 g')
  })

  it('saves a typed goal and attributes it to the user', async () => {
    const wrapper = await render()
    await fieldFor(wrapper, 'energy').setValue('2200')
    await rowFor(wrapper, 'energy').find('button').trigger('click')

    await vi.waitFor(async () => expect((await nutrientGoals.get('energy'))?.target).toBe(2200))
    await vi.waitFor(() => expect(rowFor(wrapper, 'energy').text()).toContain('Your goal: 2200'))
  })

  it('accepts a decimal comma', async () => {
    const wrapper = await render()
    await fieldFor(wrapper, 'fat').setValue('72,5')
    await rowFor(wrapper, 'fat').find('button').trigger('click')

    // German uses the comma as the separator (§14).
    await vi.waitFor(async () => expect((await nutrientGoals.get('fat'))?.target).toBe(72.5))
  })

  it('refuses text that is not a number and says so', async () => {
    const wrapper = await render()
    await fieldFor(wrapper, 'energy').setValue('2200 kcal')

    const row = rowFor(wrapper, 'energy')
    expect(row.find('button').attributes('disabled')).toBeDefined()
    expect(row.text()).toContain('Not a number')
    expect(fieldFor(wrapper, 'energy').attributes('aria-invalid')).toBe('true')
  })

  it('refuses a goal of zero or below', async () => {
    const wrapper = await render()
    await fieldFor(wrapper, 'protein').setValue('0')

    const row = rowFor(wrapper, 'protein')
    expect(row.find('button').attributes('disabled')).toBeDefined()
    expect(row.text()).toContain('Must be more than zero')
  })

  it('has nothing to save while a field is blank', async () => {
    const wrapper = await render()

    // Blank is not an error here — there is simply no goal to write yet, so the
    // button is disabled without a complaint attached to it.
    const row = rowFor(wrapper, 'carbohydrate')
    expect(row.find('button').attributes('disabled')).toBeDefined()
    expect(row.text()).not.toContain('Not a number')
  })

  it('clears a goal and empties its field', async () => {
    await nutrientGoals.put({ nutrient: 'fat', target: 70 })
    const wrapper = await render()
    await vi.waitFor(() =>
      expect((fieldFor(wrapper, 'fat').element as HTMLInputElement).value).toBe('70'),
    )

    await rowFor(wrapper, 'fat').find('button.ghost').trigger('click')

    await vi.waitFor(() => expect(rowFor(wrapper, 'fat').text()).toContain('No target yet'))
    expect((fieldFor(wrapper, 'fat').element as HTMLInputElement).value).toBe('')
  })

  it('offers no clear button when there is no goal to clear', async () => {
    const wrapper = await render()

    expect(rowFor(wrapper, 'energy').find('button.ghost').exists()).toBe(false)
  })

  it('leaves a half-typed field alone when a write lands elsewhere', async () => {
    const wrapper = await render()
    await fieldFor(wrapper, 'energy').setValue('21')

    // liveQuery pushes on every write, including this component's own. Reseeding
    // the energy field here would erase what the user is in the middle of typing.
    await nutrientGoals.put({ nutrient: 'protein', target: 140 })

    await vi.waitFor(() =>
      expect((fieldFor(wrapper, 'protein').element as HTMLInputElement).value).toBe('140'),
    )
    expect((fieldFor(wrapper, 'energy').element as HTMLInputElement).value).toBe('21')
  })
})
