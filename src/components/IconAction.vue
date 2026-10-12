<script setup lang="ts">
// A 44px icon-only button for a row's actions (Edit, Copy, Remove). The icon
// goes in the slot and stays decorative: the accessible name is the caller's
// aria-label, title is only the tooltip, and aria-expanded / @click fall
// through to the button.
defineProps<{ variant?: 'edit' | 'danger' }>()
</script>

<template>
  <button type="button" class="icon-action" :class="variant">
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

/* Edit keeps the neutral hover's dark icon and swaps only the fill, so the
   icon stays --ink on --edit-tint (9.82:1 light, 7.73:1 dark). An open editor
   (aria-expanded) gets the same fill, so touch, which has no hover, shows it. */
.icon-action.edit:hover,
.icon-action.edit[aria-expanded='true'] {
  background: var(--edit-tint);
}

/* Colour is a second signal, never the only one (§15): the aria-label and
   tooltip name the action, and some callers add a confirm step on top. */
.icon-action.danger:hover {
  color: var(--surface);
  background: var(--status-under);
}
</style>
