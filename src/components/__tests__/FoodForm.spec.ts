import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import { DECLARATION_NUTRIENTS } from '../../data/nutrients'
import type { Food } from '../../types'
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

  it('refuses a negative value and names the field', async () => {
    const wrapper = mount(FoodForm)
    await fill(wrapper, { name: 'Apple', grams: '150' })
    await wrapper.find('#food-protein').setValue('-5')

    expect(wrapper.find('button[type="submit"]').attributes('disabled')).toBeDefined()
    expect(wrapper.text()).toContain('Cannot be negative: Protein')
  })

  it('refuses a negative amount eaten', async () => {
    const wrapper = mount(FoodForm)
    await fill(wrapper, { name: 'Apple', grams: '-150' })

    expect(wrapper.find('button[type="submit"]').attributes('disabled')).toBeDefined()
  })

  it('accepts an amount that is not a round number', async () => {
    const wrapper = mount(FoodForm)
    await fill(wrapper, { name: 'Apple', grams: '123', energy: '52' })
    await wrapper.find('form').trigger('submit')

    // A step of 5 once made every non-multiple natively invalid, so the browser
    // refused the submit while the button still looked enabled.
    const [, emittedGrams] = wrapper.emitted('submit')![0] as [unknown, number]
    expect(emittedGrams).toBe(123)
  })

  // Deliberate: a number input hides unparseable text from the app and rejects
  // the decimal comma in some locales. See parse-amount.ts.
  it.each(['#food-grams', '#food-energy', '#food-protein', '#food-salt'])(
    '%s is a text input with a decimal keypad, not a number input',
    (id) => {
      const wrapper = mount(FoodForm)

      expect(wrapper.find(id).attributes('type')).toBe('text')
      expect(wrapper.find(id).attributes('inputmode')).toBe('decimal')
    },
  )

  it('blocks submit on letters and names the field', async () => {
    const wrapper = mount(FoodForm)
    await fill(wrapper, { name: 'Apple', grams: '150' })
    await wrapper.find('#food-energy').setValue('abc')

    // The reported bug: a letter left the form submittable, and the value was
    // silently recorded as no data.
    expect(wrapper.find('button[type="submit"]').attributes('disabled')).toBeDefined()
    expect(wrapper.text()).toContain('Not a number: Energy')
    expect(wrapper.find('#food-energy').attributes('aria-invalid')).toBe('true')
  })

  it('blocks submit on letters in the amount eaten', async () => {
    const wrapper = mount(FoodForm)
    await fill(wrapper, { name: 'Apple', grams: 'abc' })

    expect(wrapper.find('button[type="submit"]').attributes('disabled')).toBeDefined()
    expect(wrapper.text()).toContain('Not a number: Eaten')
  })

  it('recovers once the bad text is replaced', async () => {
    const wrapper = mount(FoodForm)
    await fill(wrapper, { name: 'Apple', grams: '150' })
    await wrapper.find('#food-energy').setValue('abc')
    await wrapper.find('#food-energy').setValue('52')

    expect(wrapper.find('button[type="submit"]').attributes('disabled')).toBeUndefined()
    expect(wrapper.text()).not.toContain('Not a number')
  })

  it('accepts a decimal comma', async () => {
    const wrapper = mount(FoodForm)
    await fill(wrapper, { name: 'Apple', grams: '150' })
    await wrapper.find('#food-protein').setValue('1,5')
    await wrapper.find('form').trigger('submit')

    // German uses the comma as its decimal separator (§14). A number input
    // silently emptied the field instead.
    const [food] = wrapper.emitted('submit')![0] as [
      { per100g: Record<string, { value: number; source: string }> },
    ]
    expect(food.per100g.protein).toEqual({ value: 1.5, source: 'user' })
  })

  it('names every offending field, not just the first', async () => {
    const wrapper = mount(FoodForm)
    await fill(wrapper, { name: 'Apple', grams: '150' })
    await wrapper.find('#food-energy').setValue('abc')
    await wrapper.find('#food-protein').setValue('xyz')

    expect(wrapper.text()).toContain('Energy')
    expect(wrapper.text()).toContain('Protein')
  })

  it('offers exactly the seven a label declares', () => {
    const wrapper = mount(FoodForm)

    // Not "every tracked nutrient", which this asserted while the registry held
    // five: the registry is the Annex XIII set now, and a form with 34 fields is
    // not a form anyone fills in (#56). Asserted against the constant so the
    // form and the declaration cannot drift apart.
    expect(
      wrapper.findAll('input[inputmode="decimal"]').map((field) => field.attributes('id')),
    ).toEqual(['food-grams', ...DECLARATION_NUTRIENTS.map((key) => `food-${key}`)])
  })

  it('does not ask for a micronutrient', () => {
    const wrapper = mount(FoodForm)

    // Micronutrients reach a food through the resolver, not by being typed
    // off a label that does not print them (#80).
    expect(wrapper.find('#food-vitaminD').exists()).toBe(false)
    expect(wrapper.find('#food-selenium').exists()).toBe(false)
  })
})

