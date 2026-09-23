<script setup lang="ts">
/**
 * Building a meal template (§7, #96).
 *
 * §7's slot model is the point: a slot names a part of the meal, holds the
 * foods that can fill it, and carries a default amount. One option makes the
 * slot fixed, several make it a dropdown at log time — which is what lets one
 * template cover porridge with oat drink and porridge with milk.
 *
 * Food choice reuses FoodPicker in `choose` mode (#51), so every food already
 * reachable for logging is reachable here too.
 */
import { computed, onMounted, ref } from 'vue'

import { mealTemplates } from '../db'
import { findFoods } from '../food-lookup'
import { parseAmount } from '../parse-amount'
import type { Food, MealSlot, MealTemplate } from '../types'
import FoodPicker from './FoodPicker.vue'

const emit = defineEmits<{ saved: [template: MealTemplate]; cancel: [] }>()

interface DraftSlot {
  label: string
  /** Food ids. One makes the slot fixed, several make it a choice (§7). */
  options: string[]
  defaultOptionId: string
  /** Typed, not a number: the field is text and we parse it (see parse-amount.ts). */
  grams: string
}

const blankSlot = (): DraftSlot => ({ label: '', options: [], defaultOptionId: '', grams: '100' })

const name = ref('')
const slots = ref<DraftSlot[]>([blankSlot()])

/** Names for the chosen food ids, so a slot shows more than a uuid. */
const foods = ref(new Map<string, Food>())

/** Which slot is currently choosing a food, if any. */
const pickingFor = ref<number | undefined>(undefined)

/**
 * The id this form will save under, decided once.
 *
 * Minting it inside save() made every call a different meal, so two taps on
 * the button stored two copies of the same thing; a retry after a failed write
 * would have done the same.
 */
const id = crypto.randomUUID()

/** True while a write is in flight, so a second tap cannot start another. */
const saving = ref(false)

onMounted(() => {
  // Nothing to resolve on a blank form; kept so a future prefill path (#52's
  // clone) has somewhere to load into.
  foods.value = new Map()
})

const foodName = (id: string) => foods.value.get(id)?.name ?? id

async function choose(food: Food) {
  const index = pickingFor.value
  if (index === undefined) return

  const slot = slots.value[index]!

  // Adding the same food twice would render a dropdown with two identical
  // entries; the second choice is simply the same choice.
  if (!slot.options.includes(food.id)) slot.options.push(food.id)
  if (!slot.defaultOptionId) slot.defaultOptionId = food.id

  foods.value = await findFoods(slots.value.flatMap((s) => s.options))
  pickingFor.value = undefined
}

function removeOption(index: number, id: string) {
  const slot = slots.value[index]!
  slot.options = slot.options.filter((option) => option !== id)

  // A default that is no longer an option would resolve to nothing at log time.
  if (slot.defaultOptionId === id) slot.defaultOptionId = slot.options[0] ?? ''
}

const amounts = computed(() => slots.value.map((slot) => parseAmount(slot.grams)))

/** Slots that cannot be turned into a MealSlot yet, with the reason. */
const problems = computed(() =>
  slots.value.flatMap((slot, index) => {
    const amount = amounts.value[index]
    const where = slot.label.trim() || `Slot ${index + 1}`

    if (slot.label.trim().length === 0) return [`${where} needs a name`]
    if (slot.options.length === 0) return [`${where} needs at least one food`]
    if (amount?.kind !== 'number' || amount.value <= 0) return [`${where} needs an amount`]

    return []
  }),
)

const canSave = computed(
  () => name.value.trim().length > 0 && problems.value.length === 0 && !saving.value,
)

