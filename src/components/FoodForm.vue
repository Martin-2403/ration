<script setup lang="ts">
import { computed, ref } from 'vue'

import { NUTRIENTS, type NutrientKey } from '../data/nutrients'
import { labelFor, unitFor } from '../nutrient-display'
import { parseAmount } from '../parse-amount'
import type { Food } from '../types'
import { buildUserFood } from '../user-food'

const emit = defineEmits<{ submit: [food: Food, grams: number] }>()

const keys = Object.keys(NUTRIENTS) as NutrientKey[]

// Raw strings, because the fields are text inputs and we do the parsing (see
// parse-amount.ts for why a number input is not used here).
const name = ref('')
const grams = ref('')
const values = ref<Record<string, string>>({})

const parsedGrams = computed(() => parseAmount(grams.value))

const parsedValues = computed(() =>
  keys.map((key) => ({ key, parsed: parseAmount(values.value[key] ?? '') })),
)

/** Fields holding something that is not a number at all. */
const notNumeric = computed(() => {
  const bad = parsedValues.value
    .filter((entry) => entry.parsed.kind === 'not-a-number')
    .map((entry) => labelFor(entry.key))

  if (parsedGrams.value.kind === 'not-a-number') bad.unshift('Eaten')

  return bad
})

const negative = computed(() => {
  const bad = parsedValues.value
    .filter((entry) => entry.parsed.kind === 'number' && entry.parsed.value < 0)
    .map((entry) => labelFor(entry.key))

  if (parsedGrams.value.kind === 'number' && parsedGrams.value.value < 0) bad.unshift('Eaten')

  return bad
})

const isBad = (key: NutrientKey) => {
  const parsed = parseAmount(values.value[key] ?? '')

  return parsed.kind === 'not-a-number' || (parsed.kind === 'number' && parsed.value < 0)
}

const canSubmit = computed(() => {
  if (name.value.trim().length === 0) return false
  if (notNumeric.value.length > 0 || negative.value.length > 0) return false

  // An amount eaten has no meaningful blank: it is what everything is scaled by.
  return parsedGrams.value.kind === 'number' && parsedGrams.value.value > 0
})

function submit() {
  if (!canSubmit.value) return

  // Only fields that parsed to a number are passed on. A blank becomes an absent
  // key, which buildUserFood records as unknown — never as zero (§3).
  const per100g: Partial<Record<NutrientKey, number>> = {}
  for (const { key, parsed } of parsedValues.value) {
    if (parsed.kind === 'number') per100g[key] = parsed.value
  }

  const amount = parsedGrams.value
  if (amount.kind !== 'number') return

  emit('submit', buildUserFood({ name: name.value, per100g }), amount.value)

  name.value = ''
  grams.value = ''
  values.value = {}
}
</script>

<template>
  <div class="card">
    <form novalidate @submit.prevent="submit">
      <!-- Saying this explicitly matters: a blank field becoming a zero is the
           mistake §3 exists to prevent, and the user is the one supplying the
           gap here. -->
      <p class="hint">
        Values are per 100 g. Leave a field blank if you do not know it — blank is recorded as no
        data, never as zero. A comma or a dot both work as the decimal separator.
      </p>

      <div class="row">
        <label for="food-name">Name</label>
        <input id="food-name" v-model="name" type="text" autocomplete="off" />
      </div>

      <div class="row">
        <label for="food-grams">Eaten</label>
        <span class="amount">
          <!-- text, not number: see parse-amount.ts. inputmode keeps the numeric
               keypad on a phone. -->
          <input
            id="food-grams"
            v-model="grams"
            type="text"
            inputmode="decimal"
            autocomplete="off"
            :aria-invalid="parsedGrams.kind === 'not-a-number' || undefined"
          />
          g
        </span>
      </div>

      <div v-for="key in keys" :key="key" class="row">
        <label :for="`food-${key}`">{{ labelFor(key) }}</label>
        <span class="amount">
          <input
            :id="`food-${key}`"
            v-model="values[key]"
            type="text"
            inputmode="decimal"
            autocomplete="off"
            :aria-invalid="isBad(key) || undefined"
          />
          {{ unitFor(key) }} / 100 g
        </span>
      </div>

      <div class="footer">
        <!-- A blocked submit always names what is wrong and where. -->
        <p v-if="notNumeric.length > 0" class="problem" role="status">
          Not a number: {{ notNumeric.join(', ') }}
        </p>
        <p v-else-if="negative.length > 0" class="problem" role="status">
          Cannot be negative: {{ negative.join(', ') }}
        </p>

        <button type="submit" :disabled="!canSubmit">Save and log</button>
      </div>
    </form>
  </div>
</template>

<style scoped>
.card {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius-card);
  padding: var(--space-5);
}

.hint {
  margin: 0;
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