/**
 * #51's clone and correct. The provenance rule itself is tested against
 * reviseFood; what matters here is that the form asks for the right thing and
 * hands back the right id.
 */
describe('FoodForm, started from a food', () => {
  const source: Food = {
    id: 'yoghurt',
    name: 'Yoghurt, 3.5%',
    per100g: {
      energy: { value: 66, source: 'off-packaging' },
      fat: { value: 3.5, source: 'off-packaging' },
      salt: { value: 0, source: 'unknown' },
    },
  }

  const render = () => mount(FoodForm, { props: { source } })

  it('prefills the name and the known values', () => {
    const wrapper = render()

    expect((wrapper.find('#food-name').element as HTMLInputElement).value).toBe('Yoghurt, 3.5%')
    expect((wrapper.find('#food-energy').element as HTMLInputElement).value).toBe('66')
    expect((wrapper.find('#food-fat').element as HTMLInputElement).value).toBe('3.5')
  })

  it('leaves an unknown value blank rather than showing its stored zero', () => {
    // §3: an unknown is stored as 0, and putting that in front of the user
    // presents a figure nobody knows as a measurement.
    expect((render().find('#food-salt').element as HTMLInputElement).value).toBe('')
  })

  it('refuses a copy under the source name, and says which way out', async () => {
    const wrapper = render()
    await wrapper.find('#food-grams').setValue('150')

    // Two foods with the same name is the duplicate #40 removed, arriving by
    // another route.
    expect(wrapper.text()).toContain('Give the copy its own name')
    await wrapper.find('form').trigger('submit')
    expect(wrapper.emitted('submit')).toBeUndefined()
  })

  it('saves a renamed copy under a new id, leaving the source alone', async () => {
    const wrapper = render()
    await wrapper.find('#food-name').setValue('Yoghurt, 0.1%')
    await wrapper.find('#food-fat').setValue('0.1')
    await wrapper.find('#food-grams').setValue('150')
    await wrapper.find('form').trigger('submit')

    const [food] = wrapper.emitted('submit')![0] as [Food, number]
    expect(food.id).not.toBe('yoghurt')
    expect(food.name).toBe('Yoghurt, 0.1%')
    // The edited figure is the user's; the untouched one keeps the label's.
    expect(food.per100g.fat).toEqual({ value: 0.1, source: 'user' })
    expect(food.per100g.energy).toEqual({ value: 66, source: 'off-packaging' })
  })

  it('corrects in place under the same id', async () => {
    const wrapper = render()
    await wrapper.find('#food-energy').setValue('70')
    await wrapper.find('#food-grams').setValue('150')
    await wrapper.find('button.ghost').trigger('click')

    const [food] = wrapper.emitted('submit')![0] as [Food, number]
    expect(food.id).toBe('yoghurt')
    expect(food.per100g.energy).toEqual({ value: 70, source: 'user' })
  })

  it('allows a correction to keep the name', async () => {
    const wrapper = render()
    await wrapper.find('#food-energy').setValue('70')
    await wrapper.find('#food-grams').setValue('150')

    // The same-name guard applies to copying, not to correcting.
    expect(wrapper.find('button.ghost').attributes('disabled')).toBeUndefined()
  })

  it('offers no second action when nothing is being copied', () => {
    const wrapper = mount(FoodForm)

    expect(wrapper.find('button.ghost').exists()).toBe(false)
    expect(wrapper.text()).toContain('Save and log')
  })
})
