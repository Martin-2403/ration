<script setup lang="ts"></script>

<template>
  <!-- Unstyled on purpose: theme/tokens.css (§15) is not written yet, and
       styling this before the tokens exist would mean hardcoding values the
       tokens are meant to own. -->
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
