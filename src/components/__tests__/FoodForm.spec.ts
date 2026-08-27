import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import FoodForm from '../FoodForm.vue'

const fill = async (
  wrapper: ReturnType<typeof mount>,
  fields: { name?: string; grams?: string; energy?: string; protein?: string },
) => {
  if (fields.name !== undefined) await wrapper.find('#food-name').setValue(fields.name)
  if (fields.grams !== undefined) await wrapper.find('#food-grams').setValue(fields.grams)
  if (fields.energy !== undefined) await wrapper.find('#food-energy').setValue(fields.energy)
  if (fields.protein !== undefined) await wrapper.find('#food-protein').setValue(fields.protein)
}

describe('FoodForm', () => {
  it('cannot be submitted without a name', async () => {
    const wrapper = mount(FoodForm)
    await fill(wrapper, { grams: '100' })

    expect(wrapper.find('button[type="submit"]').attributes('disabled')).toBeDefined()
  })

  it('cannot be submitted without a positive amount eaten', async () => {
    const wrapper = mount(FoodForm)
    await fill(wrapper, { name: 'Apple', grams: '0' })

    expect(wrapper.find('button[type="submit"]').attributes('disabled')).toBeDefined()
  })

  it('emits the food and the amount eaten', async () => {
    const wrapper = mount(FoodForm)
    await fill(wrapper, { name: 'Apple', grams: '150', energy: '52' })
    await wrapper.find('form').trigger('submit')

    const [food, grams] = wrapper.emitted('submit')![0] as [
      { name: string; per100g: Record<string, { value: number; source: string }> },
      number,
    ]

    expect(food.name).toBe('Apple')
    expect(grams).toBe(150)
    expect(food.per100g.energy).toEqual({ value: 52, source: 'user' })
  })

  it('records fields left blank as unknown rather than zero', async () => {
    const wrapper = mount(FoodForm)
    await fill(wrapper, { name: 'Apple', grams: '150', energy: '52' })
    await wrapper.find('form').trigger('submit')

    const [food] = wrapper.emitted('submit')![0] as [
      { per100g: Record<string, { value: number; source: string }> },
    ]

    expect(food.per100g.protein!.source).toBe('unknown')
    expect(food.per100g.vitaminD!.source).toBe('unknown')
  })

  it('tells the user that blank means no data', () => {
    const wrapper = mount(FoodForm)

    // The user is the one supplying the gap here, so the rule is stated rather
    // than left implicit (§3).
    expect(wrapper.text()).toContain('never as zero')
  })

  it('clears itself after a submit', async () => {
    const wrapper = mount(FoodForm)
    await fill(wrapper, { name: 'Apple', grams: '150', energy: '52' })
    await wrapper.find('form').trigger('submit')

    expect((wrapper.find('#food-name').element as HTMLInputElement).value).toBe('')
    expect((wrapper.find('#food-energy').element as HTMLInputElement).value).toBe('')
    expect(wrapper.find('button[type="submit"]').attributes('disabled')).toBeDefined()
  })

  it('stays submittable after a value field is filled then cleared', async () => {
    const wrapper = mount(FoodForm)
    await fill(wrapper, { name: 'Apple', grams: '150' })
    await wrapper.find('#food-protein').setValue('12')
    await wrapper.find('#food-protein').setValue('')

    // Clearing a field is how the form says "no data" — it must not leave the
    // submit button stuck. v-model.number leaves '' in the model, which is not a
    // number, so a naive numeric check disables submit with nothing on screen
    // to explain why.
    expect(wrapper.find('button[type="submit"]').attributes('disabled')).toBeUndefined()
  })

  it('records a cleared value field as unknown', async () => {
    const wrapper = mount(FoodForm)
    await fill(wrapper, { name: 'Apple', grams: '150' })
    await wrapper.find('#food-protein').setValue('12')
    await wrapper.find('#food-protein').setValue('')
    await wrapper.find('form').trigger('submit')

    const [food] = wrapper.emitted('submit')![0] as [
      { per100g: Record<string, { value: number; source: string }> },
    ]

    expect(food.per100g.protein?.source).toBe('unknown')
  })

  it('refuses a negative value and says so', async () => {
    const wrapper = mount(FoodForm)
    await fill(wrapper, { name: 'Apple', grams: '150' })
    await wrapper.find('#food-protein').setValue('-5')

    expect(wrapper.find('button[type="submit"]').attributes('disabled')).toBeDefined()
    expect(wrapper.text()).toContain('cannot be negative')
  })

  it('refuses a negative amount eaten', async () => {
    const wrapper = mount(FoodForm)
    await fill(wrapper, { name: 'Apple', grams: '-150' })

    expect(wrapper.find('button[type="submit"]').attributes('disabled')).toBeDefined()
  })

  it('offers an input for every tracked nutrient', () => {
    const wrapper = mount(FoodForm)

    expect(wrapper.find('#food-energy').exists()).toBe(true)
    expect(wrapper.find('#food-protein').exists()).toBe(true)
    expect(wrapper.find('#food-vitaminD').exists()).toBe(true)
  })
})
