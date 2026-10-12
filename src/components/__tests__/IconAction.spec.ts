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

  it.each(['edit', 'danger'] as const)('adds the %s class only for that variant', (variant) => {
    expect(mount(IconAction).classes()).toEqual(['icon-action'])
    expect(mount(IconAction, { props: { variant } }).classes()).toContain(variant)
  })

  it('carries one variant at a time', () => {
    expect(mount(IconAction, { props: { variant: 'edit' } }).classes()).not.toContain('danger')
  })
})
