<script setup lang="ts">
/**
 * The one place anything is logged from (#53, #62).
 *
 * A route rather than the overlay it started as: an overlay needed a focus
 * trap, Escape handling and an inert page behind it, all hand-rolled because
 * jsdom implements no <dialog>. A route needs none of that.
 *
 * The date is explicit here. It used to be inferred from whichever day the
 * summary screen happened to be showing, which meant viewing the 27th and
 * logging wrote the entry against today without saying so (#61).
 */
import { computed, onMounted, ref } from 'vue'

import DayRunner from '../components/DayRunner.vue'
import DayTemplateForm from '../components/DayTemplateForm.vue'
import FoodForm from '../components/FoodForm.vue'
import FoodPicker from '../components/FoodPicker.vue'
import MealBuilder from '../components/MealBuilder.vue'
import MealTemplateForm from '../components/MealTemplateForm.vue'
import { localMiddayFromISODate, toISODate } from '../dates'
import { cloneDayTemplate, listDayTemplates } from '../day-templates'
import { useLogStore } from '../stores/log'
import { listMealTemplates, type MealTemplateMatch } from '../template-lookup'
import type { DayTemplate, Food, MealTemplate } from '../types'

const store = useLogStore()

/**
 * Seeds and stored templates together (§13, #96). Read rather than imported:
 * this used SEED_TEMPLATES directly, so a template the user built was as
 * unreachable as a saved food was before #40.
 */
const templates = ref<MealTemplateMatch[]>([])

async function loadTemplates() {
  templates.value = await listMealTemplates()
}

/** Days have no seed path, so this is the store's list and nothing else (#52). */
const days = ref<DayTemplate[]>([])

async function loadDays() {
  days.value = await listDayTemplates()
}

onMounted(() => Promise.all([loadTemplates(), loadDays()]))

/**
 * Defaults to today on every visit rather than remembering the last pick. A
 * remembered date is the same trap as #61 from the other direction: come back an
 * hour later, log lunch, and it lands silently on a day chosen long ago.
 */
const date = ref(toISODate())

/** Future dates are refused: an entry that has not happened is a plan, not intake. */
const today = toISODate()

const choice = ref<
  | { kind: 'template'; template: MealTemplate }
  /** The saved days, one step in, and then one of them running (#52). */
  | { kind: 'days' }
  | { kind: 'day'; template: DayTemplate }
  /** Composing a day, either from nothing or from a copy of an existing one. */
  | { kind: 'new-day'; draft?: DayTemplate }
  | { kind: 'food' }
  | { kind: 'stored' }
  /** Cloning or correcting: pick a source, then the form prefilled from it (#51). */
  | { kind: 'variation'; source?: Food }
  /** The list of saved meals, one step in from the options (#98). */
  | { kind: 'meals' }
  /** Building a meal template rather than logging one (#96). */
  | { kind: 'new-template' }
  | undefined
>()
const logged = ref<{ name: string; date: string } | undefined>()

const validDate = computed(() => localMiddayFromISODate(date.value) !== undefined)

/**
 * The timestamp to record, or undefined for today.
 *
 * Undefined is not a gap: every logging path already defaults to the moment of
 * the write, which is exactly right for today and keeps the day's log reading as
 * a timeline. Handing down a "now" computed here instead would freeze the time
 * the screen opened, so a meal logged ten minutes later would carry the wrong
 * one. Any other day lands at midday, where a time of day would mean nothing.
 */
const backdatedTo = computed(() =>
  date.value === today ? undefined : localMiddayFromISODate(date.value),
)

function finish(name: string) {
  logged.value = { name, date: date.value }
  choice.value = undefined
}

/**
 * A saved template goes straight into the builder rather than back to the list:
 * someone who just described a meal is describing it because they are eating
 * it, and the list would make them find it again.
 */
async function savedTemplate(template: MealTemplate) {
  await loadTemplates()
  choice.value = { kind: 'template', template }
}

/**
 * What a finished day says, given how much of it was actually logged — a day
 * whose lunch was skipped did not log the day.
 *
 * Reads the running day off `choice` rather than taking it as an argument: a
 * template expression cannot narrow the union inside an event handler, and the
 * alternative is a ternary in the markup.
 */
function finishDay(count: number) {
  const current = choice.value
  const name = current?.kind === 'day' ? current.template.name : 'the day'

  finish(`${count} meal(s) from ${name}`)
}

/** Same reasoning for a day: whoever just described one is about to eat it. */
async function savedDay(template: DayTemplate) {
  await loadDays()
  choice.value = { kind: 'day', template }
}

