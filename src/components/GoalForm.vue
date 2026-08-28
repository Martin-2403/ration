<script setup lang="ts">
import { ref, watch } from 'vue'

import type { GoalNutrientKey } from '../data/nutrients'
import { formatAmount, labelFor, unitFor } from '../nutrient-display'
import { parseAmount } from '../parse-amount'
import { useConfigStore } from '../stores/config'

const store = useConfigStore()

/** What the user has typed per nutrient. Raw strings (see parse-amount.ts). */
const inputs = ref<Partial<Record<GoalNutrientKey, string>>>({})

/**
 * Fields the user has edited. liveQuery pushes on every write, including this
 * component's own, so the seeding below has to leave a half-typed number alone —
 * a field that rewrites itself mid-edit is worse than one that lags.
 */
const touched = ref(new Set<GoalNutrientKey>())

watch(
  () => store.goals,
  (goals) => {
    for (const key of store.goalNutrients) {
      if (touched.value.has(key)) continue

      const stored = goals.find((goal) => goal.nutrient === key)
      inputs.value[key] = stored ? String(stored.target) : ''
    }
  },
  { immediate: true, deep: true },
)

const parsedFor = (key: GoalNutrientKey) => parseAmount(inputs.value[key] ?? '')

const canSave = (key: GoalNutrientKey) => {
  const parsed = parsedFor(key)

  return parsed.kind === 'number' && parsed.value > 0
}

/** Why a save is blocked, or undefined when nothing is wrong yet. */
const problemFor = (key: GoalNutrientKey) => {
  const parsed = parsedFor(key)

  if (parsed.kind === 'not-a-number') return 'Not a number'
  if (parsed.kind === 'number' && parsed.value <= 0) return 'Must be more than zero'

  return undefined
}

const hasGoal = (key: GoalNutrientKey) => store.goals.some((goal) => goal.nutrient === key)

async function save(key: GoalNutrientKey) {
  const parsed = parsedFor(key)
  if (parsed.kind !== 'number' || parsed.value <= 0) return

  await store.setGoal(key, parsed.value)
}

async function clear(key: GoalNutrientKey) {
  await store.clearGoal(key)
  inputs.value[key] = ''
}
</script>

<template>
  <section class="card">
    <h2>Daily goals</h2>

    <!-- Stated plainly because it is a design rule, not an omission: a number
         the app invented would be dosing advice. -->
    <p class="hint">
      Ration does not work out a recommended intake for you — these are your own numbers. Goals
      cover energy and the macros; a target for a vitamin or mineral is a dosing decision, so those
      come from reference data instead. A comma or a dot both work as the decimal separator.
    </p>

    <!-- Loading is not the same as having no goals: claiming "no target" before
         the first read lands would be a false statement, briefly (§3). -->
    <p v-if="store.loading" class="muted">–</p>

    <template v-else>
      <div v-for="key in store.goalNutrients" :key="key" class="row">
        <label :for="`goal-${key}`">{{ labelFor(key) }}</label>

        <!-- text, not number: see parse-amount.ts. -->
        <input
          :id="`goal-${key}`"
          v-model="inputs[key]"
          type="text"
          inputmode="decimal"
          autocomplete="off"
          :aria-invalid="problemFor(key) ? true : undefined"
          @input="touched.add(key)"
        />
        <!-- No "/ day": the section heading already says these are daily. -->
        <span class="unit">{{ unitFor(key) }}</span>

        <span class="state">
          <!-- Says what intake is currently measured against, and on whose
             authority — the same provenance discipline as the intake side. -->
          <template v-if="store.targets[key]">
            {{ store.targets[key]!.origin === 'user' ? 'Your goal' : 'Reference' }}:
            {{ formatAmount(key, store.targets[key]!.target) }} {{ unitFor(key) }}
          </template>
          <span v-else class="muted">No target yet</span>

          <span v-if="problemFor(key)" class="problem" role="status">
            · {{ problemFor(key) }}
          </span>
        </span>

        <button type="button" :disabled="!canSave(key)" @click="save(key)">Save</button>

        <!-- The cell stays even when empty, so Save does not shift sideways
             between a nutrient that has a goal and one that does not. -->
        <span class="clear">
          <button v-if="hasGoal(key)" type="button" class="ghost" @click="clear(key)">Clear</button>
        </span>
      </div>
    </template>
  </section>
</template>

<style scoped>
.card {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius-card);
  padding: var(--space-5);
}

h2 {
  margin: 0;
  font-size: var(--text-section);
  font-weight: var(--weight-medium);
}

.hint {
  margin: var(--space-3) 0 var(--space-4);
  font-size: var(--text-caption);
  color: var(--ink-soft);
}

/* Fixed tracks, not auto: every row is its own grid, so only a fixed width lines
   a column up with the row above — and §15 wants number columns aligned. The two
   button tracks keep Save in place whether or not a Clear sits beside it. */
.row {
  display: grid;
  grid-template-columns: 8rem 5.5rem 2.5rem 1fr 4rem 4rem;
  grid-template-areas: 'label input unit state save clear';
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3) 0;
  border-top: 1px solid var(--line);
}

label {
  grid-area: label;
}

input {
  grid-area: input;
}

.unit {
  grid-area: unit;
}

.state {
  grid-area: state;
}

/* The Save button is the row's own child; Clear lives in its wrapper span. */
.row > button {
  grid-area: save;
}

.clear {
  grid-area: clear;
}

/* One row of six fixed columns needs about 30rem. Below that it stacks instead
   of pushing the buttons off the side of a phone — this is a PWA first (§2). */
@media (max-width: 30rem) {
  .row {
    grid-template-columns: 1fr 2.5rem 4rem 4rem;
    grid-template-areas:
      'label label label label'
      'input unit save clear'
      'state state state state';
    row-gap: var(--space-2);
  }
}

label {
  color: var(--ink-soft);
  font-size: var(--text-caption);
  letter-spacing: var(--tracking-eyebrow);
  text-transform: uppercase;
}

input {
  font: inherit;
  width: 100%;
  text-align: right;
  color: var(--ink);
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius-control);
  padding: var(--space-1) var(--space-2);
  font-feature-settings: var(--figures-tabular);
  transition: border-color var(--motion-fast) var(--ease-out);
}

input:hover {
  border-color: var(--ink-soft);
}

/* Supplements the message rather than replacing it — colour never carries the
   meaning on its own (§15). */
input[aria-invalid='true'] {
  border-color: var(--status-under);
}

.unit,
.state {
  color: var(--ink-soft);
  font-size: var(--text-caption);
  font-feature-settings: var(--figures-tabular);
}

.problem {
  font-size: var(--text-caption);
  color: var(--status-under);
}

.muted {
  color: var(--ink-soft);
}

button {
  font: inherit;
  /* Stretched to the track width, so the column reads as a column. */
  justify-self: stretch;
  font-size: var(--text-caption);
  font-weight: var(--weight-medium);
  color: var(--surface);
  background: var(--primary);
  border: 1px solid transparent;
  border-radius: var(--radius-pill);
  padding: var(--space-1) var(--space-2);
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

button.ghost {
  color: var(--ink-soft);
  background: none;
  border-color: var(--line);
}

button.ghost:hover {
  background: none;
  border-color: var(--ink-soft);
}
</style>