async function save() {
  if (!canSave.value) return

  saving.value = true

  const template: MealTemplate = {
    id,
    name: name.value.trim(),
    slots: slots.value.map((slot, index): MealSlot => {
      const amount = amounts.value[index]

      return {
        // A uuid rather than a slug of the label: LogItem references slot ids,
        // so renaming a slot must not change its id, and a slug invites
        // exactly that.
        id: crypto.randomUUID(),
        label: slot.label.trim(),
        // Derived, never asked for — two sources of the same truth is how they
        // drift (§7).
        kind: slot.options.length > 1 ? 'variable' : 'fixed',
        options: [...slot.options],
        defaultOptionId: slot.defaultOptionId,
        // canSave has already refused anything else; the fallback keeps the
        // type honest rather than asserting past it.
        defaultGrams: amount?.kind === 'number' ? amount.value : 0,
      }
    }),
  }

  try {
    await mealTemplates.put(template)
    emit('saved', template)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <section class="card">
    <template v-if="pickingFor !== undefined">
      <button type="button" class="back" @click="pickingFor = undefined">← Back to the meal</button>
      <FoodPicker purpose="choose" @select="choose" />
    </template>

    <template v-else>
      <p class="hint">
        A slot is one part of the meal. Give it more than one food and you can pick between them
        each time you log it.
      </p>

      <div class="row">
        <label for="template-name">Name</label>
        <input id="template-name" v-model="name" type="text" autocomplete="off" />
      </div>

      <div v-for="(slot, index) in slots" :key="index" class="slot">
        <div class="row">
          <label :for="`slot-${index}-label`">Slot</label>
          <input
            :id="`slot-${index}-label`"
            v-model="slot.label"
            type="text"
            autocomplete="off"
            placeholder="Base, Liquid, Fruit…"
          />
        </div>

        <ul v-if="slot.options.length > 0" class="options">
          <li v-for="id in slot.options" :key="id">
            <label>
              <!-- Which food fills the slot unless changed at log time (§7). -->
              <input
                v-model="slot.defaultOptionId"
                type="radio"
                :value="id"
                :name="`slot-${index}-default`"
              />
              {{ foodName(id) }}
            </label>
            <button type="button" class="ghost small" @click="removeOption(index, id)">
              Remove
            </button>
          </li>
        </ul>

        <div class="row">
          <label :for="`slot-${index}-grams`">Usually</label>
          <span class="amount">
            <input
              :id="`slot-${index}-grams`"
              v-model="slot.grams"
              type="text"
              inputmode="decimal"
              autocomplete="off"
              :aria-invalid="amounts[index]?.kind === 'not-a-number' || undefined"
            />
            g
          </span>
        </div>

        <div class="slot-actions">
          <button type="button" class="ghost small" @click="pickingFor = index">Add a food</button>
          <button
            v-if="slots.length > 1"
            type="button"
            class="ghost small"
            @click="slots.splice(index, 1)"
          >
            Remove slot
          </button>
        </div>
      </div>

      <button type="button" class="ghost" @click="slots.push(blankSlot())">Add a slot</button>

      <div class="footer">
        <!-- A blocked save always names what is missing and where. -->
        <p v-if="name.trim().length === 0" class="problem" role="status">The meal needs a name.</p>
        <p v-else-if="problems.length > 0" class="problem" role="status">
          {{ problems.join(' · ') }}
        </p>

        <button type="button" class="ghost" @click="emit('cancel')">Cancel</button>
        <button type="button" :disabled="!canSave" @click="save">Save the meal</button>
      </div>
    </template>
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

input[type='text'] {
  font: inherit;
  color: var(--ink);
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius-control);
  padding: var(--space-2) var(--space-3);
  min-width: 0;
}

input[aria-invalid='true'] {
  border-color: var(--status-under);
}

.amount {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  color: var(--ink-soft);
}

.amount input {
  width: 5rem;
  text-align: right;
  font-feature-settings: var(--figures-tabular);
}

.slot {
  display: grid;
  gap: var(--space-3);
  padding: var(--space-4) 0;
  border-top: 1px solid var(--line);
}

.options {
  display: grid;
  gap: var(--space-1);
  margin: 0;
  padding: 0;
  list-style: none;
}

.options li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
}

.options label {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  color: var(--ink);
  font-size: var(--text-body);
  letter-spacing: normal;
  text-transform: none;
}

.slot-actions,
.footer {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  flex-wrap: wrap;
}

.footer {
  justify-content: flex-end;
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

.back {
  justify-self: start;
  color: var(--ink-soft);
  background: none;
  border: none;
  padding: 0;
}

.back:hover {
  color: var(--ink);
  background: none;
}
</style>
