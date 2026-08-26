import { describe, it, expect } from 'vitest'

import { mount } from '@vue/test-utils'
import App from '../App.vue'
import router from '../router'

describe('App', () => {
  it('renders the primary navigation', async () => {
    router.push('/')
    await router.isReady()

    const wrapper = mount(App, { global: { plugins: [router] } })

    // Mounting with the real router rather than stubbing RouterLink, so this
    // also catches a broken route table — the reason the shell exists at all.
    expect(wrapper.text()).toContain('Today')
    expect(wrapper.text()).toContain('Evaluation')
    expect(wrapper.text()).toContain('Supplements')
    expect(wrapper.text()).toContain('Settings')
  })
})
