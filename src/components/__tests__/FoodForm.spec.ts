import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import { DECLARATION_NUTRIENTS } from '../../data/nutrients'
import type { NewFood } from '../../types'
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
  const source: NewFood = {
    id: 'yoghurt',
    name: 'Yoghurt, 3.5%',
    per100g: {
      energy: { value: 66, source: 'off-packaging' },
      fat: { value: 3.5, source: 'off-packaging' },
      salt: { value: 0, source: 'unknown' },
    },
  }

  const render = () => mount(FoodForm, { props: { source } })

  const button = (wrapper: ReturnType<typeof render>, label: string) =>
    wrapper.findAll('button').find((candidate) => candidate.text() === label)!

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

    const [food] = wrapper.emitted('submit')![0] as [NewFood, number]
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
    await button(wrapper, 'Update Yoghurt, 3.5% and log').trigger('click')

    const [food] = wrapper.emitted('submit')![0] as [NewFood, number]
    expect(food.id).toBe('yoghurt')
    expect(food.per100g.energy).toEqual({ value: 70, source: 'user' })
  })

  it('allows a correction to keep the name', async () => {
    const wrapper = render()
    await wrapper.find('#food-energy').setValue('70')
    await wrapper.find('#food-grams').setValue('150')

    // The same-name guard applies to copying, not to correcting.
    expect(button(wrapper, 'Update Yoghurt, 3.5% and log').attributes('disabled')).toBeUndefined()
  })

  it('offers no second action when nothing is being copied', () => {
    const wrapper = mount(FoodForm)

    expect(wrapper.find('button.ghost').exists()).toBe(false)
    expect(wrapper.text()).toContain('Save and log')
  })
})

/**
 * #93: correcting a food without logging it. The amount eaten describes a meal,
 * not the food, so it must not gate — or even be read by — the action that
 * stores a food and writes nothing else.
 */
