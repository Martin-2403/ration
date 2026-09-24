<script setup lang="ts">
import { onMounted, ref } from 'vue'

import { useMeal } from '../composables/useMeal'
import { formatAmount } from '../nutrient-display'
import { useLogStore } from '../stores/log'
import type { MealTemplate } from '../types'

const { template, eatenAt } = defineProps<{
  template: MealTemplate
  /** When the meal was eaten. Defaults to now, and is not always now (§7, #61). */
  eatenAt?: number
}>()
// Announced rather than assumed: whoever opened the builder decides what a
// successful log means for the surface around it (#53).
const emit = defineEmits<{
  logged: []
  /**
   * Whether a write is in flight. DayRunner needs this to hold its own
   * "Skip this meal" disabled for the duration — otherwise a skip fired
   * while this meal's write was still pending advanced the runner before
   * `logged` arrived, and an emit from an instance the runner has already
   * keyed away is simply never delivered: the entry lands, but nothing
   * counts it (#108).
   */
  busy: [value: boolean]
}>()

const store = useLogStore()
const draft = useMeal(template)

/**
 * True while the write is in flight.
 *
 * The button stayed live across the await, so two taps wrote the meal twice —
 * and a duplicate entry doubles the day's intake, which §9 then reads as
 * measured. Nothing in the log would say it happened twice by accident: two
 * portions is a thing people eat (#106).
 */
const logging = ref(false)

onMounted(draft.load)

async function logMeal() {
  if (logging.value) return

  logging.value = true
  emit('busy', true)

  try {
    await store.logMeal(draft.toEntry(eatenAt))
    draft.reset()
    emit('logged')
  } finally {
    logging.value = false
    emit('busy', false)
  }
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
      <button type="button" :disabled="!draft.canLog.value || logging" @click="logMeal">
        Log meal
      </button>
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

/* Grid items are min-width: auto by default, so the food name set the column's
   floor and the row could not shrink below the sum of its four tracks (#102). */
select,
.fixed {
  min-width: 0;
}

.fixed {
  overflow-wrap: anywhere;
}

/* The four tracks need about 452px between them once the gaps are counted, and
   the card and page padding add 80 — so the row is only honest above ~34rem.
   Below that it folds into two: the slot's energy beside its label, then the
   food and the amount it applies to on the row under them. Food before amount
   keeps the two controls side by side in the order they are focused — the
   other way round reads as well but sends the tab stop from the second row
   back up to the first. The breakpoint is higher than the 30rem the nav uses
   because it is measured against this row, not guessed; at 500px the liquid
   select rendered "Oat drink, fo…". This is a PWA first (§2), so the phone
   layout is the one that has to read (#102). */
@media (max-width: 34rem) {
  .slot {
    grid-template-columns: 1fr auto;
    grid-template-areas:
      'label kcal'
      'food grams';
    row-gap: var(--space-2);
  }

  label {
    grid-area: label;
  }

  select,
  .fixed {
    grid-area: food;
  }

  .grams {
    grid-area: grams;
    justify-self: end;
  }

  .kcal {
    grid-area: kcal;
  }
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
