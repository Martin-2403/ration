<script setup lang="ts">
/**
 * The one place anything gets logged from (§15, #53).
 *
 * Not a native <dialog>: jsdom 29 implements no HTMLDialogElement, so
 * showModal, Escape handling and the focus trap would all be beyond the reach of
 * the suite — and §15's accessibility floor is exactly the part that must not go
 * untested. The modal behaviour here is therefore explicit: focus moves in on
 * open and back to the trigger on close, Escape closes, and Tab wraps inside the
 * panel. Swap in <dialog> once jsdom supports it and delete all of this.
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

import { useLogStore } from '../stores/log'
import type { Food, MealTemplate } from '../types'
import FoodForm from './FoodForm.vue'
import MealBuilder from './MealBuilder.vue'

const { templates } = defineProps<{ templates: MealTemplate[] }>()
const emit = defineEmits<{ close: [] }>()

const store = useLogStore()

/** Which surface is showing. The list is the entry point; a choice replaces it. */
const choice = ref<{ kind: 'template'; template: MealTemplate } | { kind: 'food' } | undefined>()

const heading = computed(() => {
  if (!choice.value) return 'Log something'

  return choice.value.kind === 'food' ? 'A food by hand' : choice.value.template.name
})

const panel = ref<HTMLElement>()
let previouslyFocused: HTMLElement | null = null

const focusable = () =>
  Array.from(
    panel.value?.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ) ?? [],
  )

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    emit('close')

    return
  }

  if (event.key !== 'Tab') return

  const items = focusable()
  const first = items[0]
  const last = items[items.length - 1]
  if (!first || !last) return

  // Wrapping by hand, because nothing here is inert to the browser's own tab
  // order. Without it, Tab walks out of the panel into the page behind it.
  const active = document.activeElement
  if (event.shiftKey && (active === first || active === panel.value)) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && active === last) {
    event.preventDefault()
    first.focus()
  }
}

// The sheet is mounted only while open, so mount and unmount are open and
// close — including the focus restore, which has to survive any route away.
onMounted(() => {
  previouslyFocused = document.activeElement as HTMLElement | null
  panel.value?.focus()
  document.addEventListener('keydown', onKeydown)
})

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeydown)
  previouslyFocused?.focus()
})

async function logFood(food: Food, grams: number) {
  await store.logFood(food, grams)
  emit('close')
}
</script>

<template>
  <div class="scrim" @click.self="emit('close')">
    <section
      ref="panel"
      class="panel"
      role="dialog"
      aria-modal="true"
      aria-labelledby="log-sheet-heading"
      tabindex="-1"
    >
      <header>
        <button
          v-if="choice"
          type="button"
          class="ghost"
          aria-label="Back to the list"
          @click="choice = undefined"
        >
          ←
        </button>
        <h2 id="log-sheet-heading">{{ heading }}</h2>
        <button type="button" class="ghost" aria-label="Close" @click="emit('close')">✕</button>
      </header>

      <!-- The list is the point of the sheet: one home for everything that adds
           to the day, so a picker (#40), a day template (#52) and a barcode
           scan (#15) each land here rather than growing the Today screen. -->
      <ul v-if="!choice" class="options">
        <li v-for="template in templates" :key="template.id">
          <button type="button" @click="choice = { kind: 'template', template }">
            {{ template.name }}
            <span class="detail">Meal template</span>
          </button>
        </li>
        <li>
          <button type="button" @click="choice = { kind: 'food' }">
            A food by hand
            <span class="detail">Type in the values yourself</span>
          </button>
        </li>
      </ul>

      <MealBuilder
        v-else-if="choice.kind === 'template'"
        :template="choice.template"
        @logged="emit('close')"
      />

      <FoodForm v-else @submit="logFood" />
    </section>
  </div>
</template>

<style scoped>
.scrim {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  background: rgb(0 0 0 / 55%);
  padding: var(--space-4);
  overflow-y: auto;
}

/* Bottom-anchored on a phone, centred once there is room — the thumb is at the
   bottom of the screen and this is the most-used control in the app. */
@media (min-width: 40rem) {
  .scrim {
    align-items: center;
  }
}

.panel {
  width: 100%;
  max-width: 40rem;
  max-height: 100%;
  overflow-y: auto;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius-card);
  padding: var(--space-5);
}

/* The panel is already a surface, so a form inside it must not draw a second
   box within the first. */
.panel :deep(.card) {
  background: none;
  border: none;
  border-radius: 0;
  padding: 0;
}

.panel:focus-visible {
  outline: var(--focus-ring-width) solid var(--focus-ring-color);
  outline-offset: var(--focus-ring-offset);
}

header {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  margin-bottom: var(--space-4);
}

h2 {
  flex: 1;
  margin: 0;
  font-size: var(--text-section);
  font-weight: var(--weight-medium);
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
  background: none;
  border: 1px solid var(--line);
  border-radius: var(--radius-control);
  padding: var(--space-3) var(--space-4);
  cursor: pointer;
  transition: border-color var(--motion-fast) var(--ease-out);
}

.options button:hover {
  border-color: var(--primary);
}

.detail {
  font-size: var(--text-caption);
  color: var(--ink-soft);
}

button.ghost {
  font: inherit;
  color: var(--ink-soft);
  background: none;
  border: 1px solid var(--line);
  border-radius: var(--radius-control);
  padding: var(--space-1) var(--space-3);
  cursor: pointer;
}

button.ghost:hover {
  color: var(--ink);
  border-color: var(--ink-soft);
}
</style>
