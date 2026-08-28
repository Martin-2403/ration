<script setup lang="ts">
import { computed, ref } from 'vue'

import { NUTRIENTS, type NutrientKey } from '../data/nutrients'
import { labelFor, unitFor } from '../nutrient-display'
import type { Food } from '../types'
import { buildUserFood } from '../user-food'

const emit = defineEmits<{ submit: [food: Food, grams: number] }>()

const keys = Object.keys(NUTRIENTS) as NutrientKey[]

/**
 * What a number input can actually hold. `v-model.number` leaves the raw string
 * in place when it will not parse, and a `type="number"` field reports both a
 * cleared field and unparseable content as `''` — so the model is wider than
 * `number` whether we like it or not, and typing it honestly is what lets the
 * checks below tell blank apart from invalid.
 */
type FieldValue = number | '' | null | undefined

const name = ref('')
const grams = ref<FieldValue>(null)
const values = ref<Partial<Record<NutrientKey, FieldValue>>>({})

const isBlank = (value: FieldValue) => value === '' || value === null || value === undefined

const isUsableAmount = (value: FieldValue) =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0

/**
 * Fields holding text a number input cannot parse.
 *
 * Needed because the model alone cannot tell blank from invalid: Chrome keeps
 * "abc" visible in a number field while reporting `value` as `''`. Treating that
 * as blank would silently record "no data" for a field the user can see content
 * in. `validity.badInput` is the only thing that distinguishes the two.
 */
const badFields = ref(new Set<string>())

const formEl = ref<HTMLFormElement | null>(null)

function trackValidity(field: string, event: Event) {
  const input = event.target as HTMLInputElement
  const next = new Set(badFields.value)

  if (input.validity.badInput) next.add(field)
  else next.delete(field)

  badFields.value = next
}

/**
 * Re-reads every number field straight from the DOM.
 *
 * Tracking on `input` alone is not enough: a keystroke that leaves the parsed
 * value unchanged — `''` before and `''` after — may not fire `input` at all,
 * while still leaving the typed character visible in the field. The tracking
 * then never runs and the form looks submittable with garbage on screen.
 *
 * So this also runs on blur, and again before submitting, where it is the last
 * line of defence rather than an optimisation.
 */
function refreshValidity(): boolean {
  const inputs = formEl.value?.querySelectorAll<HTMLInputElement>('input[type="number"]') ?? []
  const next = new Set<string>()

  for (const input of inputs) {
    if (input.validity.badInput) next.add(input.id.replace(/^food-/, ''))
  }

  badFields.value = next

  return next.size === 0
}

const canSubmit = computed(() => {
  if (badFields.value.size > 0) return false
  if (name.value.trim().length === 0) return false

  // Grams must be a real positive number: it is what everything gets scaled by.
  if (!isUsableAmount(grams.value) || grams.value === 0) return false

  // Nutrient fields are optional, so blank passes — that is the documented way
  // to say "no data". Anything present must be a usable number.
  return Object.values(values.value).every((value) => isBlank(value) || isUsableAmount(value))
})

const hasNegative = computed(() =>
  [grams.value, ...Object.values(values.value)].some(
    (value) => typeof value === 'number' && value < 0,
  ),
)

function submit() {
  // Read the DOM before trusting the model: a field can hold unparseable text
  // that never reached us through an event.
  if (!refreshValidity()) return
  if (!canSubmit.value) return

  // Drop blanks rather than passing '' through: buildUserFood records an absent
  // key as unknown, which is what a blank field means.
  const per100g: Partial<Record<NutrientKey, number>> = {}
  for (const key of keys) {
    const value = values.value[key]
    if (typeof value === 'number') per100g[key] = value
  }

  emit('submit', buildUserFood({ name: name.value, per100g }), grams.value as number)

  name.value = ''
  grams.value = null
  values.value = {}
  badFields.value = new Set()
}
</script>

