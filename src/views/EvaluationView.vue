<script setup lang="ts">
/**
 * Long-term intake against targets (§9). Composition only: the window comes
 * from useWindow, the targets from the config store, and every figure from
 * evaluation.ts — nothing here does arithmetic of its own.
 */
import { computed } from 'vue'

import NutrientBar from '../components/NutrientBar.vue'
import { useWindow } from '../composables/useWindow'
import { byUrgency, evaluate } from '../evaluation'
import { useConfigStore } from '../stores/config'

const WINDOWS = [7, 30]

const config = useConfigStore()
const { days, window, entries, loading, coverage } = useWindow()

const evaluations = computed(() => byUrgency(evaluate(entries.value, config.targets, window.value)))

/** Nothing logged means no denominator, so there is nothing to compare (§9). */
const nothingLogged = computed(() => coverage.value.logged === 0)

/**
 * Whether any row actually has a target. Intake alone still gets a bar, but the
 * framing line must not claim the figures are measured against targets when
 * none exist — the reference table is empty until #16, so this is the ordinary
 * case rather than an edge one.
 */
const hasAnyTarget = computed(() =>
  evaluations.value.some((evaluation) => evaluation.target !== undefined),
)
</script>

<template>
  <div class="page">
    <header>
      <h1>Evaluation</h1>

      <!-- Rolling windows, not calendar weeks: a Monday-start week reports a
           frightening shortfall two days out of seven (§9). -->
      <div class="windows" role="group" aria-label="Window length">
        <button
          v-for="option in WINDOWS"
          :key="option"
          type="button"
          :class="{ selected: days === option }"
          :aria-pressed="days === option"
          @click="days = option"
        >
          {{ option }} days
        </button>
      </div>
    </header>

    <section class="card">
      <p v-if="loading || config.loading" class="muted">–</p>

      <template v-else>
        <!-- Stated before any nutrient figure, because it qualifies all of
             them: coverage is a separate axis from provenance (§9). -->
        <p class="coverage">{{ coverage.logged }} of {{ coverage.days }} days logged</p>

        <template v-if="nothingLogged">
          <p class="explain">
            Nothing is logged in these {{ coverage.days }} days. Targets are compared against the
            days you actually log, so there is nothing to measure yet — a day without records is a
            missing record, not a day of eating nothing.
          </p>
        </template>

        <template v-else-if="evaluations.length === 0">
          <p class="explain">
            Nothing to compare yet. Set a daily goal in Settings, or log something that carries
            nutrient data.
          </p>
        </template>

        <template v-else>
          <!-- Says what the figures are, so a window total is not mistaken for
               a daily one. §9: an average meeting a target is a weaker claim
               than hitting it every day. -->
          <p v-if="hasAnyTarget" class="explain">
            Totals across the {{ coverage.logged }} logged
            {{ coverage.logged === 1 ? 'day' : 'days' }}, against
            {{ coverage.logged === 1 ? 'one day of' : `${coverage.logged} days of` }} your targets.
          </p>
          <p v-else class="explain">
            Totals across the {{ coverage.logged }} logged
            {{ coverage.logged === 1 ? 'day' : 'days' }}. Nothing to compare them against yet — set
            a daily goal in Settings.
          </p>

          <NutrientBar
            v-for="evaluation in evaluations"
            :key="evaluation.nutrient"
            :nutrient="evaluation.nutrient"
            :total="evaluation.intake"
            :target="evaluation.target"
            :limit="evaluation.limit"
            :origin="evaluation.origin"
          />
        </template>
      </template>
    </section>
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

header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  flex-wrap: wrap;
}

h1 {
  margin: 0;
  font-size: var(--text-section);
  font-weight: var(--weight-medium);
}

.windows {
  display: flex;
  gap: var(--space-2);
}

.windows button {
  font: inherit;
  font-size: var(--text-caption);
  color: var(--ink-soft);
  background: none;
  border: 1px solid var(--line);
  border-radius: var(--radius-pill);
  padding: var(--space-1) var(--space-3);
  cursor: pointer;
  transition:
    border-color var(--motion-fast) var(--ease-out),
    color var(--motion-fast) var(--ease-out);
}

.windows button:hover {
  border-color: var(--ink-soft);
  color: var(--ink);
}

/* Selection carries weight and a fill, not colour alone (§15). */
.windows button.selected {
  color: var(--primary);
  font-weight: var(--weight-semibold);
  background: var(--primary-tint);
  border-color: var(--primary);
}

.card {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius-card);
  padding: var(--space-5);
}

.coverage {
  margin: 0;
  font-feature-settings: var(--figures-tabular);
}

.explain {
  margin: var(--space-2) 0 0;
  font-size: var(--text-caption);
  color: var(--ink-soft);
}

.muted {
  margin: 0;
  color: var(--ink-soft);
}

/* The first bar sits under the explanatory line rather than against it. */
.card :deep(.row:first-of-type) {
  margin-top: var(--space-4);
}
</style>
