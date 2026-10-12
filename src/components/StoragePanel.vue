<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import {
  isInstalled,
  readEstimate,
  readPersistence,
  type PersistenceState,
  type StorageEstimate,
} from '../storage-persistence'

/** undefined until the first read lands, so "loading" is not a claim. */
const persistence = ref<PersistenceState>()
const estimate = ref<StorageEstimate>()
const loaded = ref(false)
const installed = ref(false)

onMounted(async () => {
  installed.value = isInstalled()
  ;[persistence.value, estimate.value] = await Promise.all([readPersistence(), readEstimate()])
  loaded.value = true
})

/**
 * Wording says what the browser answered, never that the data is safe: a granted
 * request is not documented to survive pressure eviction on iOS (#8).
 */
const persistenceText = computed(() => {
  switch (persistence.value) {
    case 'granted':
      return 'The browser has agreed to keep this app’s data. That is not a guarantee, so a backup is still worth having.'
    case 'refused':
      return 'The browser declined to mark this app’s data as persistent. It may be cleared if the device runs low on space.'
    case 'not-asked':
      return 'Not asked yet. Ration asks the browser the first time you save something.'
    case 'unsupported':
      return 'This browser does not say whether the data is persistent.'
    default:
      return '–'
  }
})

/** Decimal units, to one decimal below 10 so a small figure is not shown as 0. */
function formatSize(bytes: number): string {
  const units = ['bytes', 'KB', 'MB', 'GB', 'TB']
  let value = bytes
  let unit = 0

  while (value >= 1000 && unit < units.length - 1) {
    value /= 1000
    unit++
  }

  const shown = unit === 0 || value >= 10 ? Math.round(value) : Math.round(value * 10) / 10

  return `${shown} ${units[unit]}`
}

const usageText = computed(() =>
  estimate.value
    ? `About ${formatSize(estimate.value.usage)} of roughly ${formatSize(estimate.value.quota)}. The browser reports this approximately.`
    : 'The browser does not report how much space is used.',
)

const installedText = computed(() =>
  installed.value
    ? 'Running as an installed app.'
    : 'Running in a browser tab. Installing the app can help the browser keep its data; back up first, because installed storage starts empty.',
)
</script>

<template>
  <section class="card" aria-labelledby="storage-heading">
    <h2 id="storage-heading">Backup and storage</h2>

    <dl v-if="loaded" class="facts">
      <div class="fact">
        <dt>Persistent storage</dt>
        <dd data-testid="persistence" :data-state="persistence">{{ persistenceText }}</dd>
      </div>

      <div class="fact">
        <dt>Space used</dt>
        <dd data-testid="usage">{{ usageText }}</dd>
      </div>

      <div class="fact">
        <dt>Installed</dt>
        <dd data-testid="installed">{{ installedText }}</dd>
      </div>
    </dl>
    <p v-else class="muted">–</p>

    <!-- Later pieces (export, restore, reminders) add their own blocks here. -->
    <slot />
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
  margin: 0 0 var(--space-3);
  font-size: var(--text-section);
  font-weight: var(--weight-medium);
}

.facts {
  margin: 0;
}

.fact {
  display: grid;
  gap: var(--space-1);
  padding: var(--space-3) 0;
  border-top: 1px solid var(--line);
}

dt {
  color: var(--ink-soft);
  font-size: var(--text-caption);
  letter-spacing: var(--tracking-eyebrow);
  text-transform: uppercase;
}

dd {
  margin: 0;
  overflow-wrap: anywhere;
}

.muted {
  color: var(--ink-soft);
}
</style>
