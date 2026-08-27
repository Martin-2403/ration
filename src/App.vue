<script setup lang="ts"></script>

<template>
  <nav>
    <RouterLink to="/">Today</RouterLink>
    <RouterLink to="/evaluation">Evaluation</RouterLink>
    <RouterLink to="/supplements">Supplements</RouterLink>
    <RouterLink to="/settings">Settings</RouterLink>
  </nav>

  <main>
    <RouterView />
  </main>
</template>

<style scoped>
nav {
  display: flex;
  gap: var(--space-5);
  padding: var(--space-4);
  background: var(--surface);
  border-bottom: 1px solid var(--line);
}

a {
  color: var(--ink-soft);
  text-decoration: none;
  font-size: var(--text-caption);
  font-weight: var(--weight-medium);
  letter-spacing: var(--tracking-eyebrow);
  text-transform: uppercase;
  transition: color var(--motion-fast) var(--ease-out);
}

a:hover {
  color: var(--ink);
}

/* The current view is marked by weight and colour together, never colour alone
   (§15) — router-link-active is applied by vue-router. */
a.router-link-active {
  color: var(--primary);
  font-weight: var(--weight-semibold);
}
</style>
