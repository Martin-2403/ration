// Saves through the repository, and jsdom has no IndexedDB.
import 'fake-indexeddb/auto'

import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it } from 'vitest'

import { db } from '../../db'
import type { MealTemplate } from '../../types'
import MealTemplateForm from '../MealTemplateForm.vue'

const render = async () => {
  const wrapper = mount(MealTemplateForm)
  await flushPromises()

  return wrapper
}

type Wrapper = Awaited<ReturnType<typeof render>>

const buttonNamed = (wrapper: Wrapper, label: string) =>
  wrapper.findAll('button').find((button) => button.text() === label)!

/** Opens the picker for a slot and chooses a food by name. */
const addFood = async (wrapper: Wrapper, slot: number, foodName: string) => {
  await wrapper.findAll('button').filter((b) => b.text() === 'Add a food')[slot]!.trigger('click')
  await flushPromises()

  const result = wrapper
    .findAll('.results button')
    .find((button) => button.text().includes(foodName))!
  await result.trigger('click')
  await flushPromises()
}

beforeEach(async () => {
  await Promise.all([db.mealTemplates.clear(), db.foods.clear()])
})

describe('MealTemplateForm', () => {
  it('refuses to save without a name', async () => {
    const wrapper = await render()

    expect(wrapper.text()).toContain('The meal needs a name')
    expect(buttonNamed(wrapper, 'Save the meal').attributes('disabled')).toBeDefined()
  })

  it('names the slot that is missing a food', async () => {
    const wrapper = await render()
    await wrapper.find('#template-name').setValue('Breakfast')
    await wrapper.find('#slot-0-label').setValue('Base')

    expect(wrapper.text()).toContain('Base needs at least one food')
  })

  it('falls back to a slot number before the slot is named', async () => {
    const wrapper = await render()
    await wrapper.find('#template-name').setValue('Breakfast')

    // "needs a name" beats the other problems: without a label there is nothing
    // to call the slot in any later message.
    expect(wrapper.text()).toContain('Slot 1 needs a name')
  })

  it('refuses a slot with an unusable amount', async () => {
    const wrapper = await render()
    await wrapper.find('#template-name').setValue('Breakfast')
    await wrapper.find('#slot-0-label').setValue('Base')
    await addFood(wrapper, 0, 'Rolled oats')
    await wrapper.find('#slot-0-grams').setValue('none')

    expect(wrapper.text()).toContain('Base needs an amount')
    expect(wrapper.find('#slot-0-grams').attributes('aria-invalid')).toBe('true')
  })

  it('shows a chosen food by name and makes the first one the default', async () => {
    const wrapper = await render()
    await addFood(wrapper, 0, 'Rolled oats')

    expect(wrapper.find('.options').text()).toContain('Rolled oats')
    expect((wrapper.find('.options input[type="radio"]').element as HTMLInputElement).checked).toBe(
      true,
    )
  })

  it('ignores the same food chosen twice', async () => {
    const wrapper = await render()
    await addFood(wrapper, 0, 'Banana')
    await addFood(wrapper, 0, 'Banana')

    // A dropdown with two identical entries is not a choice.
    expect(wrapper.findAll('.options li')).toHaveLength(1)
  })

  it('promotes another option when the default is removed', async () => {
    const wrapper = await render()
    await addFood(wrapper, 0, 'Milk, 3.5%')
    await addFood(wrapper, 0, 'Oat drink, fortified')

    await wrapper.findAll('.options button')[0]!.trigger('click')
    await flushPromises()

    // A default that is no longer an option resolves to nothing at log time.
    const checked = wrapper
      .findAll('.options input[type="radio"]')
      .filter((input) => (input.element as HTMLInputElement).checked)
    expect(checked).toHaveLength(1)
  })

  it('saves a template with a derived slot kind', async () => {
    const wrapper = await render()
    await wrapper.find('#template-name').setValue('Breakfast')
    await wrapper.find('#slot-0-label').setValue('Base')
    await addFood(wrapper, 0, 'Rolled oats')
    await wrapper.find('#slot-0-grams').setValue('50')

    await buttonNamed(wrapper, 'Add a slot').trigger('click')
    await wrapper.find('#slot-1-label').setValue('Liquid')
    await addFood(wrapper, 1, 'Milk, 3.5%')
    await addFood(wrapper, 1, 'Oat drink, fortified')
    await wrapper.find('#slot-1-grams').setValue('200')

    await buttonNamed(wrapper, 'Save the meal').trigger('click')
    await flushPromises()

    const [saved] = await db.mealTemplates.toArray()
    expect(saved!.name).toBe('Breakfast')
    // kind is derived from how many options a slot holds, never asked for (§7).
    expect(saved!.slots.map((slot) => [slot.label, slot.kind, slot.defaultGrams])).toEqual([
      ['Base', 'fixed', 50],
      ['Liquid', 'variable', 200],
    ])
    expect(wrapper.emitted('saved')).toHaveLength(1)
  })

  it('gives every slot an id that is not derived from its label', async () => {
    const wrapper = await render()
    await wrapper.find('#template-name').setValue('Breakfast')
    await wrapper.find('#slot-0-label').setValue('Base')
    await addFood(wrapper, 0, 'Rolled oats')
    await buttonNamed(wrapper, 'Save the meal').trigger('click')
    await flushPromises()

    const [saved] = (await db.mealTemplates.toArray()) as MealTemplate[]
    // LogItem references slot ids, so renaming a slot must not change its id —
    // which a slug of the label would invite.
    expect(saved!.slots[0]!.id).not.toBe('Base')
    expect(saved!.slots[0]!.id).not.toBe('base')
    expect(saved!.slots[0]!.id.length).toBeGreaterThan(8)
  })

  it('accepts a decimal comma for a slot amount', async () => {
    const wrapper = await render()
    await wrapper.find('#template-name').setValue('Snack')
    await wrapper.find('#slot-0-label').setValue('Fruit')
    await addFood(wrapper, 0, 'Banana')
    await wrapper.find('#slot-0-grams').setValue('62,5')
    await buttonNamed(wrapper, 'Save the meal').trigger('click')
    await flushPromises()

    const [saved] = await db.mealTemplates.toArray()
    expect(saved!.slots[0]!.defaultGrams).toBe(62.5)
  })

  it('leaves without saving on cancel', async () => {
    const wrapper = await render()
    await buttonNamed(wrapper, 'Cancel').trigger('click')

    expect(wrapper.emitted('cancel')).toHaveLength(1)
    expect(await db.mealTemplates.count()).toBe(0)
  })
})
