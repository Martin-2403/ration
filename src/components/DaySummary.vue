<script setup lang="ts">
import { computed } from 'vue'

import { NUTRIENTS, type NutrientKey, type NutrientTotals } from '../data/nutrients'
import {
  estimatedPercent,
  formatAmount,
  hasNoData,
  isPartial,
  labelFor,
  unitFor,
} from '../nutrient-display'

const { totals, loading = false } = defineProps<{
  totals: NutrientTotals
  loading?: boolean
}>()

const keys = Object.keys(NUTRIENTS) as NutrientKey[]

const energy = computed(() => totals.energy)

// Everything except the hero figure, in registry order.
const rows = computed(() => keys.filter((key) => key !== 'energy').map((key) => ({ key })))
</script>

<template>
  <section class="card">
    <!-- Names the content, not the day: the view heading above already says
         which day this is, and "Today" was a false label on every other one. -->
    <p class="eyebrow">Intake</p>

    <p v-if="loading" class="hero muted">–</p>
    <p v-else-if="!energy || hasNoData(energy)" class="hero muted">No data</p>
    <p v-else class="hero">
      {{ formatAmount('energy', energy.amount) }}<span class="hero-unit">kcal</span>
    </p>

    <p v-if="energy && isPartial(energy)" class="caveat">
      At least this much — {{ energy.missing }} item(s) had no energy data
    </p>

    <dl class="rows">
      <template v-for="row in rows" :key="row.key">
        <dt>{{ labelFor(row.key) }}</dt>
        <dd>
          <!-- Loading is not the same as having no data. Claiming "No data"
               before the read finishes is the same false statement as rendering
               an unknown as zero (§3), just a transient one. -->
          <span v-if="loading" class="muted">–</span>
          <template v-else-if="!totals[row.key] || hasNoData(totals[row.key]!)">
            <span class="muted">No data</span>
          </template>
          <template v-else>
            <span :class="{ estimated: estimatedPercent(totals[row.key]!) > 0 }">
              {{ formatAmount(row.key, totals[row.key]!.amount) }} {{ unitFor(row.key) }}
            </span>
            <span v-if="isPartial(totals[row.key]!)" class="note">
              · {{ totals[row.key]!.missing }} without data
            </span>
            <span v-if="estimatedPercent(totals[row.key]!) > 0" class="note">
              · {{ estimatedPercent(totals[row.key]!) }}% estimated
            </span>
          </template>
        </dd>
      </template>
    </dl>
  </section>
</template>

<style scoped>
.card {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius-card);
  padding: var(--space-5);
}

.eyebrow {
  margin: 0 0 var(--space-2);
  font-size: var(--text-caption);
  font-weight: var(--weight-medium);
  letter-spacing: var(--tracking-eyebrow);
  text-transform: uppercase;
  color: var(--ink-soft);
}

/* Mono earns attention by being rare — the day's kcal is the one hero figure
   (§15), so it is the only place this family appears. */
.hero {
  margin: 0;
  font-family: var(--font-mono);
  font-size: var(--text-display);
  font-weight: var(--weight-medium);
}

.hero-unit {
  margin-left: var(--space-2);
  font-family: var(--font-sans);
  font-size: var(--text-body);
  color: var(--ink-soft);
}

.rows {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: var(--space-2) var(--space-4);
  margin: var(--space-5) 0 0;
  /* Tabular figures keep the column aligned without mono's weight (§15). */
  font-feature-settings: var(--figures-tabular);
}

dt {
  color: var(--ink-soft);
}

dd {
  margin: 0;
  text-align: right;
}

/* Provenance without relying on colour (§15): estimated values are marked, and
   the marker survives greyscale and colour-blindness. */
.estimated {
  border-bottom: 1px dotted var(--ink-soft);
}

.muted {
  color: var(--ink-soft);
}

.note,
.caveat {
  font-size: var(--text-caption);
  color: var(--ink-soft);
}

.caveat {
  margin: var(--space-2) 0 0;
}
</style>
