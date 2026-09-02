<script setup lang="ts">
import { computed } from 'vue'

import DaySummary from '../components/DaySummary.vue'
import DayLog from '../components/DayLog.vue'
import { useLogStore } from '../stores/log'

const store = useLogStore()

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
  <div class="page">
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

    <!-- Logging is its own route, so it carries its own date rather than
         inheriting whichever day this screen happens to show (#61). -->
    <RouterLink class="log" to="/log">Log something</RouterLink>

    <DayLog :entries="store.entries" @remove="store.removeEntry" />
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
.log {
  display: block;
  text-align: center;
  text-decoration: none;
  font-weight: var(--weight-medium);
  color: var(--surface);
  background: var(--primary);
  border: none;
  border-radius: var(--radius-pill);
  padding: var(--space-3) var(--space-5);
  transition: background var(--motion-fast) var(--ease-out);
}

.log:hover {
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
