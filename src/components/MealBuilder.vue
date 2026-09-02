<script setup lang="ts">
import { onMounted } from 'vue'

import { useMeal } from '../composables/useMeal'
import { formatAmount } from '../nutrient-display'
import { useLogStore } from '../stores/log'
import type { MealTemplate } from '../types'

const { template } = defineProps<{ template: MealTemplate }>()
// Announced rather than assumed: whoever opened the builder decides what a
// successful log means for the surface around it (#53).
const emit = defineEmits<{ logged: [] }>()

const store = useLogStore()
const draft = useMeal(template)

onMounted(draft.load)

async function logMeal() {
  await store.logMeal(draft.toEntry())
  draft.reset()
  emit('logged')
}
</script>

<template>
  <!-- No heading of its own: whatever opens the builder names it, and the sheet
       uses that name as the panel's accessible label (#53). -->
  <section class="card">
    <div v-for="(slot, index) in draft.slots.value" :key="slot.slotId" class="slot">
      <label :for="`${template.id}-${slot.slotId}`">{{ slot.label }}</label>

      <!-- One option means fixed, so there is nothing to choose (§7). -->
      <select
        v-if="slot.options.length > 1"
        :id="`${template.id}-${slot.slotId}`"
        v-model="slot.foodId"
      >
        <option v-for="id in slot.options" :key="id" :value="id">
          {{ draft.foods.value.get(id)?.name ?? id }}
        </option>
      </select>
      <span v-else class="fixed">{{
        draft.foods.value.get(slot.foodId)?.name ?? slot.foodId
      }}</span>

      <span class="grams">
        <!-- text, not number: see parse-amount.ts. inputmode keeps the numeric
             keypad on a phone, and a decimal comma survives. -->
        <input
          v-model="slot.gramsInput"
          type="text"
          inputmode="decimal"
          autocomplete="off"
          :aria-label="`Grams of ${slot.label}`"
          :aria-invalid="draft.amounts.value[index]?.kind === 'not-a-number' || undefined"
        />
        g
      </span>

      <span class="kcal">
        {{
          draft.slotNutrients.value[index]?.energy
            ? `${formatAmount('energy', draft.slotNutrients.value[index]!.energy!.value)} kcal`
            : '—'
        }}
      </span>
    </div>

    <div class="footer">
      <!-- A blocked log always names the slots holding it up, rather than
           leaving a disabled button with no explanation. -->
      <p v-if="draft.ready.value && draft.unusable.value.length > 0" class="problem" role="status">
        Needs an amount: {{ draft.unusable.value.join(', ') }}
      </p>

      <span class="total">
        {{
          draft.totals.value.energy
            ? `${formatAmount('energy', draft.totals.value.energy.amount)} kcal`
            : '—'
        }}
      </span>
      <button type="button" :disabled="!draft.canLog.value" @click="logMeal">Log meal</button>
    </div>
  </section>
</template>

<style scoped>
.card {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius-card);
  padding: var(--space-5);
}

.slot {
  display: grid;
  grid-template-columns: 6rem 1fr auto auto;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3) 0;
  border-top: 1px solid var(--line);
}

label {
  color: var(--ink-soft);
  font-size: var(--text-caption);
  letter-spacing: var(--tracking-eyebrow);
  text-transform: uppercase;
}

select,
input {
  font: inherit;
  color: var(--ink);
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius-control);
  padding: var(--space-2) var(--space-3);
  transition: border-color var(--motion-fast) var(--ease-out);
}

select:hover,
input:hover {
  border-color: var(--ink-soft);
}

input {
  width: 4.5rem;
  text-align: right;
  font-feature-settings: var(--figures-tabular);
}

/* Supplements the message rather than replacing it — colour never carries the
   meaning on its own (§15). */
input[aria-invalid='true'] {
  border-color: var(--status-under);
}

.grams,
.kcal,
.total {
  color: var(--ink-soft);
  font-feature-settings: var(--figures-tabular);
}

.kcal,
.total {
  min-width: 5rem;
  text-align: right;
}

.total {
  color: var(--ink);
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
  margin: 0 auto 0 0;
  font-size: var(--text-caption);
  color: var(--status-under);
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
