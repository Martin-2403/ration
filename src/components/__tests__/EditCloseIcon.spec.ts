import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import EditCloseIcon from '../EditCloseIcon.vue'
import iconSource from '../EditCloseIcon.vue?raw'

const render = (open: boolean) => mount(EditCloseIcon, { props: { open } })

describe('EditCloseIcon', () => {
  it('is decorative: hidden from assistive tech and not focusable', () => {
    const svg = render(false).get('svg')
    expect(svg.attributes('aria-hidden')).toBe('true')
    expect(svg.attributes('focusable')).toBe('false')
  })

  it('matches the other icons: 20px, 1.5 stroke, currentColor', () => {
    const svg = render(false).get('svg')
    expect(svg.attributes('width')).toBe('20')
    expect(svg.attributes('height')).toBe('20')
    expect(svg.attributes('stroke-width')).toBe('1.5')
    expect(svg.attributes('stroke')).toBe('currentColor')
  })

  it.each([
    [false, 'closed', false],
    [true, 'open', true],
  ])('open=%s renders the %s state', (open, state, hasClass) => {
    const svg = render(open).get('svg')
    expect(svg.attributes('data-state')).toBe(state)
    expect(svg.classes('is-open')).toBe(hasClass)
  })

  it('follows the prop when it changes', async () => {
    const w = render(false)
    await w.setProps({ open: true })
    expect(w.get('svg').classes('is-open')).toBe(true)
    await w.setProps({ open: false })
    expect(w.get('svg').classes('is-open')).toBe(false)
  })

  it('draws lucide Pencil and X geometry', () => {
    const d = render(false)
      .findAll('path')
      .map((p) => p.attributes('d'))
    expect(d).toContain('m15 5 4 4')
    expect(d).toContain('M18 6 6 18')
    expect(d).toContain('m6 6 12 12')
    expect(d.some((x) => x?.startsWith('M21.174 6.812'))).toBe(true)
  })

  // jsdom evaluates neither scoped CSS nor media queries (and Vitest blanks
  // imported .css), so the rule is checked in the component source.
  it('turns its transitions off under prefers-reduced-motion', () => {
    expect(iconSource).toMatch(
      /@media \(prefers-reduced-motion: reduce\)\s*{[^}]*transition:\s*none/,
    )
  })
})
