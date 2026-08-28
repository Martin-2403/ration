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

  it('accepts an amount that is not a round number', async () => {
    const wrapper = mount(FoodForm)
    await fill(wrapper, { name: 'Apple', grams: '123', energy: '52' })

    // A step of 5 made every non-multiple natively invalid, so the browser
    // refused the submit while the button still looked enabled. Nothing in the
    // app could see it, because triggering submit in a test bypasses native
    // validation entirely — hence the attribute assertions below.
    const grams = wrapper.find('#food-grams')
    expect(grams.attributes('step')).toBe('any')
    expect(wrapper.find('form').attributes('novalidate')).toBeDefined()
    expect(wrapper.find('button[type="submit"]').attributes('disabled')).toBeUndefined()

    await wrapper.find('form').trigger('submit')
    const [, emittedGrams] = wrapper.emitted('submit')![0] as [unknown, number]
    expect(emittedGrams).toBe(123)
  })

  /**
   * jsdom never sets badInput, so it is faked. That is the only way to cover
   * this at all, and the case is worth covering: a number field can hold text
   * the browser cannot parse while reporting its value as '', and the typed
   * character stays visible.
   */
  const fakeBadInput = (wrapper: ReturnType<typeof mount>, selector: string) => {
    const el = wrapper.find(selector).element as HTMLInputElement
    Object.defineProperty(el, 'validity', {
      configurable: true,
      value: { badInput: true },
    })
  }

  it('blocks submit when a field holds text the browser cannot parse', async () => {
    const wrapper = mount(FoodForm)
    await fill(wrapper, { name: 'Apple', grams: '150' })
    fakeBadInput(wrapper, '#food-energy')

    // Blur, not input: a keystroke leaving the parsed value unchanged ('' before,
    // '' after) may fire no input event at all, so blur is what catches it when
    // the user clicks away.
    await wrapper.find('#food-energy').trigger('blur')

    expect(wrapper.find('button[type="submit"]').attributes('disabled')).toBeDefined()
    expect(wrapper.text()).toContain('not a number')
  })

  it('refuses to submit unparseable text even if no event ever reported it', async () => {
    const wrapper = mount(FoodForm)
    await fill(wrapper, { name: 'Apple', grams: '150' })

    // No input and no blur — the state the component was never told about.
    fakeBadInput(wrapper, '#food-energy')
    await wrapper.find('form').trigger('submit')

    // submit() re-reads the DOM, so nothing is emitted and the reason appears.
    expect(wrapper.emitted('submit')).toBeUndefined()
    expect(wrapper.text()).toContain('not a number')
  })

  it('clears the problem once the field parses again', async () => {
    const wrapper = mount(FoodForm)
    await fill(wrapper, { name: 'Apple', grams: '150' })
    fakeBadInput(wrapper, '#food-energy')
    await wrapper.find('#food-energy').trigger('blur')

    // Restore a real validity object, as retyping a valid number would.
    const el = wrapper.find('#food-energy').element as HTMLInputElement
    Object.defineProperty(el, 'validity', {
      configurable: true,
      value: { badInput: false },
    })
    await wrapper.find('#food-energy').setValue('52')

    expect(wrapper.find('button[type="submit"]').attributes('disabled')).toBeUndefined()
    expect(wrapper.text()).not.toContain('not a number')
  })

  it('offers an input for every tracked nutrient', () => {
    const wrapper = mount(FoodForm)

    expect(wrapper.find('#food-energy').exists()).toBe(true)
    expect(wrapper.find('#food-protein').exists()).toBe(true)
    expect(wrapper.find('#food-vitaminD').exists()).toBe(true)
  })
})
