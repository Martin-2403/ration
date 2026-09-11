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

  it('accepts a decimal comma, which is the German separator', async () => {
    const wrapper = await render(entry(100))
    await wrapper.find('input').setValue('12,5')
    await wrapper.find('button:last-of-type').trigger('click')
    await flushPromises()

    // The bug this replaces: a number input reported '12,5' as the empty string,
    // so the amount silently became no data (§14).
    expect((await db.logEntries.get(1))?.items[0]).toMatchObject({ grams: 12.5 })
  })

  it('refuses text that is not a number and names the row', async () => {
    const wrapper = await render()
    await wrapper.find('input').setValue('12g')

    expect(wrapper.find('button:last-of-type').attributes('disabled')).toBeDefined()
    expect(wrapper.text()).toContain('Not a number: Apple')
    // Marked on the field too, so the problem is findable without reading the
    // footer — and by text, not colour alone (§15).
    expect(wrapper.find('input').attributes('aria-invalid')).toBe('true')
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

  /**
   * #41. Revising an entry re-resolves each item against current food data, so
   * correcting an amount also pulls in any change to the food's values since it
   * was logged. §9 permits that — an edit is the user asking for a rewrite —
   * but they asked about grams, and nothing said the rest had moved.
   */
  describe('when the food has changed since it was logged', () => {
    it('says nothing while the stored figures still match', async () => {
      const wrapper = await render()

      expect(wrapper.find('.warning').exists()).toBe(false)
    })

    it('names the nutrients that would move, before anything is edited', async () => {
      // The entry snapshotted 52 kcal; the food now says 60.
      await foods.put({
        id: 'apple',
        name: 'Apple',
        per100g: { energy: { value: 60, source: 'user' } },
      })
      const wrapper = await render()

      // Present on open, not only after a keystroke: the user has to know
      // before they decide to save, not after.
      expect(wrapper.find('.warning').text()).toContain('values have changed')
      expect(wrapper.find('.warning').text()).toContain('Energy')
    })

    it('names every nutrient that moved, not just the first', async () => {
      await foods.put({
        id: 'apple',
        name: 'Apple',
        per100g: {
          energy: { value: 60, source: 'user' },
          protein: { value: 0.5, source: 'user' },
        },
      })
      const wrapper = await render()

      // Protein was absent from the snapshot entirely, which is still a change:
      // saving would add a figure the entry never carried.
      expect(wrapper.find('.warning').text()).toContain('Energy')
      expect(wrapper.find('.warning').text()).toContain('Protein')
    })

    it('does not warn about a change the amount itself causes', async () => {
      const wrapper = await render()
      await wrapper.find('input').setValue('200')

      // The comparison is against the entry's own stored amounts, so editing
      // grams — the ordinary case — must not trigger it.
      expect(wrapper.find('.warning').exists()).toBe(false)
    })

    it('still allows the save', async () => {
      await foods.put({
        id: 'apple',
        name: 'Apple',
        per100g: { energy: { value: 60, source: 'user' } },
      })
      const wrapper = await render()

      // Surfaced, not prevented: §9 allows the rewrite the user asked for.
      expect(
        wrapper.findAll('button').find((b) => b.text() === 'Save')!.attributes('disabled'),
      ).toBeUndefined()
    })

    it('warns differently when the food is gone entirely', async () => {
      await db.foods.clear()
      const wrapper = await render()

      // Worse than a changed value: a revision re-resolves every item, so
      // saving replaces what this contributed with nothing at all.
      expect(wrapper.find('.warning').text()).toContain('no longer exists')
      expect(wrapper.find('.warning').text()).toContain('no data')
    })
  })
})
