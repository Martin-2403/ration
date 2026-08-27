<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import { findFoods } from '../food-lookup'
import { formatAmount } from '../nutrient-display'
import { useLogStore } from '../stores/log'
import { nutrientsFor, sumTotals } from '../totals'
import type { Food, StoredLogEntry } from '../types'

const { entry } = defineProps<{ entry: StoredLogEntry }>()
const emit = defineEmits<{ done: [] }>()

const store = useLogStore()

const foods = ref(new Map<string, Food>())

/** Grams per item, index-aligned with entry.items. */
const grams = ref<(number | '' | null)[]>(
  entry.items.map((item) => (item.kind === 'food' ? item.grams : 0)),
)

onMounted(async () => {
  const ids = entry.items.flatMap((item) => (item.kind === 'food' ? [item.foodId] : []))
  foods.value = await findFoods(ids)
})

const rows = computed(() =>
  entry.items.map((item, index) => ({
    index,
    // A food logged long ago may no longer resolve — a manual food deleted, or a
    // seed removed in a later release. Show the id rather than nothing, so the
    // row is still identifiable and editable.
    label:
      item.kind === 'food' ? (foods.value.get(item.foodId)?.name ?? item.foodId) : 'Supplement',
    editable: item.kind === 'food',
  })),
)

const isUsable = (value: number | '' | null) =>
  typeof value === 'number' && Number.isFinite(value) && value > 0

const canSave = computed(() => grams.value.every(isUsable))

/** Preview of what saving would store, so the change is visible before it lands. */
const preview = computed(() => {
  if (!canSave.value) return undefined

  const maps = entry.items.map((item, index) => {
    if (item.kind !== 'food') return {}
    const food = foods.value.get(item.foodId)

    return food ? nutrientsFor(food, grams.value[index] as number) : {}
  })

  return sumTotals(maps).energy
})

async function save() {
  if (!canSave.value) return

  await store.reviseEntry({
    ...entry,
    items: entry.items.map((item, index) =>
      item.kind === 'food' ? { ...item, grams: grams.value[index] as number } : item,
    ),
  })

  emit('done')
}
</script>

<template>
  <div class="editor">
    <div v-for="row in rows" :key="row.index" class="row">
      <span class="label">{{ row.label }}</span>
      <span v-if="row.editable" class="amount">
        <input
          v-model.number="grams[row.index]"
          type="number"
          min="0"
          step="5"
          :aria-label="`Grams of ${row.label}`"
        />
        g
      </span>
      <span v-else class="amount muted">not editable yet</span>
    </div>

    <div class="footer">
      <span v-if="preview" class="preview">
        {{ formatAmount('energy', preview.amount) }} kcal
      </span>
      <span v-else class="problem">Amounts must be positive numbers</span>

      <button type="button" class="ghost" @click="emit('done')">Cancel</button>
      <button type="button" :disabled="!canSave" @click="save">Save</button>
    </div>
  </div>
</template>

<style scoped>
.editor {
  padding: var(--space-3) 0 0;
}

.row {
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-2) 0;
}

.label {
  color: var(--ink-soft);
}

input {
  font: inherit;
  width: 4.5rem;
  text-align: right;
  color: var(--ink);
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius-control);
  padding: var(--space-1) var(--space-2);
  font-feature-settings: var(--figures-tabular);
}

.amount {
  color: var(--ink-soft);
  font-size: var(--text-caption);
}

.footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--space-3);
  padding-top: var(--space-3);
}

.preview {
  margin-right: auto;
  color: var(--ink-soft);
  font-feature-settings: var(--figures-tabular);
}

.problem {
  margin-right: auto;
  font-size: var(--text-caption);
  color: var(--status-under);
}

.muted {
  color: var(--ink-soft);
}

button {
  font: inherit;
  font-size: var(--text-caption);
  font-weight: var(--weight-medium);
  color: var(--surface);
  background: var(--primary);
  border: 1px solid transparent;
  border-radius: var(--radius-pill);
  padding: var(--space-1) var(--space-4);
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
