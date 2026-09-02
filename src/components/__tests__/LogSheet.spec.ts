// Logging writes through the store, which opens Dexie.
import 'fake-indexeddb/auto'

import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { SEED_TEMPLATES } from '../../data/foods'
import { db } from '../../db'
import LogSheet from '../LogSheet.vue'

/** Attached to the document, because focus and activeElement need a real tree. */
const render = async () => {
  const wrapper = mount(LogSheet, {
    props: { templates: SEED_TEMPLATES },
    attachTo: document.body,
  })
  await flushPromises()

  return wrapper
}

const optionNamed = (wrapper: Awaited<ReturnType<typeof render>>, label: string) =>
  wrapper.findAll('.options button').find((button) => button.text().includes(label))!

const press = (key: string, shiftKey = false) =>
  document.dispatchEvent(new KeyboardEvent('keydown', { key, shiftKey, bubbles: true }))

beforeEach(async () => {
  await Promise.all([db.logEntries.clear(), db.foods.clear()])
  setActivePinia(createPinia())
})

afterEach(() => {
  document.body.innerHTML = ''
})

describe('LogSheet', () => {
  it('offers one choice per meal template plus hand entry', async () => {
    const wrapper = await render()

    expect(optionNamed(wrapper, 'Porridge')).toBeDefined()
    expect(optionNamed(wrapper, 'A food by hand')).toBeDefined()
  })

  it('carries dialog semantics, labelled by its own heading', async () => {
    const wrapper = await render()
    const panel = wrapper.find('[role="dialog"]')

    expect(panel.attributes('aria-modal')).toBe('true')
    // A label that points at nothing is worse than none: assert the target.
    const labelledBy = panel.attributes('aria-labelledby')!
    expect(wrapper.find(`#${labelledBy}`).text()).toBe('Log something')
  })

  it('moves focus into the panel when it opens', async () => {
    const wrapper = await render()

    expect(document.activeElement).toBe(wrapper.find('[role="dialog"]').element)
  })

  it('returns focus to whatever opened it', async () => {
    const trigger = document.createElement('button')
    document.body.append(trigger)
    trigger.focus()

    const wrapper = await render()
    expect(document.activeElement).not.toBe(trigger)

    wrapper.unmount()

    // Losing focus to the top of the document on close strands a keyboard user.
    expect(document.activeElement).toBe(trigger)
  })

  it('closes on Escape', async () => {
    const wrapper = await render()

    press('Escape')

    expect(wrapper.emitted('close')).toHaveLength(1)
  })

  it('closes when the scrim itself is clicked, not the panel', async () => {
    const wrapper = await render()

    await wrapper.find('.panel').trigger('click')
    expect(wrapper.emitted('close')).toBeUndefined()

    await wrapper.find('.scrim').trigger('click')
    expect(wrapper.emitted('close')).toHaveLength(1)
  })

  it('wraps Tab inside the panel', async () => {
    const wrapper = await render()
    const focusables = wrapper.findAll('.panel button:not([disabled]), .panel input, .panel select')
    const first = focusables[0]!.element as HTMLElement
    const last = focusables[focusables.length - 1]!.element as HTMLElement

    last.focus()
    press('Tab')
    expect(document.activeElement).toBe(first)

    first.focus()
    press('Tab', true)
    // Without this, Tab walks out into the page behind the sheet, which is
    // nothing but a scrim as far as the browser's tab order is concerned.
    expect(document.activeElement).toBe(last)
  })

  it('shows the builder for a chosen template', async () => {
    const wrapper = await render()

    await optionNamed(wrapper, 'Porridge').trigger('click')
    await flushPromises()

    expect(wrapper.find('.options').exists()).toBe(false)
    expect(wrapper.text()).toContain('Rolled oats')
  })

  it('returns to the list from a chosen template', async () => {
    const wrapper = await render()
    await optionNamed(wrapper, 'Porridge').trigger('click')

    await wrapper.find('button[aria-label="Back to the list"]').trigger('click')

    expect(wrapper.find('.options').exists()).toBe(true)
  })

  it('closes once a meal is logged', async () => {
    const wrapper = await render()
    await optionNamed(wrapper, 'Porridge').trigger('click')
    await flushPromises()

    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Log meal')!
      .trigger('click')

    await vi.waitFor(() => expect(wrapper.emitted('close')).toHaveLength(1))
    expect(await db.logEntries.count()).toBe(1)
  })

  it('logs a hand-entered food and closes', async () => {
    const wrapper = await render()
    await optionNamed(wrapper, 'A food by hand').trigger('click')
    await flushPromises()

    await wrapper.find('#food-name').setValue('Apple')
    await wrapper.find('#food-grams').setValue('150')
    await wrapper.find('#food-energy').setValue('52')
    await wrapper.find('form').trigger('submit')

    await vi.waitFor(() => expect(wrapper.emitted('close')).toHaveLength(1))
    const logged = await db.logEntries.toArray()
    expect(logged[0]?.items[0]).toMatchObject({ grams: 150 })
  })

  it('does not make the hand-entry form ask to be opened twice', async () => {
    const wrapper = await render()
    await optionNamed(wrapper, 'A food by hand').trigger('click')

    // The disclosure it used to sit behind was standing in for a deliberate
    // action, which the sheet now is — a second click to reveal it is friction.
    expect(wrapper.find('details').exists()).toBe(false)
    expect(wrapper.find('#food-name').exists()).toBe(true)
  })
})
