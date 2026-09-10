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

  it('starts from the reference table, before anything is configured', async () => {
    const store = useConfigStore()

    await vi.waitFor(() => expect(store.loading).toBe(false))

    // Was empty while the reference figures waited on #16. Every target is
    // attributed to the reference rather than the user, which is what lets the
    // UI say on whose authority a comparison is being made (§3).
    expect(store.targets.energy).toEqual({
      nutrient: 'energy',
      target: 2000,
      origin: 'reference',
      upperLimit: undefined,
    })

    // Absent, not zero: the annex prints a figure for salt but no direction,
    // so it has no target until #17 supplies a limit.
    expect(store.targets.salt).toBeUndefined()
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

  it('falls back to the reference figure when a goal is cleared', async () => {
    const store = useConfigStore()
    await store.setGoal('fat', 120)
    await vi.waitFor(() => expect(store.targets.fat?.origin).toBe('user'))

    await store.clearGoal('fat')

    // The reference table used to be empty, so clearing a goal left no target.
    // It now reveals the annex figure again, and the origin has to come back
    // with it — a stale 'user' would credit the reference to the user.
    await vi.waitFor(() => expect(store.targets.fat?.origin).toBe('reference'))
    expect(store.targets.fat?.target).toBe(70)
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
