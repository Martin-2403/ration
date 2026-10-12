import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import IconAction from '../IconAction.vue'

describe('IconAction', () => {
  it('renders its slot inside a plain button', () => {
    const wrapper = mount(IconAction, { slots: { default: '<svg data-test="icon" />' } })
    expect(wrapper.element.tagName).toBe('BUTTON')
    expect(wrapper.attributes('type')).toBe('button')
    expect(wrapper.find('[data-test="icon"]').exists()).toBe(true)
  })

  it('passes aria and title attributes through to the button', () => {
    const wrapper = mount(IconAction, {
      attrs: { 'aria-label': 'Edit Oats', title: 'Edit', 'aria-expanded': false },
    })
    expect(wrapper.attributes('aria-label')).toBe('Edit Oats')
    expect(wrapper.attributes('title')).toBe('Edit')
    expect(wrapper.attributes('aria-expanded')).toBe('false')
  })

  it('fires a click listener passed from the parent', async () => {
    let clicks = 0
    const wrapper = mount(IconAction, { attrs: { onClick: () => clicks++ } })
    await wrapper.trigger('click')
    expect(clicks).toBe(1)
  })

  it('adds the danger class only when asked', () => {
    expect(mount(IconAction).classes()).not.toContain('danger')
    expect(mount(IconAction, { props: { danger: true } }).classes()).toContain('danger')
  })
})
