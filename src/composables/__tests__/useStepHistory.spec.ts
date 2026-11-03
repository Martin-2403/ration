import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent, h, ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useStepHistory } from '../useStepHistory'

/**
 * history.go and history.back resolve on a later task in jsdom, as in a browser,
 * and report it with a popstate. Take the promise *before* causing the traversal
 * and await it after: the composable's own listener was added earlier, so by the
 * time this resolves it has already reacted. A fixed sleep here is a race
 * against the runner (#136).
 */
const nextPopstate = () =>
  new Promise<void>((resolve) =>
    window.addEventListener('popstate', () => resolve(), { once: true }),
  )

/** Runs `move` and resolves once the traversal it started has been reported. */
async function traversing(move: () => void) {
  const popped = nextPopstate()
  move()
  await popped
}

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
    await traversing(() => history.back())
  }
}

beforeEach(async () => {
  await reset()
  // Something to go back to: history.back() on the first entry fires no popstate,
  // and a test that leaves the route for good has to land somewhere.
  history.pushState(null, '')
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

    await traversing(() => history.back())
    expect([backs.value, depth.value, step()]).toEqual([1, 1, 1])

    await traversing(() => history.back())
    expect([backs.value, depth.value, step()]).toEqual([2, 0, 0])
    wrapper.unmount()
  })

  it('leaves the route for good once no step remains', async () => {
    const wrapper = mountHost()
    depth.value = 1
    await flushPromises()

    await traversing(() => history.back())
    await traversing(() => history.back())

    expect(backs.value).toBe(1)
    expect(depth.value).toBe(0)
    wrapper.unmount()
  })

  it('pays for a button-driven back with a history entry, not a second goBack', async () => {
    const wrapper = mountHost()
    depth.value = 2
    await flushPromises()

    await traversing(() => (depth.value = 1))
    expect([backs.value, step()]).toEqual([0, 1])

    await traversing(() => (depth.value = 0))
    expect([backs.value, step()]).toEqual([0, 0])
    wrapper.unmount()
  })

  it('collapses a multi-level jump in one move', async () => {
    const wrapper = mountHost()
    depth.value = 2
    await flushPromises()

    await traversing(() => (depth.value = 0))

    expect([backs.value, step()]).toEqual([0, 0])
    wrapper.unmount()
  })

  it('pushes after a rewind settles when the view moves again straight away', async () => {
    const wrapper = mountHost()
    depth.value = 2
    await flushPromises()

    const rewound = nextPopstate()
    depth.value = 0
    await flushPromises()
    depth.value = 1
    await rewound

    expect(step()).toBe(1)
    wrapper.unmount()
  })

  it('drops entries a previous visit left behind on mount', async () => {
    history.pushState({ position: 7, current: '/log', rationStep: 1 }, '')
    history.pushState({ position: 7, current: '/log', rationStep: 2 }, '')
    let wrapper!: ReturnType<typeof mountHost>
    await traversing(() => (wrapper = mountHost()))

    expect(step()).toBe(0)
    expect(backs.value).toBe(0)
    wrapper.unmount()
  })

  it('stops listening once unmounted', async () => {
    const wrapper = mountHost()
    depth.value = 1
    await flushPromises()
    wrapper.unmount()

    await traversing(() => history.back())

    expect(backs.value).toBe(0)
  })

  it('keeps pushing after a rewind that had nowhere to go', async () => {
    // A leftover claiming more entries below than exist: go(-n) is a no-op and
    // fires no popstate, so nothing would otherwise clear `rewinding`.
    history.replaceState({ position: 7, current: '/log', rationStep: 99 }, '')
    const wrapper = mountHost()

    // Longer than the fallback that stands in for the popstate that never comes.
    // Not a race: the fallback's timer was set first, so it fires first.
    await new Promise((resolve) => setTimeout(resolve, 250))
    depth.value = 1
    await vi.waitFor(() => expect(step()).toBe(1))

    wrapper.unmount()
  })

  it('calls onBack once per entry a single popstate consumed', async () => {
    const wrapper = mountHost()
    depth.value = 2
    await flushPromises()

    await traversing(() => history.go(-2))

    expect(depth.value).toBe(0)
    expect(backs.value).toBe(2)
    wrapper.unmount()
  })
})
