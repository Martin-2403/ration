// The picker searches stored foods through Dexie, and jsdom has no IndexedDB.
import 'fake-indexeddb/auto'

import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it } from 'vitest'

import { db, foods } from '../../db'
import type { Food } from '../../types'
import FoodPicker from '../FoodPicker.vue'

const stored = (id: string, name: string, per100g: Food['per100g']): Food => ({
  id,
  name,
  per100g,
})

const render = async () => {
  const wrapper = mount(FoodPicker)
  await flushPromises()

  return wrapper
}

const resultFor = (wrapper: Awaited<ReturnType<typeof render>>, name: string) =>
  wrapper.findAll('.results button').find((button) => button.text().includes(name))!

const type = async (wrapper: Awaited<ReturnType<typeof render>>, query: string) => {
  await wrapper.find('#picker-query').setValue(query)
  await flushPromises()
}

beforeEach(async () => {
  await db.foods.clear()
})

describe('FoodPicker', () => {
  it('lists foods before anything is typed', async () => {
    const wrapper = await render()

    // Opening on an empty list would read as "you have no foods" rather than
    // "no query yet".
    expect(wrapper.findAll('.results button').length).toBeGreaterThan(0)
    expect(wrapper.text()).toContain('Rolled oats')
  })

  it('narrows the list as the query is typed', async () => {
    await foods.put(stored('apple', 'Apple', { energy: { value: 52, source: 'user' } }))
    const wrapper = await render()

    await type(wrapper, 'appl')

    expect(wrapper.findAll('.results button').map((b) => b.find('.name').text())).toEqual(['Apple'])
  })

  it('reaches a stored food, which is the gap #40 closes', async () => {
    await foods.put(stored('apple', 'Apple', { energy: { value: 52, source: 'user' } }))
    const wrapper = await render()
    await type(wrapper, 'apple')

    await resultFor(wrapper, 'Apple').trigger('click')
    await wrapper.find('#picker-grams').setValue('150')
    await wrapper.find('button.primary').trigger('click')

    const [food, grams] = wrapper.emitted('submit')![0] as [Food, number]
    expect(food.id).toBe('apple')
    expect(grams).toBe(150)
  })

  it('accepts an amount typed with a decimal comma', async () => {
    const wrapper = await render()
    await resultFor(wrapper, 'Banana').trigger('click')
    await wrapper.find('#picker-grams').setValue('12,5')
    await wrapper.find('button.primary').trigger('click')

    // §14: the German separator has to survive, which is why the field is text.
    expect((wrapper.emitted('submit')![0] as [Food, number])[1]).toBe(12.5)
  })

  it('blocks logging without a usable amount and says so', async () => {
    const wrapper = await render()
    await resultFor(wrapper, 'Banana').trigger('click')
    await wrapper.find('#picker-grams').setValue('some')

    expect(wrapper.find('button.primary').attributes('disabled')).toBeDefined()
    expect(wrapper.text()).toContain('Needs an amount')
    // Marked on the field too, by more than colour (§15).
    expect(wrapper.find('#picker-grams').attributes('aria-invalid')).toBe('true')
  })

  it('refuses an amount of zero', async () => {
    const wrapper = await render()
    await resultFor(wrapper, 'Banana').trigger('click')
    await wrapper.find('#picker-grams').setValue('0')

    // Eating none of something is not a log entry.
    expect(wrapper.find('button.primary').attributes('disabled')).toBeDefined()
  })

  it('says which path a food came from', async () => {
    await foods.put(stored('apple', 'Apple', { energy: { value: 52, source: 'user' } }))
    const wrapper = await render()

    await type(wrapper, 'apple')
    expect(resultFor(wrapper, 'Apple').text()).toContain('Saved')

    await type(wrapper, 'banana')
    expect(resultFor(wrapper, 'Banana').text()).toContain('Built in')
  })

  it('shows no energy figure for a food that has none', async () => {
    await foods.put(
      stored('mystery', 'Mystery paste', { energy: { value: 0, source: 'unknown' } }),
    )
    const wrapper = await render()
    await type(wrapper, 'mystery')

    // §3: an unknown value is not zero, and "0 kcal / 100 g" would be a claim
    // about a food nobody has data for.
    expect(resultFor(wrapper, 'Mystery paste').text()).not.toContain('kcal')
  })

  it('previews what the chosen amount works out to', async () => {
    const wrapper = await render()
    await resultFor(wrapper, 'Banana').trigger('click')
    await wrapper.find('#picker-grams').setValue('200')

    // Banana is 90 kcal per 100 g, so 200 g is 180.
    expect(wrapper.text()).toContain('180 kcal')
  })

  it('offers a way back to the list after choosing', async () => {
    const wrapper = await render()
    await resultFor(wrapper, 'Banana').trigger('click')
    expect(wrapper.find('#picker-query').exists()).toBe(false)

    await wrapper.find('button.back').trigger('click')
    expect(wrapper.find('#picker-query').exists()).toBe(true)
  })

  it('says what to do when nothing matches', async () => {
    const wrapper = await render()
    await type(wrapper, 'zzzz')

    expect(wrapper.findAll('.results button')).toHaveLength(0)
    expect(wrapper.text()).toContain('Nothing matches')
  })
})
