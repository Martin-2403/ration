import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { requestPersistence, resetPersistenceSession } from '../../storage-persistence'
import StoragePanel from '../StoragePanel.vue'

const render = async (storage: Partial<StorageManager> | undefined, standalone = false) => {
  vi.stubGlobal('navigator', { storage })
  window.matchMedia = () => ({ matches: standalone }) as MediaQueryList
  const wrapper = mount(StoragePanel)
  await flushPromises()

  return wrapper
}

beforeEach(() => {
  localStorage.clear()
  resetPersistenceSession()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('StoragePanel', () => {
  it('says granted without promising safety', async () => {
    const wrapper = await render({ persisted: async () => true })
    const text = wrapper.get('[data-testid=persistence]')

    expect(text.attributes('data-state')).toBe('granted')
    expect(text.text()).toContain('agreed to keep')
    expect(text.text().toLowerCase()).not.toContain('safe')
  })

  it('says refused after a refusal', async () => {
    const storage = { persisted: async () => false, persist: async () => false }
    vi.stubGlobal('navigator', { storage })
    await requestPersistence()
    const wrapper = await render(storage)

    expect(wrapper.get('[data-testid=persistence]').attributes('data-state')).toBe('refused')
    expect(wrapper.text()).toContain('declined')
  })

  it('says not asked before any write', async () => {
    const wrapper = await render({ persisted: async () => false })

    expect(wrapper.get('[data-testid=persistence]').attributes('data-state')).toBe('not-asked')
    expect(wrapper.text()).toContain('Not in effect yet')
  })

  it('says unsupported without a Storage API, and no usage figure', async () => {
    const wrapper = await render(undefined)

    expect(wrapper.get('[data-testid=persistence]').attributes('data-state')).toBe('unsupported')
    expect(wrapper.get('[data-testid=usage]').text()).toContain('does not report')
  })

  it('shows usage as a rough figure, keeping a zero usage', async () => {
    const wrapper = await render({
      persisted: async () => true,
      estimate: async () => ({ usage: 0, quota: 2_500_000_000 }),
    })

    expect(wrapper.get('[data-testid=usage]').text()).toBe(
      'About 0 bytes of roughly 2.5 GB. The browser reports this approximately.',
    )
  })

  it('tells an installed app from a tab', async () => {
    const installed = await render({ persisted: async () => true }, true)
    expect(installed.get('[data-testid=installed]').text()).toContain('installed app')

    const tab = await render({ persisted: async () => true }, false)
    expect(tab.get('[data-testid=installed]').text()).toContain('browser tab')
  })
})
