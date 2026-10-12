import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent, h, ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { useStepHistory } from '../useStepHistory'

/** history.go resolves on a later task in jsdom, as in a browser. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 20))

const depth = ref(0)
const backs = ref(0)

/** Mirrors goBack: one level out per call. */
const onBack = () => {
  backs.value++
  depth.value = Math.max(0, depth.value - 1)
}

const mountHost = () =>
  mount(
    defineComponent({
      setup() {
        useStepHistory(() => depth.value, onBack)
        return () => h('div')
      },
    }),
  )

const step = () => history.state?.rationStep ?? 0

/** Unwind whatever a previous test left, so each starts on a clean entry. */
async function reset() {
  for (let i = 0; i < 5 && history.state?.rationStep; i++) {
    history.back()
    await settle()
  }
}

beforeEach(async () => {
  await reset()
  history.replaceState({ position: 7, current: '/log' }, '')
  depth.value = 0
  backs.value = 0
})

afterEach(reset)

describe('useStepHistory', () => {
  it('pushes one entry per step and keeps the router state on it', async () => {
    const before = history.length
    const wrapper = mountHost()

    depth.value = 2
    await flushPromises()

    expect(history.length).toBe(before + 2)
    expect(step()).toBe(2)
    expect(history.state).toMatchObject({ position: 7, current: '/log' })
    wrapper.unmount()
  })

  it('turns a back into one goBack per step and stays on the route', async () => {
    const wrapper = mountHost()
    depth.value = 2
    await flushPromises()

    history.back()
    await settle()
    expect([backs.value, depth.value, step()]).toEqual([1, 1, 1])

    history.back()
    await settle()
    expect([backs.value, depth.value, step()]).toEqual([2, 0, 0])
    wrapper.unmount()
  })

  it('leaves the route for good once no step remains', async () => {
    const wrapper = mountHost()
    depth.value = 1
    await flushPromises()

    history.back()
    await settle()
    history.back()
    await settle()

    expect(backs.value).toBe(1)
    expect(depth.value).toBe(0)
    wrapper.unmount()
  })

  it('pays for a button-driven back with a history entry, not a second goBack', async () => {
    const wrapper = mountHost()
    depth.value = 2
    await flushPromises()

    depth.value = 1
    await settle()
    expect([backs.value, step()]).toEqual([0, 1])

    depth.value = 0
    await settle()
    expect([backs.value, step()]).toEqual([0, 0])
    wrapper.unmount()
  })

  it('collapses a multi-level jump in one move', async () => {
    const wrapper = mountHost()
    depth.value = 2
    await flushPromises()

    depth.value = 0
    await settle()

    expect([backs.value, step()]).toEqual([0, 0])
    wrapper.unmount()
  })

  it('pushes after a rewind settles when the view moves again straight away', async () => {
    const wrapper = mountHost()
    depth.value = 2
    await flushPromises()

    depth.value = 0
    await flushPromises()
    depth.value = 1
    await settle()

    expect(step()).toBe(1)
    wrapper.unmount()
  })

  it('drops entries a previous visit left behind on mount', async () => {
    history.pushState({ position: 7, current: '/log', rationStep: 1 }, '')
    history.pushState({ position: 7, current: '/log', rationStep: 2 }, '')
    const wrapper = mountHost()
    await settle()

    expect(step()).toBe(0)
    expect(backs.value).toBe(0)
    wrapper.unmount()
  })

  it('stops listening once unmounted', async () => {
    const wrapper = mountHost()
    depth.value = 1
    await flushPromises()
    wrapper.unmount()

    history.back()
    await settle()

    expect(backs.value).toBe(0)
  })

  it('keeps pushing after a rewind that had nowhere to go', async () => {
    // A leftover claiming more entries below than exist: go(-n) is a no-op and
    // fires no popstate, so nothing would otherwise clear `rewinding`.
    history.replaceState({ position: 7, current: '/log', rationStep: 99 }, '')
    const wrapper = mountHost()
    await settle()

    // Longer than the fallback that stands in for the popstate that never comes.
    await new Promise((resolve) => setTimeout(resolve, 250))
    depth.value = 1
    await settle()

    expect(step()).toBe(1)
    wrapper.unmount()
  })

  it('calls onBack once per entry a single popstate consumed', async () => {
    const wrapper = mountHost()
    depth.value = 2
    await flushPromises()

    history.go(-2)
    await settle()

    expect(depth.value).toBe(0)
    expect(backs.value).toBe(2)
    wrapper.unmount()
  })
})
