<script setup lang="ts">
import { computed, ref } from 'vue'

import DaySummary from '../components/DaySummary.vue'
import LogSheet from '../components/LogSheet.vue'
import DayLog from '../components/DayLog.vue'
import { SEED_TEMPLATES } from '../data/foods'
import { useLogStore } from '../stores/log'

const store = useLogStore()

/**
 * Logging happens behind a deliberate action (#53). Leaving the builders and the
 * hand-entry form open on the page meant the first thing the app showed was
 * three editable forms full of fixture data, which reads as though it were
 * telling the user what they ate.
 */
const logging = ref(false)

const heading = computed(() =>
  store.isToday
    ? 'Today'
    : new Date(store.day).toLocaleDateString(undefined, {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      }),
)
</script>

<template>
  <!-- `logging || undefined`, not `logging`: Vue does not treat inert as a
       boolean attribute, so a false value renders inert="false" — and inert
       applies whenever the attribute is present, whatever its value. That would
       leave the page permanently dead, including the button below. -->
  <div class="page" :inert="logging || undefined">
    <header>
      <button type="button" aria-label="Previous day" @click="store.shiftDay(-1)">←</button>
      <h1>{{ heading }}</h1>
      <button
        type="button"
        aria-label="Next day"
        :disabled="store.isToday"
        @click="store.shiftDay(1)"
      >
        →
      </button>
    </header>

    <DaySummary :totals="store.dayTotals" :loading="store.loading" />

    <button type="button" class="log" @click="logging = true">Log something</button>

    <DayLog :entries="store.entries" @remove="store.removeEntry" />
  </div>

  <!-- Outside the page, so marking the page inert does not disable the sheet. -->
  <LogSheet v-if="logging" :templates="SEED_TEMPLATES" @close="logging = false" />
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
}

h1 {
  margin: 0;
  font-size: var(--text-section);
  font-weight: var(--weight-medium);
}

button {
  font: inherit;
  color: var(--ink-soft);
  background: none;
  border: 1px solid var(--line);
  border-radius: var(--radius-control);
  padding: var(--space-1) var(--space-3);
  cursor: pointer;
  transition: border-color var(--motion-fast) var(--ease-out);
}

/* The most-used control in the app, so it reads as the primary one (§15). */
button.log {
  font-weight: var(--weight-medium);
  color: var(--surface);
  background: var(--primary);
  border: none;
  border-radius: var(--radius-pill);
  padding: var(--space-3) var(--space-5);
  transition: background var(--motion-fast) var(--ease-out);
}

button.log:hover {
  background: var(--primary-strong);
}

button:hover:not(:disabled) {
  border-color: var(--ink-soft);
}

/* There is nothing to log in the future, so forward stops at today. */
button:disabled {
  opacity: 0.4;
  cursor: default;
}
</style>
