<script setup lang="ts">
/**
 * The one place anything is logged from (#53, #62).
 *
 * A route rather than the overlay it started as: an overlay needed a focus
 * trap, Escape handling and an inert page behind it, all hand-rolled because
 * jsdom implements no <dialog>. A route needs none of that.
 *
 * The date is explicit here. It used to be inferred from whichever day the
 * summary screen happened to be showing, which meant viewing the 27th and
 * logging wrote the entry against today without saying so (#61).
 */
import { computed, ref } from 'vue'

import FoodForm from '../components/FoodForm.vue'
import MealBuilder from '../components/MealBuilder.vue'
import { SEED_TEMPLATES } from '../data/foods'
import { localMiddayFromISODate, toISODate } from '../dates'
import { useLogStore } from '../stores/log'
import type { Food, MealTemplate } from '../types'

const store = useLogStore()

/**
 * Defaults to today on every visit rather than remembering the last pick. A
 * remembered date is the same trap as #61 from the other direction: come back an
 * hour later, log lunch, and it lands silently on a day chosen long ago.
 */
const date = ref(toISODate())

/** Future dates are refused: an entry that has not happened is a plan, not intake. */
const today = toISODate()

const choice = ref<{ kind: 'template'; template: MealTemplate } | { kind: 'food' } | undefined>()
const logged = ref<{ name: string; date: string } | undefined>()

const validDate = computed(() => localMiddayFromISODate(date.value) !== undefined)

/**
 * The timestamp to record, or undefined for today.
 *
 * Undefined is not a gap: every logging path already defaults to the moment of
 * the write, which is exactly right for today and keeps the day's log reading as
 * a timeline. Handing down a "now" computed here instead would freeze the time
 * the screen opened, so a meal logged ten minutes later would carry the wrong
 * one. Any other day lands at midday, where a time of day would mean nothing.
 */
const backdatedTo = computed(() =>
  date.value === today ? undefined : localMiddayFromISODate(date.value),
)

function finish(name: string) {
  logged.value = { name, date: date.value }
  choice.value = undefined
}

async function logFood(food: Food, grams: number) {
  if (!validDate.value) return

  // Same reasoning as backdatedTo: today falls through to the store's own
  // default, which stamps the write time rather than a stale one.
  await store.logFood(food, grams, backdatedTo.value ?? Date.now())
  finish(food.name)
}
</script>

<template>
  <div class="page">
    <h1>Log</h1>

    <section class="card">
      <div class="row">
        <label for="log-date">Eaten on</label>
        <input id="log-date" v-model="date" type="date" :max="today" />
      </div>

      <p v-if="!validDate" class="problem" role="status">Pick a date before logging.</p>
      <p v-else-if="date !== today" class="note">Logging against {{ date }}, not today.</p>
    </section>

    <p v-if="logged" class="confirmation" role="status">
      Logged {{ logged.name }} on {{ logged.date }}.
      <RouterLink to="/">See the day</RouterLink>
    </p>

    <template v-if="validDate">
      <!-- One home for everything that adds to a day, so a picker (#40), a
           clone (#51) and a barcode scan (#15) each become an entry here
           rather than another block on the summary screen. -->
      <ul v-if="!choice" class="options">
        <li v-for="template in SEED_TEMPLATES" :key="template.id">
          <button type="button" @click="choice = { kind: 'template', template }">
            {{ template.name }}
            <span class="detail">Meal template</span>
          </button>
        </li>
        <li>
          <button type="button" @click="choice = { kind: 'food' }">
            A food by hand
            <span class="detail">Type in the values yourself</span>
          </button>
        </li>
      </ul>

      <template v-else>
        <button type="button" class="back" @click="choice = undefined">← Everything else</button>

        <MealBuilder
          v-if="choice.kind === 'template'"
          :template="choice.template"
          :eaten-at="backdatedTo"
          @logged="finish(choice.kind === 'template' ? choice.template.name : '')"
        />

        <FoodForm v-else @submit="logFood" />
      </template>
    </template>
  </div>
</template>

<style scoped>
.page {
  display: grid;
  gap: var(--space-5);
  max-width: 40rem;
  margin: 0 auto;
  padding: var(--space-5) var(--space-4) var(--space-7);
}

h1 {
  margin: 0;
  font-size: var(--text-section);
  font-weight: var(--weight-medium);
}

.card {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius-card);
  padding: var(--space-5);
}

.row {
  display: flex;
  align-items: center;
  gap: var(--space-3);
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
  font-feature-settings: var(--figures-tabular);
  transition: border-color var(--motion-fast) var(--ease-out);
}

input:hover {
  border-color: var(--ink-soft);
}

.options {
  display: grid;
  gap: var(--space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.options button {
  display: grid;
  gap: var(--space-1);
  width: 100%;
  font: inherit;
  text-align: left;
  color: var(--ink);
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius-control);
  padding: var(--space-4);
  cursor: pointer;
  transition: border-color var(--motion-fast) var(--ease-out);
}

.options button:hover {
  border-color: var(--primary);
}

.detail {
  font-size: var(--text-caption);
  color: var(--ink-soft);
}

.back {
  font: inherit;
  justify-self: start;
  font-size: var(--text-caption);
  color: var(--ink-soft);
  background: none;
  border: 1px solid var(--line);
  border-radius: var(--radius-pill);
  padding: var(--space-1) var(--space-3);
  cursor: pointer;
}

.back:hover {
  color: var(--ink);
  border-color: var(--ink-soft);
}

/* Paired with text, never colour alone (§15). */
.problem {
  margin: var(--space-3) 0 0;
  font-size: var(--text-caption);
  color: var(--status-under);
}

.note {
  margin: var(--space-3) 0 0;
  font-size: var(--text-caption);
  color: var(--ink-soft);
}

.confirmation {
  margin: 0;
  font-size: var(--text-caption);
  color: var(--ink-soft);
}

.confirmation a {
  color: var(--primary);
}
</style>
