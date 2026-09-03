<script setup lang="ts">
/**
 * The app's primary navigation (§15, #60).
 *
 * One `<nav>` in two layouts: a bottom tab bar on a phone, a top bar on
 * anything wider. Two layouts of one list rather than two nav elements with one
 * hidden — a second landmark gets announced whether or not it is visible.
 *
 * Below 30rem the labels go and the icons stand alone. That is where they
 * actually stop fitting: five tabs at 375px leave about 68px each, and
 * "Supplements" does not shorten into that without becoming nonsense.
 */
import { CalendarDays, ChartColumn, Pill, Plus, Settings, type LucideIcon } from '@lucide/vue'

interface Tab {
  to: string
  label: string
  icon: LucideIcon
}

// Ordered as the daily loop runs — read the day, log something, then the
// long-term view — with the two configuration tabs after it.
const tabs: Tab[] = [
  { to: '/', label: 'Day', icon: CalendarDays },
  { to: '/log', label: 'Log', icon: Plus },
  { to: '/evaluation', label: 'Evaluation', icon: ChartColumn },
  { to: '/supplements', label: 'Supplements', icon: Pill },
  { to: '/settings', label: 'Settings', icon: Settings },
]
</script>

<template>
  <nav aria-label="Primary">
    <!-- The name is on the link rather than left to the text, because the text
         is hidden below 30rem and the icon is decorative — without it a screen
         reader would be reading out the href. RouterLink contributes
         aria-current="page" itself, on the exactly-matching route. -->
    <RouterLink v-for="tab in tabs" :key="tab.to" :to="tab.to" :aria-label="tab.label">
      <component :is="tab.icon" :size="20" :stroke-width="1.5" aria-hidden="true" />
      <span class="label">{{ tab.label }}</span>
    </RouterLink>
  </nav>
</template>

<style scoped>
/* Sticky, not fixed: as the last child of a shell that is at least a viewport
   tall, it stays pinned to the bottom for the whole scroll while remaining in
   the flow — so no view needs padding to avoid ending up underneath it. */
nav {
  position: sticky;
  bottom: 0;
  /* Below <main> on screen, above it in the DOM: the primary navigation is what
     a screen reader should meet first. */
  order: 1;
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  background: var(--surface);
  border-top: 1px solid var(--line);
  /* Clear of the home indicator once the app is installed (§10). */
  padding-bottom: env(safe-area-inset-bottom, 0px);
}

a {
  position: relative;
  display: grid;
  justify-items: center;
  align-content: center;
  gap: var(--space-1);
  /* 44px in both directions — the floor for a touch target (§15). Width only
     binds in the top-bar layout, where a column is as wide as "Day" needs. */
  min-width: 2.75rem;
  min-height: 2.75rem;
  padding: var(--space-2) var(--space-1);
  color: var(--ink-soft);
  text-decoration: none;
  font-size: var(--text-caption);
  font-weight: var(--weight-medium);
  transition: color var(--motion-fast) var(--ease-out);
}

a:hover {
  color: var(--ink);
}

/* Icon-only below 30rem. The accessible name is on the link, so hiding this
   costs pixels and nothing else. */
.label {
  display: none;
}

/* Colour, weight and an indicator bar together. Weight cannot carry this on its
   own here: with the labels hidden there is no text left to embolden, which
   would leave colour doing the work alone (§15). */
a.router-link-active {
  color: var(--primary);
  font-weight: var(--weight-semibold);
}

a.router-link-active::after {
  content: '';
  position: absolute;
  /* On the edge that faces the content — the top edge of a bottom bar. */
  inset: 0 var(--space-3) auto;
  height: 2px;
  border-radius: var(--radius-pill);
  background: var(--primary);
}

/* Wide enough for the labels, which is also wide enough that a bottom bar stops
   making sense: the same list becomes a top bar. */
@media (min-width: 30rem) {
  nav {
    order: 0;
    top: 0;
    bottom: auto;
    /* Content-width columns packed to the left, rather than five stretched
       fifths of a desktop window. */
    grid-template-columns: repeat(5, auto);
    justify-content: start;
    gap: var(--space-2);
    padding: 0 var(--space-4);
    border-top: none;
    border-bottom: 1px solid var(--line);
  }

  a {
    padding: var(--space-3) var(--space-2);
  }

  .label {
    display: revert;
  }

  a.router-link-active::after {
    inset: auto 0 0;
  }
}
</style>
