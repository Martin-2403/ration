<script setup lang="ts"></script>

<template>
  <!-- Still unstyled beyond the element defaults in theme/base.css. The real
       shell — cards, dividers, line-arrow rows (§15) — arrives with layer 1,
       when there is actual content to lay out. -->
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
