<script setup lang="ts">
import AppNav from './components/AppNav.vue'
</script>

<template>
  <AppNav />

  <main>
    <RouterView />
  </main>
</template>

<style scoped>
/* Takes up the slack in the shell, so the nav sits at the bottom of the screen
   even when a view is shorter than the viewport. min-width stops a wide row or
   an unbroken word from stretching the column past the screen edge. */
main {
  flex: 1;
  min-width: 0;
}
</style>
