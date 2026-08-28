// Before db.ts constructs its Dexie instance.
import 'fake-indexeddb/auto'

import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { NUTRIENTS } from '../../data/nutrients'
import { db } from '../../db'
import { useConfigStore } from '../config'

beforeEach(async () => {
  await db.nutrientGoals.clear()
  setActivePinia(createPinia())
})

describe('config store', () => {
  it('tracks every nutrient in the registry', () => {
    const store = useConfigStore()

    expect(store.trackedNutrients).toEqual(Object.keys(NUTRIENTS))
  })

  it('offers goals for energy and the macros only', () => {
    const store = useConfigStore()

    expect(store.goalNutrients).toEqual(['energy', 'protein', 'carbohydrate', 'fat'])
    // A micronutrient target is a toxicity question, not a diet one (§20).
    expect(store.goalNutrients).not.toContain('vitaminD')
  })

  it('has no targets before anything is configured', async () => {
    const store = useConfigStore()

    await vi.waitFor(() => expect(store.loading).toBe(false))
    // Empty while the reference table waits on #16 — not a set of zeroes.
    expect(store.targets).toEqual({})
  })

  it('picks up a goal it saved, attributed to the user', async () => {
    const store = useConfigStore()
    await store.setGoal('energy', 2200)

    // liveQuery pushes asynchronously, so wait for the subscription rather than
    // refetching by hand.
    await vi.waitFor(() => expect(store.targets.energy?.target).toBe(2200))
    expect(store.targets.energy?.origin).toBe('user')
  })

  it('replaces a goal rather than accumulating rows', async () => {
    const store = useConfigStore()
    await store.setGoal('protein', 120)
    await vi.waitFor(() => expect(store.targets.protein?.target).toBe(120))

    await store.setGoal('protein', 140)

    await vi.waitFor(() => expect(store.targets.protein?.target).toBe(140))
    expect(store.goals).toHaveLength(1)
  })

  it('drops the target when a goal is cleared', async () => {
    const store = useConfigStore()
    await store.setGoal('fat', 70)
    await vi.waitFor(() => expect(store.targets.fat?.target).toBe(70))

    await store.clearGoal('fat')

    // Falls back to the reference table, which is empty, so no target at all.
    await vi.waitFor(() => expect(store.targets.fat).toBeUndefined())
  })

  it('refuses a target of zero or below', async () => {
    const store = useConfigStore()

    await expect(store.setGoal('energy', 0)).rejects.toThrow(RangeError)
    await expect(store.setGoal('energy', -100)).rejects.toThrow(RangeError)
  })

  it('refuses a target that is not a usable number', async () => {
    const store = useConfigStore()

    await expect(store.setGoal('energy', Number.NaN)).rejects.toThrow(RangeError)
    await expect(store.setGoal('energy', Number.POSITIVE_INFINITY)).rejects.toThrow(RangeError)
  })
})