/**
 * One step out rather than all the way out.
 *
 * With the meals behind an entry of their own (#98) a single coarse back button
 * throws away two steps at once, and the variation flow had no way back to the
 * picker at all once a source was chosen — pick the wrong food and the only
 * route was out to the options, losing everything typed (#95).
 */
function goBack() {
  const current = choice.value

  if (current?.kind === 'template' || current?.kind === 'new-template') {
    choice.value = { kind: 'meals' }
  } else if (current?.kind === 'day' || current?.kind === 'new-day') {
    choice.value = { kind: 'days' }
  } else if (current?.kind === 'variation' && current.source) {
    choice.value = { kind: 'variation' }
  } else {
    choice.value = undefined
  }
}

/**
 * A count and the first couple of names. Naming them all would reintroduce the
 * unbounded growth this entry exists to contain, one line further down.
 */
const summarise = (names: string[]) => {
  const shown = names.slice(0, 2).join(', ')

  return `${names.length} saved${shown ? ` · ${shown}` : ''}${names.length > 2 ? '…' : ''}`
}

const mealsSummary = computed(() => summarise(templates.value.map((match) => match.template.name)))

/** Nothing ships, so an empty list is the normal first state, not a fault. */
const daysSummary = computed(() =>
  days.value.length === 0
    ? 'None yet · build one from your meals'
    : summarise(days.value.map((template) => template.name)),
)

const backLabel = computed(() => {
  const current = choice.value

  if (current?.kind === 'template' || current?.kind === 'new-template') return '← Other meals'
  if (current?.kind === 'day' || current?.kind === 'new-day') return '← Other days'
  if (current?.kind === 'variation' && current.source) return '← Other foods'

  return '← Everything else'
})

async function logFood(food: Food, grams: number) {
  if (!validDate.value) return

  // Same reasoning as backdatedTo: today falls through to the store's own
  // default, which stamps the write time rather than a stale one.
  await store.logFood(food, grams, backdatedTo.value ?? Date.now())
  finish(food.name)
}
</script>

