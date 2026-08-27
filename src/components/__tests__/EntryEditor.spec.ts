import 'fake-indexeddb/auto'

import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import { db, foods } from '../../db'
import type { StoredLogEntry } from '../../types'
import EntryEditor from '../EntryEditor.vue'

const entry = (grams = 100): StoredLogEntry => ({
  id: 1,
  name: 'Apple',
  timestamp: 1000,
  createdAt: 1000,
  updatedAt: 1000,
  items: [{ kind: 'food', foodId: 'apple', grams }],
  totals: { energy: { amount: 52, bySource: { user: 52 }, missing: 0 } },
})

const render = async (e = entry()) => {
  const wrapper = mount(EntryEditor, { props: { entry: e } })
  await flushPromises()

  return wrapper
}

beforeEach(async () => {
  await Promise.all([db.foods.clear(), db.logEntries.clear()])
  setActivePinia(createPinia())
  await foods.put({
    id: 'apple',
    name: 'Apple',
    per100g: { energy: { value: 52, source: 'user' } },
  })
})

describe('EntryEditor', () => {
  it('starts from the stored amounts', async () => {
    const wrapper = await render(entry(150))

    expect((wrapper.find('input').element as HTMLInputElement).value).toBe('150')
  })

  it('names the food rather than showing its id', async () => {
    const wrapper = await render()

    expect(wrapper.text()).toContain('Apple')
  })

  it('previews what saving would store', async () => {
    const wrapper = await render(entry(100))
    await wrapper.find('input').setValue('200')

    // 52 per 100 g at 200 g. Shown before saving so the change is visible.
    expect(wrapper.text()).toContain('104 kcal')
  })

  it('refuses a non-positive amount and says why', async () => {
    const wrapper = await render()
    await wrapper.find('input').setValue('0')

    expect(wrapper.find('button:last-of-type').attributes('disabled')).toBeDefined()
    expect(wrapper.text()).toContain('must be positive numbers')
  })

  it('refuses a cleared amount', async () => {
    const wrapper = await render()
    await wrapper.find('input').setValue('')

    // Unlike a nutrient field, an amount eaten has no meaningful blank: an item
    // with no quantity contributes nothing and should be removed instead.
    expect(wrapper.find('button:last-of-type').attributes('disabled')).toBeDefined()
  })

  it('emits done on cancel without writing', async () => {
    const wrapper = await render()
    await wrapper.find('input').setValue('999')
    await wrapper.find('button.ghost').trigger('click')

    expect(wrapper.emitted('done')).toHaveLength(1)
    expect(await db.logEntries.count()).toBe(0)
  })

  it('falls back to the food id when the food no longer resolves', async () => {
    await db.foods.clear()
    const wrapper = await render()

    // A manual food may have been deleted, or a seed dropped in a later
    // release. The row stays identifiable and editable either way.
    expect(wrapper.text()).toContain('apple')
    expect(wrapper.find('input').exists()).toBe(true)
  })
})
