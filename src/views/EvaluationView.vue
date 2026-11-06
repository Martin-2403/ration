<script setup lang="ts">
/**
 * Long-term intake against targets (§9). Composition only: the window comes
 * from useWindow, the targets from the config store, and every figure from
 * evaluation.ts — nothing here does arithmetic of its own.
 */
import { ChevronRight } from '@lucide/vue'
import { computed } from 'vue'

import NutrientBar from '../components/NutrientBar.vue'
import { useWindow } from '../composables/useWindow'
import { byUrgency, evaluate } from '../evaluation'
import { hasNoData } from '../nutrient-display'
import { useConfigStore } from '../stores/config'

const WINDOWS = [7, 30]

const config = useConfigStore()
const { days, window, entries, loading, coverage } = useWindow()

const evaluations = computed(() => byUrgency(evaluate(entries.value, config.targets, window.value)))

/**
 * Nutrients no contributor supplied a value for, split from the rest (#86).
 * Only `hasNoData` qualifies: a no-target nutrient still renders a figure, and
 * a measured zero is a value (§3). A filter keeps each list in `byUrgency`'s
 * order, so the measured rows and the no-target tier rank exactly as before.
 */
const measured = computed(() =>
  evaluations.value.filter((evaluation) => !hasNoData(evaluation.intake)),
)
const unmeasured = computed(() =>
  evaluations.value.filter((evaluation) => hasNoData(evaluation.intake)),
)

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

        <!-- Both this branch and the hasAnyTarget fallback below became
             unreachable when #16 filled the reference table: evaluate() reports
             every nutrient with a target *or* an intake, and 31 of the 34
             tracked nutrients now have a reference figure, so there is always
             something to compare once a day is logged. Kept rather than deleted
             because #55 can reach them again — narrowing the tracked set to the
             three that carry no direction empties the comparison entirely. Both
             are consequently untested; no state the store can be put into
             renders them. -->
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
            v-for="evaluation in measured"
            :key="evaluation.nutrient"
            :nutrient="evaluation.nutrient"
            :total="evaluation.intake"
            :target="evaluation.target"
            :limit="evaluation.limit"
            :origin="evaluation.origin"
          />

          <!-- Collapsed, not dropped: the count still states the absence (§3)
               and expanding shows every row as it always rendered. Native
               details/summary, so keyboard and screen-reader behaviour come
               with it. Nothing renders when there are none to group. -->
          <details v-if="unmeasured.length > 0" class="no-data">
            <summary>
              <ChevronRight :size="16" :stroke-width="1.5" aria-hidden="true" />
              <span>
                {{ unmeasured.length }}
                {{ unmeasured.length === 1 ? 'nutrient' : 'nutrients' }} with no data
              </span>
            </summary>

            <NutrientBar
              v-for="evaluation in unmeasured"
              :key="evaluation.nutrient"
              :nutrient="evaluation.nutrient"
              :total="evaluation.intake"
              :target="evaluation.target"
              :limit="evaluation.limit"
              :origin="evaluation.origin"
            />
          </details>
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

/* A grid item is min-width: auto, so a child too wide for the column widens
   the column rather than shrinking — the log screen's #102 and the day
   screen's #109, guarded here before a wide row can trigger it (#114). */
.page > * {
  min-width: 0;
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

/* The first bar sits under the explanatory line rather than against it. Direct
   children only: the rows inside the no-data group must not pick this up. */
.card > :deep(.row:first-of-type),
.explain + .no-data {
  margin-top: var(--space-4);
}

/* The group reads as one more row of the list: same hairline above it, and a
   summary that is interactive without a button's fill (§15 keeps the pill for
   primary actions) — an ink label with a chevron, and a hover tint. */
.no-data {
  border-top: 1px solid var(--line);
}

.no-data summary {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  /* The 44px touch floor AppNav and IconAction document. */
  min-height: 2.75rem;
  color: var(--ink);
  font-weight: var(--weight-medium);
  cursor: pointer;
  /* The native marker is replaced by the chevron. */
  list-style: none;
  border-radius: var(--radius-control);
  transition: background-color var(--motion-fast) var(--ease-out);
}

.no-data summary::-webkit-details-marker {
  display: none;
}

.no-data summary:hover {
  background: var(--primary-tint);
}

/* A long label wraps beside the chevron instead of pushing past the card. */
.no-data summary span {
  min-width: 0;
  overflow-wrap: anywhere;
}

.no-data summary svg {
  flex: none;
  color: var(--ink-soft);
  /* Duration comes from a token, which reduced motion collapses (§15). */
  transition: transform var(--motion-fast) var(--ease-out);
}

.no-data[open] summary svg {
  transform: rotate(90deg);
}
</style>
