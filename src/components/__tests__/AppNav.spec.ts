import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import router from '../../router'
import AppNav from '../AppNav.vue'

/** Mounted against the real router, so a route that does not exist fails here. */
const render = async (path = '/') => {
  await router.push(path)
  await router.isReady()

  return mount(AppNav, { global: { plugins: [router] } })
}

/** The tab whose link is marked as the current page. */
const currentTab = (wrapper: Awaited<ReturnType<typeof render>>) =>
  wrapper.findAll('a').filter((link) => link.attributes('aria-current') === 'page')

describe('AppNav', () => {
  it('offers one tab per view, in the order of the daily loop', async () => {
    const wrapper = await render()

    expect(wrapper.findAll('a').map((link) => link.attributes('href'))).toEqual([
      '/',
      // The logging tab #61 left without an entry point: the log route existed
      // but nothing navigated to it except a button on the day view.
      '/log',
      '/evaluation',
      '/supplements',
      '/settings',
    ])
  })

  it('names every tab, so the icons are not the only label', async () => {
    const wrapper = await render()

    // Below 30rem the visible text is hidden and the icon stands alone, so the
    // name has to survive without it.
    expect(wrapper.findAll('a').map((link) => link.attributes('aria-label'))).toEqual([
      'Day',
      'Log',
      'Evaluation',
      'Supplements',
      'Settings',
    ])
  })

  it('marks the current tab, and only that one', async () => {
    const onDay = await render('/')
    expect(currentTab(onDay).map((link) => link.attributes('aria-label'))).toEqual(['Day'])

    const onLog = await render('/log')
    expect(currentTab(onLog).map((link) => link.attributes('aria-label'))).toEqual(['Log'])
  })

  it('does not mark the current tab by colour alone', async () => {
    const wrapper = await render('/')

    // §15's floor. The class carries a weight change and an indicator bar in
    // the stylesheet; with the labels hidden the bar is what is left, so its
    // absence would leave colour doing the work by itself.
    expect(currentTab(wrapper)[0]!.classes()).toContain('router-link-active')
  })

  it('hides the icons from assistive technology', async () => {
    const wrapper = await render()

    // Decorative: the link is already named, and a screen reader announcing
    // "calendar days, Day" reads the implementation out loud.
    expect(wrapper.findAll('svg').map((icon) => icon.attributes('aria-hidden'))).toEqual(
      Array(5).fill('true'),
    )
  })

  it('is a single navigation landmark', async () => {
    const wrapper = await render()

    // One nav in two layouts rather than one per breakpoint: a hidden second
    // landmark is still announced.
    expect(wrapper.findAll('nav')).toHaveLength(1)
  })
})
