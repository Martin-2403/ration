<script setup lang="ts">
import { computed, ref } from 'vue'

import { NUTRIENTS, type NutrientKey } from '../data/nutrients'
import { labelFor, unitFor } from '../nutrient-display'
import type { Food } from '../types'
import { buildUserFood } from '../user-food'

const emit = defineEmits<{ submit: [food: Food, grams: number] }>()

const keys = Object.keys(NUTRIENTS) as NutrientKey[]

const name = ref('')
const grams = ref<number | null>(null)
const values = ref<Partial<Record<NutrientKey, number>>>({})

const canSubmit = computed(
  () => name.value.trim().length > 0 && grams.value !== null && grams.value > 0,
)

function submit() {
  if (!canSubmit.value) return

  emit('submit', buildUserFood({ name: name.value, per100g: values.value }), grams.value!)

  name.value = ''
  grams.value = null
  values.value = {}
}
</script>

<template>
  <details class="card">
    <summary>Add a food by hand</summary>

    <form @submit.prevent="submit">
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
          <input id="food-grams" v-model.number="grams" type="number" min="0" step="5" />
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
          />
          {{ unitFor(key) }} / 100 g
        </span>
      </div>

      <div class="footer">
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
  justify-content: flex-end;
  padding-top: var(--space-4);
  border-top: 1px solid var(--line);
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
