// The root route renders DayView, which reads the log store, which opens
// Dexie — so both need to exist before mounting.
import 'fake-indexeddb/auto'

import { mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { describe, expect, it } from 'vitest'

import App from '../App.vue'
import router from '../router'

describe('App', () => {
  it('renders the primary navigation', async () => {
    router.push('/')
    await router.isReady()

    const wrapper = mount(App, { global: { plugins: [router, createPinia()] } })

    // Mounting with the real router rather than stubbing RouterLink, so this
    // also catches a broken route table — the reason the shell exists at all.
    expect(wrapper.text()).toContain('Day')
    expect(wrapper.text()).toContain('Evaluation')
    expect(wrapper.text()).toContain('Supplements')
    expect(wrapper.text()).toContain('Settings')
  })
})
