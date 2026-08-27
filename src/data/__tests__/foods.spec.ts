/**
 * Invariants for the seed data. Not testing logic — guarding hand-written
 * fixtures against typos that would surface as a broken meal builder, and
 * against a seed quietly claiming a provenance it doesn't have.
 *
 * Table-driven throughout, so a failure names the offending food or slot rather
 * than stopping at the first one.
 */
import { describe, expect, it } from 'vitest'

import { SEED_FOODS, SEED_TEMPLATES, seedFood } from '../foods'

const foodIds = new Set(SEED_FOODS.map((f) => f.id))

const seedValues = SEED_FOODS.flatMap((food) =>
  Object.entries(food.per100g)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => ({ where: `${food.id}.${key}`, source: value!.source })),
)

const slots = SEED_TEMPLATES.flatMap((template) =>
  template.slots.map((slot) => ({ where: `${template.id}.${slot.id}`, slot })),
)

describe('seed foods', () => {
  it('has unique ids', () => {
    expect(foodIds.size).toBe(SEED_FOODS.length)
  })

  // Seed numbers were not looked up anywhere, so the only honest tags are 'user'
  // (someone typed it) and 'unknown' (no data at all). A seed tagged
  // 'off-packaging' would be a lie the trust hierarchy then acts on (§3).
  it.each(seedValues)('$where claims no provenance it does not have', ({ source }) => {
    expect(['user', 'unknown']).toContain(source)
  })

  it.each(SEED_FOODS)('$id has a non-empty name', (food) => {
    expect(food.name.trim()).not.toBe('')
  })

  it('looks a food up by id', () => {
    expect(seedFood('oats')?.name).toBe('Rolled oats')
  })

  it('returns undefined for an unknown id rather than throwing', () => {
    expect(seedFood('nope')).toBeUndefined()
  })
})

describe('seed templates', () => {
  it('has unique template ids', () => {
    const ids = new Set(SEED_TEMPLATES.map((t) => t.id))

    expect(ids.size).toBe(SEED_TEMPLATES.length)
  })

  it.each(SEED_TEMPLATES)('$id has unique slot ids', (template) => {
    const ids = new Set(template.slots.map((s) => s.id))

    expect(ids.size).toBe(template.slots.length)
  })

  it.each(slots)('$where references only foods that exist', ({ slot }) => {
    for (const optionId of slot.options) {
      expect(foodIds).toContain(optionId)
    }
  })

  it.each(slots)('$where defaults to one of its own options', ({ slot }) => {
    expect(slot.options).toContain(slot.defaultOptionId)
  })

  // §7: length 1 means fixed, more than 1 means a dropdown. A 'variable' slot
  // with one option renders a pointless dropdown; a 'fixed' slot with two
  // silently hides the second. So: fixed if and only if exactly one option.
  it.each(slots)('$where option count matches its kind', ({ slot }) => {
    expect(slot.options.length === 1).toBe(slot.kind === 'fixed')
  })

  it.each(slots)('$where prefills a positive gram amount', ({ slot }) => {
    expect(slot.defaultGrams).toBeGreaterThan(0)
  })
})
