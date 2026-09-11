<script setup lang="ts">
/**
 * Logging a food that already exists (§13, #40).
 *
 * A hand-entered food used to be unreachable the moment it was saved, so the
 * only way to log the same apple twice was to type it twice — and the cache
 * filled with near-duplicates. #40 settled that the fix is finding the first
 * one easily rather than merging the copies afterwards: merging would rewrite
 * food ids that logged entries reference, and §9 is deliberately strict about
 * never rewriting history.
 *
 * Emits the same `submit` contract as FoodForm, so the view that owns the date
 * does the logging and neither component needs to know about backdating (#61).
 */
import { computed, onMounted, ref, watch } from 'vue'

import { searchFoods, type FoodMatch } from '../food-lookup'
import { formatAmount } from '../nutrient-display'
import { parseAmount } from '../parse-amount'
import type { Food } from '../types'

const { purpose = 'log' } = defineProps<{
  /**
   * What choosing a food is for. `log` takes an amount and logs it; `choose`
   * hands the food back so the caller can do something else with it — cloning
   * or correcting it (#51), and later swapping the food in an existing entry.
   */
  purpose?: 'log' | 'choose'
}>()

const emit = defineEmits<{
  submit: [food: Food, grams: number]
  select: [food: Food]
}>()

const query = ref('')
const matches = ref<FoodMatch[]>([])
const searched = ref(false)
const chosen = ref<FoodMatch | undefined>()

// Text, not a number input, and 100 as the default because per-100g is the
// basis every stored value is on (see parse-amount.ts, §14).
const gramsInput = ref('100')

async function search() {
  matches.value = await searchFoods(query.value)
  searched.value = true
}

onMounted(search)
watch(query, search)

const amount = computed(() => parseAmount(gramsInput.value))

/** The amount if it is usable at all: a number, and more than nothing. */
const grams = computed(() =>
  amount.value.kind === 'number' && amount.value.value > 0 ? amount.value.value : undefined,
)

/**
 * Energy per 100 g, for telling two similarly named foods apart. Undefined
 * rather than 0 when nothing is known: a food with no energy figure is not a
 * food with no energy (§3).
 */
const energyPer100g = (food: Food) => {
  const value = food.per100g.energy

  return value && value.source !== 'unknown' ? formatAmount('energy', value.value) : undefined
}

/** What the chosen amount works out to, so the number is checked before logging. */
const chosenEnergy = computed(() => {
  const value = chosen.value?.food.per100g.energy

  if (!value || value.source === 'unknown' || grams.value === undefined) return undefined

  return formatAmount('energy', (value.value * grams.value) / 100)
})

function log() {
  if (chosen.value && grams.value !== undefined) emit('submit', chosen.value.food, grams.value)
}

function pick(match: FoodMatch) {
  // In `choose` mode the amount step never appears: the caller owns whatever
  // comes next, and asking for grams here would collect something nobody uses.
  if (purpose === 'choose') emit('select', match.food)
  else chosen.value = match
}
</script>

<template>
  <section class="card">
    <template v-if="!chosen">
      <div class="search">
        <label for="picker-query">Search</label>
        <input
          id="picker-query"
          v-model="query"
          type="search"
          autocomplete="off"
          placeholder="Name of a food"
        />
      </div>

      <!-- Announced rather than only drawn: typing changes the list underneath
           without moving focus, so a screen reader needs telling. -->
      <p class="count" role="status">
        {{ searched ? `${matches.length} food(s)` : 'Looking…' }}
      </p>

      <ul v-if="matches.length > 0" class="results">
        <li v-for="match in matches" :key="match.food.id">
          <button type="button" @click="pick(match)">
            <span class="name">{{ match.food.name }}</span>
            <span class="detail">
              <!-- Which of §13's two paths it came from. Not provenance per
                   value (§3) — that arrives with the resolver, and the seeds
                   tag their own values `user`, so nothing else separates
                   them today. -->
              {{ match.origin === 'seed' ? 'Built in' : 'Saved' }}
              <template v-if="energyPer100g(match.food)">
                · {{ energyPer100g(match.food) }} kcal / 100 g
              </template>
            </span>
          </button>
        </li>
      </ul>

      <p v-else-if="searched" class="empty">
        Nothing matches. Add it by hand and it will be here next time.
      </p>
    </template>

    <template v-else>
      <button type="button" class="back" @click="chosen = undefined">← Other foods</button>

      <p class="picked">{{ chosen.food.name }}</p>

      <div class="row">
        <label for="picker-grams">Eaten</label>
        <span class="field">
          <input
            id="picker-grams"
            v-model="gramsInput"
            type="text"
            inputmode="decimal"
            autocomplete="off"
            :aria-invalid="amount.kind === 'not-a-number' || undefined"
          />
          g
        </span>
      </div>

      <p v-if="grams === undefined" class="problem" role="status">
        Needs an amount before it can be logged.
      </p>
      <p v-else-if="chosenEnergy" class="note">That is {{ chosenEnergy }} kcal.</p>

      <button type="button" class="primary" :disabled="grams === undefined" @click="log">
        Log it
      </button>
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

.search,
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
  transition: border-color var(--motion-fast) var(--ease-out);
}

.search input {
  flex: 1;
  min-width: 0;
}

.row input {
  width: 5rem;
  text-align: right;
  font-feature-settings: var(--figures-tabular);
}

input:hover {
  border-color: var(--ink-soft);
}

/* Paired with the message below, never carrying it alone (§15). */
input[aria-invalid='true'] {
  border-color: var(--status-under);
}

.field {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  color: var(--ink-soft);
}

.count,
.note,
.empty {
  margin: 0;
  font-size: var(--text-caption);
  color: var(--ink-soft);
}

.results {
  display: grid;
  gap: var(--space-1);
  margin: 0;
  padding: 0;
  list-style: none;
}

.results button {
  display: grid;
  gap: var(--space-1);
  width: 100%;
  font: inherit;
  text-align: left;
  color: var(--ink);
  background: none;
  border: none;
  border-radius: var(--radius-control);
  padding: var(--space-3);
  cursor: pointer;
  transition: background var(--motion-fast) var(--ease-out);
}

.results button:hover {
  background: var(--primary-tint);
}

.name {
  font-weight: var(--weight-medium);
}

.detail {
  font-size: var(--text-caption);
  color: var(--ink-soft);
}

.back,
.primary {
  font: inherit;
  cursor: pointer;
}

.back {
  justify-self: start;
  color: var(--ink-soft);
  background: none;
  border: none;
  padding: 0;
}

.back:hover {
  color: var(--ink);
}

.picked {
  margin: 0;
  font-size: var(--text-section);
  font-weight: var(--weight-medium);
}

.problem {
  margin: 0;
  font-size: var(--text-caption);
  color: var(--status-under);
}

/* The most-used control on this surface, so it reads as the primary one (§15). */
.primary {
  justify-self: start;
  font-weight: var(--weight-medium);
  color: var(--surface);
  background: var(--primary);
  border: none;
  border-radius: var(--radius-pill);
  padding: var(--space-3) var(--space-5);
  transition: background var(--motion-fast) var(--ease-out);
}

.primary:hover:not(:disabled) {
  background: var(--primary-strong);
}

.primary:disabled {
  opacity: 0.5;
  cursor: default;
}
</style>