<template>
  <div class="page">
    <h1>Log</h1>

    <section class="card">
      <div class="row">
        <label for="log-date">Eaten on</label>
        <input id="log-date" v-model="date" type="date" :max="today" />
      </div>

      <p v-if="!validDate" class="problem" role="status">Pick a date before logging.</p>
      <p v-else-if="date !== today" class="note">Logging against {{ date }}, not today.</p>
    </section>

    <p v-if="logged" class="confirmation" role="status">
      Logged {{ logged.name }} on {{ logged.date }}.
      <RouterLink to="/">See the day</RouterLink>
    </p>

    <template v-if="validDate">
      <!-- One home for everything that adds to a day, so a picker (#40), a
           clone (#51) and a barcode scan (#15) each become an entry here
           rather than another block on the summary screen. -->
      <ul v-if="!choice" class="options">
        <li>
          <!-- Above the meals because a day is made of them, and because
               reaching for the whole day is the shortcut worth finding
               first (#52). -->
          <button type="button" @click="choice = { kind: 'days' }">
            A usual day
            <span class="detail">{{ daysSummary }}</span>
          </button>
        </li>
        <li>
          <!-- One entry rather than one per template: a meal is a thing and the
               rest of this list is verbs, and the templates grow without limit
               while the actions do not — at a dozen saved meals they pushed
               every action off the screen (#98). -->
          <button type="button" @click="choice = { kind: 'meals' }">
            A meal
            <span class="detail">{{ mealsSummary }}</span>
          </button>
        </li>
        <li>
          <!-- Above hand entry on purpose: reaching for the form first is what
               fills the cache with copies of the same apple (#40). -->
          <button type="button" @click="choice = { kind: 'stored' }">
            A food you have already
            <span class="detail">Search what is saved</span>
          </button>
        </li>
        <li>
          <button type="button" @click="choice = { kind: 'variation' }">
            A variation of a food
            <span class="detail">Copy one and change what differs</span>
          </button>
        </li>
        <li>
          <button type="button" @click="choice = { kind: 'food' }">
            A food by hand
            <span class="detail">Type in the values yourself</span>
          </button>
        </li>
      </ul>

      <template v-else>
        <button type="button" class="back" @click="goBack">{{ backLabel }}</button>

        <ul v-if="choice.kind === 'meals'" class="options">
          <li v-for="match in templates" :key="match.template.id">
            <button type="button" @click="choice = { kind: 'template', template: match.template }">
              {{ match.template.name }}
              <span class="detail">
                {{ match.origin === 'seed' ? 'Comes with the app' : 'Yours' }} ·
                {{ match.template.slots.length }} slot(s)
              </span>
            </button>
          </li>
          <li>
            <!-- Beside the meals it makes rather than at the end of the options:
                 noticing a meal is missing happens while looking for it (#96). -->
            <button type="button" @click="choice = { kind: 'new-template' }">
              Build a meal
              <span class="detail">Save a set of slots to log again later</span>
            </button>
          </li>
        </ul>

        <ul v-else-if="choice.kind === 'days'" class="options">
          <li v-for="template in days" :key="template.id" class="with-aside">
            <button type="button" @click="choice = { kind: 'day', template }">
              {{ template.name }}
              <span class="detail">{{ template.mealTemplateIds.length }} meal(s)</span>
            </button>
            <!-- Beside the day it copies: "like my workday, but" is how the
                 second one gets made (#52). -->
            <button
              type="button"
              class="aside"
              :aria-label="`Copy ${template.name}`"
              @click="
                choice = {
                  kind: 'new-day',
                  draft: cloneDayTemplate(template, `${template.name} (copy)`),
                }
              "
            >
              Copy
            </button>
          </li>
          <li>
            <button type="button" @click="choice = { kind: 'new-day' }">
              Build a day
              <span class="detail">Put your meals in the order you eat them</span>
            </button>
          </li>
        </ul>

        <DayRunner
          v-else-if="choice.kind === 'day'"
          :template="choice.template"
          :eaten-at="backdatedTo"
          @done="finishDay"
        />

        <DayTemplateForm
          v-else-if="choice.kind === 'new-day'"
          :draft="choice.draft"
          @saved="savedDay"
          @cancel="goBack"
        />

        <MealBuilder
          v-else-if="choice.kind === 'template'"
          :template="choice.template"
          :eaten-at="backdatedTo"
          @logged="finish(choice.kind === 'template' ? choice.template.name : '')"
        />

        <FoodPicker v-else-if="choice.kind === 'stored'" @submit="logFood" />

        <template v-else-if="choice.kind === 'variation'">
          <FoodPicker
            v-if="!choice.source"
            purpose="choose"
            @select="choice = { kind: 'variation', source: $event }"
          />
          <FoodForm v-else :source="choice.source" @submit="logFood" />
        </template>

        <MealTemplateForm
          v-else-if="choice.kind === 'new-template'"
          @saved="savedTemplate"
          @cancel="goBack"
        />

        <FoodForm v-else @submit="logFood" />
      </template>
    </template>
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

h1 {
  margin: 0;
  font-size: var(--text-section);
  font-weight: var(--weight-medium);
}

.card {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius-card);
  padding: var(--space-5);
}

.row {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

label {
  color: var(--ink-soft);
  font-size: var(--text-caption);
  letter-spacing: var(--tracking-eyebrow);
  text-transform: uppercase;
}

input {
  font: inherit;
  color: var(--ink);
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius-control);
  padding: var(--space-2) var(--space-3);
  font-feature-settings: var(--figures-tabular);
  transition: border-color var(--motion-fast) var(--ease-out);
}

input:hover {
  border-color: var(--ink-soft);
}

.options {
  display: grid;
  gap: var(--space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.options button {
  display: grid;
  gap: var(--space-1);
  width: 100%;
  font: inherit;
  text-align: left;
  color: var(--ink);
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius-control);
  padding: var(--space-4);
  cursor: pointer;
  transition: border-color var(--motion-fast) var(--ease-out);
}

.options button:hover {
  border-color: var(--primary);
}

/* A row that carries a second action beside its main one. */
.with-aside {
  display: flex;
  align-items: stretch;
  gap: var(--space-2);
}

.with-aside button:first-child {
  flex: 1;
  min-width: 0;
}

.options .aside {
  /* Flex, not the grid .options button uses: the label is alone here and
     belongs in the middle of a row as tall as the one beside it. */
  display: flex;
  align-items: center;
  width: auto;
  font-size: var(--text-caption);
  color: var(--ink-soft);
  padding: var(--space-2) var(--space-4);
}

.detail {
  font-size: var(--text-caption);
  color: var(--ink-soft);
}

.back {
  font: inherit;
  justify-self: start;
  font-size: var(--text-caption);
  color: var(--ink-soft);
  background: none;
  border: 1px solid var(--line);
  border-radius: var(--radius-pill);
  padding: var(--space-1) var(--space-3);
  cursor: pointer;
}

.back:hover {
  color: var(--ink);
  border-color: var(--ink-soft);
}

/* Paired with text, never colour alone (§15). */
.problem {
  margin: var(--space-3) 0 0;
  font-size: var(--text-caption);
  color: var(--status-under);
}

.note {
  margin: var(--space-3) 0 0;
  font-size: var(--text-caption);
  color: var(--ink-soft);
}

.confirmation {
  margin: 0;
  font-size: var(--text-caption);
  color: var(--ink-soft);
}

.confirmation a {
  color: var(--primary);
}
</style>
