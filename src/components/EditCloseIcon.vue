<script setup lang="ts">
/**
 * The edit affordance's icon: a Pencil when `open` is false, an X when true,
 * with a morph between them (#133). The paths are lucide's own Pencil and X
 * (`@lucide/vue`), inlined because one SVG has to animate between the two.
 *
 * Opening, in two phases: the pencil's outline and tip line fade out while two
 * strokes fade in at the pencil's long edges, a diagonal "="; then the strokes
 * swing and slide into the X. Closing runs the same phases backwards. The
 * strokes are hidden in the pencil state, so the resting shapes are exactly
 * lucide's. Purely decorative: the owning button carries the accessible name.
 *
 * Timing is `--motion-morph` (§15), which collapses to 1ms under
 * `prefers-reduced-motion` along with every delay derived from it.
 */
defineProps<{ open: boolean }>()
</script>

<template>
  <svg
    class="edit-close-icon"
    :class="{ 'is-open': open }"
    :data-state="open ? 'open' : 'closed'"
    xmlns="http://www.w3.org/2000/svg"
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.5"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    <path
      class="pencil"
      d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"
    />
    <path class="pencil" d="m15 5 4 4" />
    <path class="stroke stroke-a" d="M18 6 6 18" />
    <path class="stroke stroke-b" d="m6 6 12 12" />
  </svg>
</template>

<style scoped>
.edit-close-icon {
  flex: none;
}

.edit-close-icon path {
  transform-box: view-box;
  transform-origin: 12px 12px;
  transition-timing-function: var(--ease-out);
  transition-duration: calc(var(--motion-morph) / 2);
}

/* Closed (pencil): X strokes rest as the pencil's long edges, invisible. */
.stroke {
  opacity: 0;
}
.stroke-a {
  transform: translate(-2px, -2px);
}
.stroke-b {
  transform: translate(2px, 2px) rotate(90deg);
}
.pencil {
  opacity: 1;
}
.stroke,
.pencil {
  transition-property: transform, opacity;
}

/* Closing: strokes leave the X first, then the pencil appears from the "=". */
.stroke,
.pencil {
  transition-delay: 0s, calc(var(--motion-morph) / 2);
}

/* Open (X): the pencil gives way to the "=", then the strokes become the X. */
.is-open .stroke {
  opacity: 1;
  transform: none;
  transition-delay: calc(var(--motion-morph) / 2), 0s;
}
.is-open .pencil {
  opacity: 0;
  transition-delay: 0s, 0s;
}
</style>
