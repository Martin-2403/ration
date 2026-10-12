<script setup lang="ts">
/**
 * Choosing one food and its usual amount, for a day that names a food rather
 * than a meal (#120).
 *
 * Two steps in one card: the same FoodPicker in `choose` mode every other
 * food-picking surface uses, then the amount — the question MealTemplateForm
 * asks per slot. It only reports the pair; wrapping it in a meal and deciding
 * when that is stored belongs to the day form.
 */
import { computed, ref } from 'vue'

import { parseAmount } from '../parse-amount'
import type { Food } from '../types'
import FoodPicker from './FoodPicker.vue'

const emit = defineEmits<{
  add: [food: Food, grams: number]
  back: []
}>()

const food = ref<Food | undefined>(undefined)
/** Typed, not a number: the field is text and we parse it (see parse-amount.ts). */
const gramsInput = ref('100')

const amount = computed(() => parseAmount(gramsInput.value))
/** Zero parses as a number but is not an amount of food, so it is refused here. */
const grams = computed(() =>
  amount.value.kind === 'number' && amount.value.value > 0 ? amount.value.value : undefined,
)

function add() {
  if (food.value && grams.value !== undefined) emit('add', food.value, grams.value)
}
</script>

<template>
  <section class="card">
    <button type="button" class="back" @click="emit('back')">← Back to the day</button>

    <FoodPicker v-if="!food" purpose="choose" @select="food = $event" />

    <template v-else>
      <p class="hint">How much {{ food.name }} does this day usually have?</p>

      <div class="row">
        <label for="single-grams">Usually</label>
        <span class="amount">
          <input
            id="single-grams"
            v-model="gramsInput"
            type="text"
            inputmode="decimal"
            autocomplete="off"
            :aria-invalid="grams === undefined || undefined"
          />
          g
        </span>
      </div>

      <div class="footer">
        <p v-if="grams === undefined" class="problem" role="status">Give an amount above zero.</p>
        <button type="button" class="ghost" @click="food = undefined">Change food</button>
        <button type="button" :disabled="grams === undefined" @click="add">Add to the day</button>
      </div>
    </template>
  </section>
</template>

<style scoped>
.card {
  display: grid;
  gap: var(--space-4);
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius-card);
  padding: var(--space-5);
}

.hint,
.problem {
  margin: 0;
  font-size: var(--text-caption);
}

.hint {
  color: var(--ink-soft);
}

.problem {
  margin-right: auto;
  color: var(--status-under);
}

.row {
  display: grid;
  grid-template-columns: 5rem 1fr;
  align-items: center;
  gap: var(--space-3);
}

label {
  color: var(--ink-soft);
  font-size: var(--text-caption);
  letter-spacing: var(--tracking-eyebrow);
  text-transform: uppercase;
}

input[type='text'] {
  font: inherit;
  color: var(--ink);
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius-control);
  padding: var(--space-2) var(--space-3);
  min-width: 0;
}

input[aria-invalid='true'] {
  border-color: var(--status-under);
}

.amount {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  color: var(--ink-soft);
}

.amount input {
  width: 5rem;
  text-align: right;
  font-feature-settings: var(--figures-tabular);
}

.footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--space-3);
  flex-wrap: wrap;
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

.ghost {
  color: var(--ink-soft);
  background: none;
  border: 1px solid var(--line);
}

.ghost:hover:not(:disabled) {
  color: var(--ink);
  background: none;
  border-color: var(--ink-soft);
}

.back {
  justify-self: start;
  color: var(--ink-soft);
  background: none;
  border: none;
  padding: 0;
}

.back:hover:not(:disabled) {
  color: var(--ink);
  background: none;
}
</style>
