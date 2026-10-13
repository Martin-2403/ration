// The export form counts what is stored, which opens Dexie.
import 'fake-indexeddb/auto'

import { flushPromises, mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { afterEach, describe, expect, it } from 'vitest'

import router from '../../router'
import SettingsView from '../SettingsView.vue'

const mounted: Array<{ unmount: () => void }> = []

afterEach(() => {
  mounted.splice(0).forEach((wrapper) => wrapper.unmount())
})

const open = async (to: string) => {
  await router.push(to)
  await router.isReady()
  // attachTo: focus only means something on an element that is in the document.
  const wrapper = mount(SettingsView, {
    global: { plugins: [router, createPinia()] },
    attachTo: document.body,
  })
  mounted.push(wrapper)
  await flushPromises()
}

describe('SettingsView', () => {
  it('focuses the passphrase field when sent here by the backup prompt (#147)', async () => {
    await open('/settings#backup')

    expect(document.activeElement?.id).toBe('backup-passphrase')
  })

  it('leaves focus alone on an ordinary visit', async () => {
    ;(document.activeElement as HTMLElement | null)?.blur()
    await open('/settings')

    expect(document.activeElement?.id).not.toBe('backup-passphrase')
  })
})
