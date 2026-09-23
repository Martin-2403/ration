<script setup lang="ts">
/**
 * Composing a day out of meals (§7, #52).
 *
 * The editor for a DayTemplate value: it names the day and orders the meals it
 * is made of. It never creates the copy itself — a clone arrives as `draft`
 * already made by cloneDayTemplate, so "start from my workday" and "start from
 * nothing" are the same form with different initial state.
 *
 * Meals come from listMealTemplates, so seeds and anything the user built
 * (#96) are equally available.
 */
import { computed, onMounted, ref } from 'vue'

import { dayTemplates } from '../db'
import { moveMeal } from '../day-templates'
import { listMealTemplates, type MealTemplateMatch } from '../template-lookup'
import type { DayTemplate } from '../types'

const { draft } = defineProps<{
  /** A clone to start from, or nothing for a day built from scratch. */
  draft?: DayTemplate
}>()

const emit = defineEmits<{ saved: [template: DayTemplate]; cancel: [] }>()

const name = ref(draft?.name ?? '')
/** Meal template ids in the order they are eaten. Repeats are the user's call. */
const meals = ref<string[]>([...(draft?.mealTemplateIds ?? [])])

const available = ref<MealTemplateMatch[]>([])
const adding = ref('')

onMounted(async () => {
  available.value = await listMealTemplates()
  adding.value = available.value[0]?.template.id ?? ''
})

const names = computed(
  () => new Map(available.value.map((match) => [match.template.id, match.template.name])),
)

/**
 * A meal the day names that is not in the list — deleted since, or built on
 * another device. Shown by id rather than dropped: the day is the user's
 * record of what they eat, and quietly shortening it is the §3 mistake in
 * another place.
 */
const mealName = (id: string) => names.value.get(id) ?? `${id} (no longer saved)`

function add() {
  if (adding.value) meals.value.push(adding.value)
}

const problems = computed(() => {
  const found: string[] = []

  if (name.value.trim().length === 0) found.push('The day needs a name.')
  if (meals.value.length === 0) found.push('A day needs at least one meal.')

  return found
})

const canSave = computed(() => problems.value.length === 0)

async function save() {
  if (!canSave.value) return

  const template: DayTemplate = {
    // A clone keeps the id cloneDayTemplate already gave it; a day built from
    // scratch gets one here. Either way it is new — this form never edits a
    // stored day in place (#101).
    id: draft?.id ?? crypto.randomUUID(),
    name: name.value.trim(),
    mealTemplateIds: [...meals.value],
  }

  await dayTemplates.put(template)
  emit('saved', template)
}
</script>

<template>
  <section class="card">
    <p class="hint">
      A day is the meals you normally eat together. Running it walks each one through the usual
      builder, so the amounts are still yours to confirm.
    </p>

    <div class="row">
      <label for="day-name">Name</label>
      <input id="day-name" v-model="name" type="text" autocomplete="off" placeholder="Workday" />
    </div>

    <ol v-if="meals.length > 0" class="meals">
      <li v-for="(id, index) in meals" :key="`${id}-${index}`">
        <span class="meal-name">{{ mealName(id) }}</span>

        <span class="meal-actions">
          <button
            type="button"
            class="ghost small"
            :disabled="index === 0"
            :aria-label="`Move ${mealName(id)} earlier`"
            @click="meals = moveMeal(meals, index, index - 1)"
          >
            ↑
          </button>
          <button
            type="button"
            class="ghost small"
            :disabled="index === meals.length - 1"
            :aria-label="`Move ${mealName(id)} later`"
            @click="meals = moveMeal(meals, index, index + 1)"
          >
            ↓
          </button>
          <button
            type="button"
            class="ghost small"
            :aria-label="`Remove ${mealName(id)}`"
            @click="meals.splice(index, 1)"
          >
            Remove
          </button>
        </span>
      </li>
    </ol>

    <div class="row">
      <label for="day-add-meal">Add</label>
      <span class="adding">
        <select id="day-add-meal" v-model="adding">
          <option v-for="match in available" :key="match.template.id" :value="match.template.id">
            {{ match.template.name }}
          </option>
        </select>
        <button type="button" class="ghost small" :disabled="!adding" @click="add">Add meal</button>
      </span>
    </div>

    <div class="footer">
      <!-- A blocked save always names what is missing. -->
      <p v-if="problems.length > 0" class="problem" role="status">{{ problems.join(' · ') }}</p>

      <button type="button" class="ghost" @click="emit('cancel')">Cancel</button>
      <button type="button" :disabled="!canSave" @click="save">Save the day</button>
    </div>
  </section>
</template>

<style scoped>
.card {
  display: grid;
  gap: var(--space-4);
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius-card);
  padding: var(--space-5);
}

.hint,
.problem {
  margin: 0;
  font-size: var(--text-caption);
}

.hint {
  color: var(--ink-soft);
}

.problem {
  margin-right: auto;
  color: var(--status-under);
}

.row {
  display: grid;
  grid-template-columns: 5rem 1fr;
  align-items: center;
  gap: var(--space-3);
}

label {
  color: var(--ink-soft);
  font-size: var(--text-caption);
  letter-spacing: var(--tracking-eyebrow);
  text-transform: uppercase;
}

input[type='text'],
select {
  font: inherit;
  color: var(--ink);
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius-control);
  padding: var(--space-2) var(--space-3);
  min-width: 0;
}

.adding {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-width: 0;
}

.adding select {
  flex: 1;
  min-width: 0;
}

.meals {
  display: grid;
  gap: var(--space-2);
  margin: 0;
  padding: 0;
  list-style: none;
  counter-reset: meal;
}

.meals li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-3) 0;
  border-top: 1px solid var(--line);
}

/* The order is the feature, so it is numbered rather than merely stacked. */
.meal-name::before {
  counter-increment: meal;
  content: counter(meal) '. ';
  color: var(--ink-soft);
  font-feature-settings: var(--figures-tabular);
}

.meal-actions {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--space-3);
  flex-wrap: wrap;
  padding-top: var(--space-4);
  border-top: 1px solid var(--line);
}

button {
  font: inherit;
  font-weight: var(--weight-medium);
  color: var(--surface);
  background: var(--primary);
  border: none;
  border-radius: var(--radius-pill);
  padding: var(--space-2) var(--space-5);
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

/* Secondary: §15 reserves the filled pill for the primary action on a surface. */
.ghost {
  color: var(--ink-soft);
  background: none;
  border: 1px solid var(--line);
}

.ghost:hover:not(:disabled) {
  color: var(--ink);
  background: none;
  border-color: var(--ink-soft);
}

.small {
  font-size: var(--text-caption);
  padding: var(--space-1) var(--space-3);
}
</style>