describe('FoodForm, saving a correction without logging', () => {
  const source: NewFood = {
    id: 'yoghurt',
    name: 'Yoghurt, 3.5%',
    per100g: {
      energy: { value: 66, source: 'off-packaging' },
      fat: { value: 3.5, source: 'off-packaging' },
    },
  }

  const render = () => mount(FoodForm, { props: { source } })

  const saveOnly = (wrapper: ReturnType<typeof render>) =>
    wrapper
      .findAll('button')
      .find((button) => button.text() === 'Update Yoghurt, 3.5% without logging')!

  const settleWith = (wrapper: ReturnType<typeof render>, saved: boolean) =>
    (wrapper.emitted('save')![0] as [NewFood, (saved: boolean) => void])[1](saved)

  const logging = (wrapper: ReturnType<typeof render>) =>
    wrapper.findAll('button').filter((button) => /and log$/.test(button.text()))

  it('offers three actions, the filled pill on the one that copies and logs', () => {
    const wrapper = render()

    expect(wrapper.findAll('button').map((button) => button.text())).toEqual([
      'Save as new and log',
      'Update Yoghurt, 3.5% and log',
      'Update Yoghurt, 3.5% without logging',
    ])
    // One primary: the other two are the outlined secondary (§15).
    expect(wrapper.findAll('button:not(.ghost)').map((button) => button.text())).toEqual([
      'Save as new and log',
    ])
  })

  it('saves the corrected food under its own id and emits no amount', async () => {
    const wrapper = render()
    await wrapper.find('#food-energy').setValue('70')
    await saveOnly(wrapper).trigger('click')

    expect(wrapper.emitted('submit')).toBeUndefined()
    const [food, settle, ...rest] = wrapper.emitted('save')![0] as [NewFood, () => void]
    // A food and the way to report the write: no amount.
    expect(rest).toEqual([])
    expect(settle).toBeTypeOf('function')
    expect(food.id).toBe('yoghurt')
    expect(food.per100g.energy).toEqual({ value: 70, source: 'user' })
    // Untouched figures keep the label's provenance, as for the other actions.
    expect(food.per100g.fat).toEqual({ value: 3.5, source: 'off-packaging' })
  })

  it.each([
    ['blank', ''],
    ['zero', '0'],
    ['text', 'abc'],
    ['negative', '-5'],
  ])('is not blocked by an amount that is %s', async (_name, amount) => {
    const wrapper = render()
    await wrapper.find('#food-energy').setValue('70')
    await wrapper.find('#food-grams').setValue(amount)

    expect(saveOnly(wrapper).attributes('disabled')).toBeUndefined()
    await saveOnly(wrapper).trigger('click')
    expect(wrapper.emitted('save')).toHaveLength(1)
  })

  it('does not name the amount as an error while it is simply blank', async () => {
    const wrapper = render()
    await wrapper.find('#food-energy').setValue('70')

    expect(wrapper.text()).not.toContain('Eaten:')
    expect(wrapper.find('#food-grams').attributes('aria-invalid')).toBeUndefined()
  })

  it('leaves the two logging actions requiring an amount above zero', async () => {
    const wrapper = render()
    await wrapper.find('#food-name').setValue('Yoghurt, 0.1%')

    for (const amount of ['', '0', 'abc', '-5']) {
      await wrapper.find('#food-grams').setValue(amount)

      expect(logging(wrapper)).toHaveLength(2)
      for (const action of logging(wrapper)) expect(action.attributes('disabled')).toBeDefined()
    }

    await wrapper.find('#food-grams').setValue('150')
    for (const action of logging(wrapper)) expect(action.attributes('disabled')).toBeUndefined()
  })

  it('accepts a German decimal comma in a value, with no amount', async () => {
    const wrapper = render()
    await wrapper.find('#food-fat').setValue('1,5')
    await saveOnly(wrapper).trigger('click')

    const [food] = wrapper.emitted('save')![0] as [NewFood]
    expect(food.per100g.fat).toEqual({ value: 1.5, source: 'user' })
  })

  it.each([
    ['a name', () => ({ name: '' })],
    ['a value that is not a number', () => ({ energy: 'abc' })],
    ['a negative value', () => ({ protein: '-1' })],
  ])('is still blocked by %s', async (_name, change) => {
    const wrapper = render()
    const { name, energy, protein } = change() as {
      name?: string
      energy?: string
      protein?: string
    }
    await fill(wrapper, { name, energy, protein })

    expect(saveOnly(wrapper).attributes('disabled')).toBeDefined()
    await saveOnly(wrapper).trigger('click')
    expect(wrapper.emitted('save')).toBeUndefined()
  })

  it('clears itself once the host reports the write landed', async () => {
    const wrapper = render()
    await wrapper.find('#food-energy').setValue('70')
    await saveOnly(wrapper).trigger('click')

    // Not before: a failed write must find the input still there.
    expect((wrapper.find('#food-energy').element as HTMLInputElement).value).toBe('70')
    settleWith(wrapper, true)
    await wrapper.vm.$nextTick()

    expect((wrapper.find('#food-name').element as HTMLInputElement).value).toBe('')
    expect((wrapper.find('#food-energy').element as HTMLInputElement).value).toBe('')
  })

  it('keeps what was typed and says so when the write fails, then lets it be retried', async () => {
    const wrapper = render()
    await wrapper.find('#food-name').setValue('Yoghurt, plain')
    await wrapper.find('#food-energy').setValue('70')
    await saveOnly(wrapper).trigger('click')
    settleWith(wrapper, false)
    await wrapper.vm.$nextTick()

    expect((wrapper.find('#food-name').element as HTMLInputElement).value).toBe('Yoghurt, plain')
    expect((wrapper.find('#food-energy').element as HTMLInputElement).value).toBe('70')
    expect(wrapper.find('.problem').text()).toBe('Could not save the correction. Try again.')
    expect(saveOnly(wrapper).attributes('disabled')).toBeUndefined()

    await saveOnly(wrapper).trigger('click')
    expect(wrapper.emitted('save')).toHaveLength(2)
    // The message is for the last attempt only.
    expect(wrapper.text()).not.toContain('Could not save')
  })

  it('does not emit a second write while the first is unsettled', async () => {
    const wrapper = render()
    await wrapper.find('#food-energy').setValue('70')
    await saveOnly(wrapper).trigger('click')
    await saveOnly(wrapper).trigger('click')

    expect(wrapper.emitted('save')).toHaveLength(1)
  })

  // canSave is built from the same checks that name the problem, so whatever the
  // form reports as wrong with a value also blocks storing the food.
  it.each([
    ['not a number', 'abc', 'Not a number: Energy'],
    ['negative', '-3', 'Cannot be negative: Energy'],
  ])('is blocked by a value reported as %s', async (_name, typed, message) => {
    const wrapper = render()
    await wrapper.find('#food-energy').setValue(typed)

    expect(wrapper.text()).toContain(message)
    expect(saveOnly(wrapper).attributes('disabled')).toBeDefined()
  })

  it('is not offered on a food that ships with the app', () => {
    // Seeds are never read back from the store (§13): a stored correction would
    // be shadowed, and the confirmation would be a claim about nothing. The
    // action that logs is unchanged, because the entry snapshots its own totals.
    const wrapper = mount(FoodForm, {
      props: { source: { id: 'banana', name: 'Banana', per100g: {} } },
    })

    expect(wrapper.findAll('button').map((button) => button.text())).toEqual([
      'Save as new and log',
      'Update Banana and log',
    ])
  })

  it('offers it only when a food is being copied or corrected', () => {
    const wrapper = mount(FoodForm)

    expect(wrapper.text()).not.toContain('without logging')
  })
})