<template>
  <details class="card">
    <summary>Add a food by hand</summary>

    <!--
      novalidate on purpose. The browser's own constraint validation is a second,
      invisible gate: it can refuse to submit while the button still looks
      enabled, which is how a `step` attribute silently blocked every amount that
      was not a multiple of it. This component does its own validation and states
      its own reasons, so an enabled button must always mean the submit runs.
    -->
    <form ref="formEl" novalidate @submit.prevent="submit">
      <!-- Saying this explicitly matters: a blank field becoming a zero is the
           mistake §3 exists to prevent, and the user is the one supplying the
           gap here. -->
      <p class="hint">
        Values are per 100 g. Leave a field blank if you do not know it — blank is recorded as no
        data, never as zero.
      </p>

      <div class="row">
        <label for="food-name">Name</label>
        <input id="food-name" v-model="name" type="text" autocomplete="off" />
      </div>

      <div class="row">
        <label for="food-grams">Eaten</label>
        <span class="amount">
          <input
            id="food-grams"
            v-model.number="grams"
            type="number"
            min="0"
            step="any"
            @input="trackValidity('grams', $event)"
            @blur="trackValidity('grams', $event)"
          />
          g
        </span>
      </div>

      <div v-for="key in keys" :key="key" class="row">
        <label :for="`food-${key}`">{{ labelFor(key) }}</label>
        <span class="amount">
          <input
            :id="`food-${key}`"
            v-model.number="values[key]"
            type="number"
            min="0"
            step="any"
            :aria-invalid="badFields.has(key) || undefined"
            @input="trackValidity(key, $event)"
            @blur="trackValidity(key, $event)"
          />
          {{ unitFor(key) }} / 100 g
        </span>
      </div>

      <div class="footer">
        <!-- A disabled button with no stated reason is its own bug. -->
        <p v-if="badFields.size > 0" class="problem" role="status">
          {{ badFields.size === 1 ? 'A value is' : 'Some values are' }} not a number
        </p>
        <p v-else-if="hasNegative" class="problem" role="status">Values cannot be negative</p>

        <button type="submit" :disabled="!canSubmit">Save and log</button>
      </div>
    </form>
  </details>
</template>

<style scoped>
.card {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius-card);
  padding: var(--space-5);
}

summary {
  cursor: pointer;
  font-size: var(--text-section);
  font-weight: var(--weight-medium);
}

.hint {
  margin: var(--space-4) 0 0;
  font-size: var(--text-caption);
  color: var(--ink-soft);
}

.row {
  display: grid;
  grid-template-columns: 8rem 1fr;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3) 0;
  border-top: 1px solid var(--line);
}

.row:first-of-type {
  margin-top: var(--space-4);
}

label {
  color: var(--ink-soft);
  font-size: var(--text-caption);
  letter-spacing: var(--tracking-eyebrow);
  text-transform: uppercase;
}

input {
  font: inherit;
  color: var(--ink);
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius-control);
  padding: var(--space-2) var(--space-3);
  transition: border-color var(--motion-fast) var(--ease-out);
}

input:hover {
  border-color: var(--ink-soft);
}

input[type='number'] {
  width: 6rem;
  text-align: right;
  font-feature-settings: var(--figures-tabular);
}

input[type='text'] {
  width: 100%;
}

.amount {
  color: var(--ink-soft);
  font-size: var(--text-caption);
}

.footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--space-4);
  padding-top: var(--space-4);
  border-top: 1px solid var(--line);
}

/* Paired with text, never colour alone (§15). */
.problem {
  margin: 0;
  font-size: var(--text-caption);
  color: var(--status-under);
}

input[aria-invalid='true'] {
  border-color: var(--status-under);
}

button {
  font: inherit;
  font-weight: var(--weight-medium);
  color: var(--surface);
  background: var(--primary);
  border: none;
  border-radius: var(--radius-pill);
  padding: var(--space-2) var(--space-5);
  cursor: pointer;
  transition: background var(--motion-fast) var(--ease-out);
}

button:hover:not(:disabled) {
  background: var(--primary-strong);
}

button:disabled {
  opacity: 0.5;
  cursor: default;
}
</style>
