<script setup lang="ts">
import { computed } from 'vue'

import DaySummary from '../components/DaySummary.vue'
import FoodForm from '../components/FoodForm.vue'
import MealBuilder from '../components/MealBuilder.vue'
import TodayLog from '../components/TodayLog.vue'
import { SEED_TEMPLATES } from '../data/foods'
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

    <MealBuilder v-for="template in SEED_TEMPLATES" :key="template.id" :template="template" />

    <FoodForm @submit="store.logFood" />

    <TodayLog :entries="store.entries" @remove="store.removeEntry" />
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

button:hover:not(:disabled) {
  border-color: var(--ink-soft);
}

/* There is nothing to log in the future, so forward stops at today. */
button:disabled {
  opacity: 0.4;
  cursor: default;
}
</style>
