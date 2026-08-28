// Before anything that touches db.ts: findFood falls back to the store, and
// jsdom has no IndexedDB.
import 'fake-indexeddb/auto'

import { beforeEach, describe, expect, it } from 'vitest'

import { SEED_TEMPLATES } from '../../data/foods'
import { db, foods } from '../../db'
import { useMeal } from '../useMeal'

const porridge = SEED_TEMPLATES.find((t) => t.id === 'porridge')!

beforeEach(async () => {
  await db.foods.clear()
})

describe('useMeal', () => {
  it('starts from the template defaults', () => {
    const draft = useMeal(porridge)

    expect(draft.slots.value.map((s) => s.foodId)).toEqual(['oats', 'milk', 'banana'])
    // Strings, because the field is a text input and the draft holds what was
    // typed rather than what a number input decided it meant.
    expect(draft.slots.value.map((s) => s.gramsInput)).toEqual(['50', '200', '80'])
  })

  it('reports no totals until the foods are loaded', () => {
    const draft = useMeal(porridge)

    // Empty rather than "everything missing": nothing is known yet, and a
    // missing-data claim before loading would be false (§3).
    expect(draft.ready.value).toBe(false)
    expect(draft.totals.value).toEqual({})
  })

  it('sums the default slots once loaded', async () => {
    const draft = useMeal(porridge)
    await draft.load()

    // oats 370/100g at 50g = 185; milk 65 at 200g = 130; banana 90 at 80g = 72.
    expect(draft.totals.value.energy?.amount).toBeCloseTo(387, 6)
  })

  it('recomputes when grams change', async () => {
    const draft = useMeal(porridge)
    await draft.load()
    const before = draft.totals.value.energy!.amount

    draft.slots.value[0]!.gramsInput = '100'

    expect(draft.totals.value.energy!.amount).toBeCloseTo(before + 185, 6)
  })

  it('recomputes when a variable slot switches option', async () => {
    const draft = useMeal(porridge)
    await draft.load()
    const withMilk = draft.totals.value.energy!.amount

    draft.slots.value[1]!.foodId = 'plant-drink-fortified'

    // 45/100g at 200g = 90, replacing milk's 130.
    expect(draft.totals.value.energy!.amount).toBeCloseTo(withMilk - 40, 6)
  })

  it('picks up a vitamin D value only from the fortified option', async () => {
    const draft = useMeal(porridge)
    await draft.load()

    // Every default has vitaminD as unknown, so it is present but empty.
    expect(draft.totals.value.vitaminD?.amount).toBe(0)
    expect(draft.totals.value.vitaminD?.missing).toBe(3)

    draft.slots.value[1]!.foodId = 'plant-drink-fortified'

    expect(draft.totals.value.vitaminD?.amount).toBeCloseTo(3, 6) // 1.5 at 200g
    expect(draft.totals.value.vitaminD?.missing).toBe(2)
  })

  it('resolves a food from the store, not just from seeds', async () => {
    await foods.put({
      id: 'stored-jam',
      name: 'Jam',
      per100g: { energy: { value: 250, source: 'off-packaging' } },
    })

    const draft = useMeal({
      id: 'toast',
      name: 'Toast',
      slots: [
        {
          id: 'spread',
          label: 'Spread',
          kind: 'fixed',
          options: ['stored-jam'],
          defaultOptionId: 'stored-jam',
          defaultGrams: 20,
        },
      ],
    })
    await draft.load()

    expect(draft.totals.value.energy?.amount).toBeCloseTo(50, 6)
    expect(draft.totals.value.energy?.bySource).toEqual({ 'off-packaging': 50 })
  })

  it('contributes nothing for a food that does not exist', async () => {
    const draft = useMeal({
      id: 'ghost',
      name: 'Ghost',
      slots: [
        {
          id: 'missing',
          label: 'Missing',
          kind: 'fixed',
          options: ['nope'],
          defaultOptionId: 'nope',
          defaultGrams: 10,
        },
      ],
    })

    await expect(draft.load()).resolves.toBeUndefined()
    expect(draft.totals.value).toEqual({})
  })

  it('builds log items that keep the slot they came from', async () => {
    const draft = useMeal(porridge)
    await draft.load()

    expect(draft.items.value).toEqual([
      { kind: 'food', slotId: 'base', foodId: 'oats', grams: 50 },
      { kind: 'food', slotId: 'liquid', foodId: 'milk', grams: 200 },
      { kind: 'food', slotId: 'fruit', foodId: 'banana', grams: 80 },
    ])
  })

  it('snapshots totals into the entry it produces', async () => {
    const draft = useMeal(porridge)
    await draft.load()

    const entry = draft.toEntry(1234)

    expect(entry.templateId).toBe('porridge')
    expect(entry.timestamp).toBe(1234)
    expect(entry.totals.energy?.amount).toBeCloseTo(387, 6)
  })

  it('reads a decimal comma as a decimal separator', async () => {
    const draft = useMeal(porridge)
    await draft.load()

    // German uses the comma (§14). A number input reported this as the empty
    // string, so the slot silently contributed nothing.
    draft.slots.value[0]!.gramsInput = '12,5'

    // oats 370/100g at 12.5g = 46.25, replacing 185.
    expect(draft.totals.value.energy?.amount).toBeCloseTo(387 - 185 + 46.25, 6)
    expect(draft.items.value?.[0]).toMatchObject({ grams: 12.5 })
    expect(draft.canLog.value).toBe(true)
  })

  it('refuses to log a slot whose amount is not a number', async () => {
    const draft = useMeal(porridge)
    await draft.load()
    draft.slots.value[1]!.gramsInput = '200g'

    expect(draft.canLog.value).toBe(false)
    expect(draft.unusable.value).toEqual(['Liquid'])
    // No items at all rather than the slot silently becoming a zero (§3).
    expect(draft.items.value).toBeUndefined()
    expect(() => draft.toEntry()).toThrow()
  })

  it.each([
    ['blank', ''],
    ['zero', '0'],
    ['negative', '-50'],
  ])('refuses to log a %s amount', async (_case, typed) => {
    const draft = useMeal(porridge)
    await draft.load()
    draft.slots.value[0]!.gramsInput = typed

    // An amount eaten has no meaningful blank and no meaningful zero: a slot
    // contributing nothing should be left off the template, not logged as none.
    expect(draft.canLog.value).toBe(false)
    expect(draft.unusable.value).toEqual(['Base'])
  })

  it('cannot be logged before the foods have resolved', () => {
    const draft = useMeal(porridge)

    // The amounts are all fine — it is the lookup that has not happened, and
    // logging now would snapshot empty totals as though nothing were known.
    expect(draft.unusable.value).toEqual([])
    expect(draft.canLog.value).toBe(false)
  })

  it('returns to the template defaults on reset', async () => {
    const draft = useMeal(porridge)
    await draft.load()
    draft.slots.value[0]!.gramsInput = '999'
    draft.slots.value[2]!.foodId = 'blueberries'

    draft.reset()

    expect(draft.slots.value.map((s) => s.gramsInput)).toEqual(['50', '200', '80'])
    expect(draft.slots.value.map((s) => s.foodId)).toEqual(['oats', 'milk', 'banana'])
  })
})
