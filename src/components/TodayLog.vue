<script setup lang="ts">
import { ref } from 'vue'

import { formatAmount, hasNoData } from '../nutrient-display'
import type { LogEntry, StoredLogEntry } from '../types'
import EntryEditor from './EntryEditor.vue'

const { entries } = defineProps<{ entries: LogEntry[] }>()

const emit = defineEmits<{ remove: [id: number] }>()

const editingId = ref<number | null>(null)

const time = (ts: number) =>
  new Date(ts).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })

/** Entries always have an id once stored; narrowing it keeps the editor honest. */
const stored = (entry: LogEntry) => entry as StoredLogEntry
</script>

<template>
  <section class="card">
    <p class="eyebrow">Logged</p>

    <p v-if="entries.length === 0" class="empty">
      Nothing logged yet. An empty day is not a zero-intake day.
    </p>

    <ul v-else>
      <li v-for="entry in entries" :key="entry.id">
        <div class="summary">
          <span class="time">{{ time(entry.timestamp) }}</span>
          <span class="name">{{ entry.name }}</span>
          <span class="kcal">
            {{
              entry.totals.energy && !hasNoData(entry.totals.energy)
                ? `${formatAmount('energy', entry.totals.energy.amount)} kcal`
                : 'No data'
            }}
          </span>
          <button
            type="button"
            :aria-label="`Edit ${entry.name}`"
            @click="editingId = editingId === entry.id ? null : entry.id!"
          >
            {{ editingId === entry.id ? 'Close' : 'Edit' }}
          </button>
          <button
            type="button"
            :aria-label="`Remove ${entry.name}`"
            @click="emit('remove', entry.id!)"
          >
            Remove
          </button>
        </div>

        <EntryEditor
          v-if="editingId === entry.id"
          :entry="stored(entry)"
          @done="editingId = null"
        />
      </li>
    </ul>
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
  margin: 0 0 var(--space-3);
  font-size: var(--text-caption);
  font-weight: var(--weight-medium);
  letter-spacing: var(--tracking-eyebrow);
  text-transform: uppercase;
  color: var(--ink-soft);
}

.empty {
  margin: 0;
  color: var(--ink-soft);
}

ul {
  margin: 0;
  padding: 0;
  list-style: none;
}

li {
  padding: var(--space-3) 0;
  border-top: 1px solid var(--line);
}

.summary {
  display: grid;
  grid-template-columns: auto 1fr auto auto auto;
  align-items: center;
  gap: var(--space-4);
}

.time,
.kcal {
  color: var(--ink-soft);
  font-feature-settings: var(--figures-tabular);
}

.kcal {
  text-align: right;
}

button {
  font: inherit;
  font-size: var(--text-caption);
  color: var(--ink-soft);
  background: none;
  border: 1px solid var(--line);
  border-radius: var(--radius-control);
  padding: var(--space-1) var(--space-3);
  cursor: pointer;
  transition:
    color var(--motion-fast) var(--ease-out),
    border-color var(--motion-fast) var(--ease-out);
}

button:hover {
  color: var(--status-under);
  border-color: var(--status-under);
}
</style>
