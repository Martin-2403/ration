<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import type { NutrientKey } from '../data/nutrients'
import { findFoods } from '../food-lookup'
import { formatAmount, labelFor } from '../nutrient-display'
import { parseAmount } from '../parse-amount'
import { useLogStore } from '../stores/log'
import { nutrientsFor, sumTotals } from '../totals'
import type { Food, StoredLogEntry } from '../types'

const { entry } = defineProps<{ entry: StoredLogEntry }>()
const emit = defineEmits<{ done: [] }>()

const store = useLogStore()

const foods = ref(new Map<string, Food>())

/**
 * Separate from `foods.size`, which is 0 both before the lookup and for an
 * entry whose foods have all been deleted — and those mean opposite things to
 * the warning below.
 */
const loaded = ref(false)

/**
 * What the user has typed, per item, index-aligned with entry.items. Raw
 * strings, because the fields are text inputs and we do the parsing (see
 * parse-amount.ts for why a number input is not used here).
 */
const grams = ref<string[]>(
  entry.items.map((item) => (item.kind === 'food' ? String(item.grams) : '')),
)

onMounted(async () => {
  const ids = entry.items.flatMap((item) => (item.kind === 'food' ? [item.foodId] : []))
  foods.value = await findFoods(ids)
  loaded.value = true
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

/**
 * Parsed amounts, index-aligned with entry.items. `undefined` for a row that has
 * no field of its own — a supplement dose is not editable here yet (§8), so it
 * cannot be the reason a save is blocked either.
 */
const parsed = computed(() =>
  entry.items.map((item, index) =>
    item.kind === 'food' ? parseAmount(grams.value[index] ?? '') : undefined,
  ),
)

/** Rows holding something that is not a number at all, named for the message. */
const notNumeric = computed(() =>
  rows.value
    .filter((row) => parsed.value[row.index]?.kind === 'not-a-number')
    .map((row) => row.label),
)

// An amount eaten has no meaningful blank, unlike a nutrient value: an item with
// no quantity contributes nothing and should be removed instead of zeroed.
const canSave = computed(() =>
  parsed.value.every((amount) => !amount || (amount.kind === 'number' && amount.value > 0)),
)

/**
 * What the entry's own amounts resolve to against the food data as it stands
 * now — the stored snapshot recomputed without changing anything (#41).
 */
const atStoredAmounts = computed(() => {
  if (!loaded.value) return undefined

  return sumTotals(
    entry.items.map((item) => {
      if (item.kind !== 'food') return {}

      const food = foods.value.get(item.foodId)

      return food ? nutrientsFor(food, item.grams) : {}
    }),
  )
})

/**
 * Nutrients whose stored figure no longer matches what the food data gives.
 *
 * §9 forbids upstream data rewriting history on its own, and saving an edit is
 * the user asking for a rewrite — but they asked about grams, not about the
 * values, and nothing said the rest had moved.
 */
const moved = computed<NutrientKey[]>(() => {
  const now = atStoredAmounts.value
  if (!now) return []

  const keys = new Set([...Object.keys(entry.totals), ...Object.keys(now)]) as Set<NutrientKey>

  return [...keys].filter((key) => {
    const before = entry.totals[key]?.amount ?? 0
    const after = now[key]?.amount ?? 0

    // Identical inputs give identical output, so any real difference means the
    // food changed; the tolerance only absorbs float noise from re-scaling.
    return Math.abs(after - before) > 1e-9
  })
})

/**
 * Items whose food does not resolve any more — a hand-entered food deleted, or
 * a seed dropped in a later release.
 *
 * Worse than a changed value and worth saying separately: a revision
 * re-resolves every item, so saving replaces whatever these contributed with
 * nothing at all.
 */
const unresolved = computed(() =>
  loaded.value
    ? entry.items.flatMap((item) =>
        item.kind === 'food' && !foods.value.has(item.foodId) ? [item.foodId] : [],
      )
    : [],
)

/** Preview of what saving would store, so the change is visible before it lands. */
const preview = computed(() => {
  if (!canSave.value) return undefined

  const maps = entry.items.map((item, index) => {
    const amount = parsed.value[index]
    if (item.kind !== 'food' || amount?.kind !== 'number') return {}

    const food = foods.value.get(item.foodId)

    return food ? nutrientsFor(food, amount.value) : {}
  })

  return sumTotals(maps).energy
})

async function save() {
  if (!canSave.value) return

  await store.reviseEntry({
    ...entry,
    items: entry.items.map((item, index) => {
      const amount = parsed.value[index]

      return item.kind === 'food' && amount?.kind === 'number'
        ? { ...item, grams: amount.value }
        : item
    }),
  })

  emit('done')
}
</script>

<template>
  <div class="editor">
    <div v-for="row in rows" :key="row.index" class="row">
      <span class="label">{{ row.label }}</span>
      <span v-if="row.editable" class="amount">
        <!-- text, not number: see parse-amount.ts. inputmode keeps the numeric
             keypad on a phone, and a decimal comma survives. -->
        <input
          v-model="grams[row.index]"
          type="text"
          inputmode="decimal"
          autocomplete="off"
          :aria-label="`Grams of ${row.label}`"
          :aria-invalid="parsed[row.index]?.kind === 'not-a-number' || undefined"
        />
        g
      </span>
      <span v-else class="amount muted">not editable yet</span>
    </div>

    <!-- Stated before the save button rather than after it, because it changes
         what saving means. Text, not a colour (§15). -->
    <p v-if="unresolved.length > 0" class="warning" role="status">
      {{ unresolved.length === 1 ? 'One food in this entry' : `${unresolved.length} foods here` }}
      no longer exists. Saving will drop what
      {{ unresolved.length === 1 ? 'it' : 'they' }} contributed, leaving those nutrients with no
      data.
    </p>
    <p v-else-if="moved.length > 0" class="warning" role="status">
      This food's values have changed since this was logged. Saving will update
      {{ moved.map((key) => labelFor(key)).join(', ') }} too.
    </p>

    <div class="footer">
      <span v-if="preview" class="preview">
        {{ formatAmount('energy', preview.amount) }} kcal
      </span>
      <!-- A blocked save always says what is wrong, and which row when it can. -->
      <span v-else-if="notNumeric.length > 0" class="problem" role="status">
        Not a number: {{ notNumeric.join(', ') }}
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

/* The one status tone that is not "on target" (§15). Carried by the sentence
   rather than the colour, which only supplements it. */
.warning {
  margin: var(--space-2) 0 0;
  font-size: var(--text-caption);
  color: var(--status-under);
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

/* Supplements the message rather than replacing it — colour never carries the
   meaning on its own (§15). */
input[aria-invalid='true'] {
  border-color: var(--status-under);
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
