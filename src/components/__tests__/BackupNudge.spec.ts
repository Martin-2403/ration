import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { recordBackup } from '../../backup/last-backup'
import { SNOOZE_MS } from '../../backup/nudge'
import { lastSnoozedAt } from '../../backup/snooze'
import router from '../../router'
import BackupNudge from '../BackupNudge.vue'

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Safari/604.1'

const render = async () => {
  const wrapper = mount(BackupNudge, { global: { plugins: [router] } })
  await flushPromises()

  return wrapper
}

const button = (wrapper: Awaited<ReturnType<typeof render>>, label: string) =>
  wrapper.findAll('button').find((b) => b.text() === label)!

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
  // jsdom has no matchMedia; remove what a test installed.
  Reflect.deleteProperty(window, 'matchMedia')
})

describe('BackupNudge', () => {
  it('asks for a first backup when there has never been one', async () => {
    const wrapper = await render()

    expect(wrapper.find('aside').attributes('data-variant')).toBe('first')
    expect(wrapper.text()).toContain('not backed up your log yet')
    expect(wrapper.find('[data-testid="install-hint"]').exists()).toBe(false)
  })

  it('says nothing when the log was backed up recently', async () => {
    recordBackup(['logEntries', 'foods'])

    expect((await render()).find('aside').exists()).toBe(false)
  })

  it('is not satisfied by an export that left the log out', async () => {
    recordBackup(['foods', 'goals'])

    expect((await render()).find('aside').attributes('data-variant')).toBe('first')
  })

  it('calls an old backup overdue', async () => {
    recordBackup(['logEntries'], Date.now() - 2 * 24 * 60 * 60 * 1000)

    const wrapper = await render()

    expect(wrapper.find('aside').attributes('data-variant')).toBe('overdue')
    expect(wrapper.text()).toContain('more than a day old')
  })

  it('hides on "Not now" and stays hidden for the snooze', async () => {
    const wrapper = await render()

    await button(wrapper, 'Not now').trigger('click')

    expect(wrapper.find('aside').exists()).toBe(false)
    expect(lastSnoozedAt()).toBeTypeOf('number')

    expect((await render()).find('aside').exists()).toBe(false)
  })

  it('comes back once the snooze has run out', async () => {
    const wrapper = await render()
    await button(wrapper, 'Not now').trigger('click')

    vi.useFakeTimers({ now: Date.now() + SNOOZE_MS + 1000, toFake: ['Date'] })

    expect((await render()).find('aside').exists()).toBe(true)
  })

  it('takes "Back up now" to the export form in Settings', async () => {
    const wrapper = await render()

    await button(wrapper, 'Back up now').trigger('click')
    await flushPromises()

    expect(router.currentRoute.value.path).toBe('/settings')
    expect(router.currentRoute.value.hash).toBe('#backup')
  })

  describe('in an iOS browser tab', () => {
    beforeEach(() => {
      vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(IPHONE)
    })

    it('shows the stronger copy and the install steps', async () => {
      const wrapper = await render()

      expect(wrapper.find('aside').attributes('data-variant')).toBe('ios-tab')
      expect(wrapper.get('[data-testid="ios-warning"]').text()).toContain('Safari tab')

      const hint = wrapper.get('[data-testid="install-hint"]').text()
      expect(hint).toContain('Share')
      expect(hint).toContain('Add to Home Screen')
      expect(hint).toContain('empty storage')
      expect(hint).toContain('back up first')
    })

    it('does not show the install hint to someone who has already installed', async () => {
      window.matchMedia = () => ({ matches: true }) as MediaQueryList

      const wrapper = await render()

      expect(wrapper.find('aside').attributes('data-variant')).toBe('first')
      expect(wrapper.find('[data-testid="install-hint"]').exists()).toBe(false)
    })
  })
})
