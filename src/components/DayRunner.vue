<script setup lang="ts">
/**
 * Running a day template: one meal at a time, through the ordinary builder
 * (§7, #52 reading (a)).
 *
 * Nothing is logged in bulk. Each meal is the same MealBuilder the meals list
 * opens, so every amount is confirmed against what was actually eaten and every
 * entry carries its own snapshot (§9). The day is a shortcut through the
 * repetition of opening three templates, not a second way of writing entries.
 *
 * Skipping is a first-class step. A usual day is usual, not certain, and a
 * runner that can only be completed or abandoned would be abandoned the first
 * time lunch was different.
 */
import { computed, onMounted, ref } from 'vue'

import { resolveDayTemplate, type ResolvedMeal } from '../day-templates'
import type { DayTemplate } from '../types'
import MealBuilder from './MealBuilder.vue'

const { template, eatenAt } = defineProps<{
  template: DayTemplate
  /** When the meals were eaten. Undefined means each is stamped as it is logged. */
  eatenAt?: number
}>()

const emit = defineEmits<{ done: [logged: number] }>()

const meals = ref<ResolvedMeal[]>([])
const missing = ref<string[]>([])
const ready = ref(false)

/**
 * True while the current meal's write is in flight.
 *
 * Skip stays enabled otherwise, and firing it before a write resolves
 * advances the runner while that write's own `logged` emit is still
 * pending — an emit from an instance the runner has since keyed away is
 * never delivered, so the entry lands but nothing counts it (#108).
 */
const writing = ref(false)

/** Which meal is on screen. Equal to meals.length once the day is finished. */
const step = ref(0)
const logged = ref(0)

onMounted(async () => {
  const resolved = await resolveDayTemplate(template)

  meals.value = resolved.meals
  missing.value = resolved.missing
  ready.value = true
})

const current = computed(() => meals.value[step.value])
const finished = computed(() => ready.value && step.value >= meals.value.length)

function advance(didLog: boolean) {
  if (didLog) logged.value += 1
  step.value += 1
}
</script>

<template>
  <!-- Not a card itself: the builder inside brings its own surface, and
       nesting one in another reads as two panels rather than one meal (§15). -->
  <section class="runner">
    <p v-if="!ready" class="note" role="status">Loading {{ template.name }}…</p>

    <template v-else-if="!finished">
      <header class="progress">
        <span class="count">Meal {{ step + 1 }} of {{ meals.length }}</span>
        <h2>{{ current?.template?.name ?? current?.id }}</h2>
      </header>

      <!-- A meal deleted since the day named it is reported, not skipped over:
           a day that logs two of its three meals looks complete (§3, #52). -->
      <div v-if="current && !current.template" class="panel">
        <p class="problem" role="status">
          This meal is no longer saved, so there is nothing to log for it.
        </p>
        <div class="footer">
          <button type="button" @click="advance(false)">Continue</button>
        </div>
      </div>

      <template v-else-if="current?.template">
        <!-- Keyed by position: a day that names the same meal twice needs a
             fresh draft the second time, not the one just logged. -->
        <MealBuilder
          :key="step"
          :template="current.template"
          :eaten-at="eatenAt"
          @logged="advance(true)"
          @busy="writing = $event"
        />

        <div class="footer">
          <button type="button" class="ghost" :disabled="writing" @click="advance(false)">
            Skip this meal
          </button>
        </div>
      </template>
    </template>

    <!-- The end of the day is its own step rather than an immediate exit: it is
         the one place the whole run can be read back, including the meals that
         were skipped or could not be logged at all. -->
    <div v-else class="panel">
      <p class="done" role="status">
        Logged {{ logged }} of {{ meals.length }} meal(s) from {{ template.name }}.
      </p>
      <p v-if="missing.length > 0" class="problem">
        Not logged, no longer saved: {{ missing.join(', ') }}.
      </p>
      <div class="footer">
        <button type="button" @click="emit('done', logged)">Done</button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.runner {
  display: grid;
  gap: var(--space-4);
}

.panel {
  display: grid;
  gap: var(--space-4);
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius-card);
  padding: var(--space-5);
}

.progress {
  display: grid;
  gap: var(--space-1);
}

.count {
  color: var(--ink-soft);
  font-size: var(--text-caption);
  letter-spacing: var(--tracking-eyebrow);
  text-transform: uppercase;
  font-feature-settings: var(--figures-tabular);
}

h2 {
  margin: 0;
  font-size: var(--text-section);
  font-weight: var(--weight-medium);
}

.note,
.done,
.problem {
  margin: 0;
  font-size: var(--text-caption);
}

.note,
.done {
  color: var(--ink-soft);
}

/* Paired with text, never colour alone (§15). */
.problem {
  color: var(--status-under);
}

.footer {
  display: flex;
  justify-content: flex-end;
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

/* Secondary: §15 reserves the filled pill for the primary action on a surface. */
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

button:disabled {
  opacity: 0.5;
  cursor: default;
}
</style>
