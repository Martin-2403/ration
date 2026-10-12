// FoodPicker searches through Dexie, and jsdom has no IndexedDB.
import 'fake-indexeddb/auto'

import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'

import SingleFoodStep from '../SingleFoodStep.vue'

const choose = async () => {
  const wrapper = mount(SingleFoodStep)
  await vi.waitFor(() => expect(wrapper.find('.results button').exists()).toBe(true))
  await wrapper.find('.results button').trigger('click')
  await flushPromises()

  return wrapper
}

const add = (wrapper: Awaited<ReturnType<typeof choose>>) =>
  wrapper.findAll('button').find((button) => button.text() === 'Add to the day')!

describe('SingleFoodStep', () => {
  it('reports the chosen food with a decimal-comma amount', async () => {
    const wrapper = await choose()
    await wrapper.find('#single-grams').setValue('12,5')
    await add(wrapper).trigger('click')

    const [food, grams] = wrapper.emitted('add')![0]!
    expect(food).toHaveProperty('id')
    expect(grams).toBe(12.5)
  })

  it.each(['0', 'abc', ''])('refuses %j as an amount', async (typed) => {
    const wrapper = await choose()
    await wrapper.find('#single-grams').setValue(typed)

    expect(add(wrapper).attributes('disabled')).toBeDefined()
    await add(wrapper).trigger('click')
    expect(wrapper.emitted('add')).toBeUndefined()
  })

  it('goes back without choosing', async () => {
    const wrapper = mount(SingleFoodStep)
    await wrapper.find('.back').trigger('click')

    expect(wrapper.emitted('back')).toHaveLength(1)
  })
})
