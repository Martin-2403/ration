<script setup lang="ts">
import GoalForm from '../components/GoalForm.vue'
</script>

<template>
  <div class="page">
    <h1>Settings</h1>

    <GoalForm />
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
</style>
