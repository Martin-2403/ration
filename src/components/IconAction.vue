<script setup lang="ts">
// A 44px icon-only button for a row's actions (Edit, Copy, Remove). The icon
// goes in the slot and stays decorative: the accessible name is the caller's
// aria-label, title is only the tooltip, and aria-expanded / @click fall
// through to the button.
defineProps<{ danger?: boolean }>()
</script>

<template>
  <button type="button" class="icon-action" :class="{ danger }">
    <slot />
  </button>
</template>

<style scoped>
/* Icon only: the accessible name is on the button and the icon is decorative,
   the same split AppNav's tab icons use. This is a touch-first app, so title
   is a desktop bonus rather than the way anyone learns what the icon means.

   44px (2.75rem) is the touch-target floor AppNav documents, and several of
   these sit 4px apart in a row — tight enough that undercutting it invites
   mis-taps between Edit and Remove. */
.icon-action {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2.75rem;
  height: 2.75rem;
  color: var(--ink-soft);
  background: none;
  border: none;
  padding: 0;
  border-radius: var(--radius-control);
  cursor: pointer;
  transition:
    color var(--motion-fast) var(--ease-out),
    background-color var(--motion-fast) var(--ease-out);
}

.icon-action:hover {
  color: var(--ink);
  background: var(--primary-tint);
}

/* Colour is a second signal, never the only one (§15): the aria-label and
   tooltip name the action, and some callers add a confirm step on top. */
.icon-action.danger:hover {
  color: var(--surface);
  background: var(--status-under);
}
</style>
