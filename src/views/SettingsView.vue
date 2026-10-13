<script setup lang="ts">
import { nextTick, onMounted } from 'vue'
import { useRoute } from 'vue-router'

import { BACKUP_SECTION_HASH } from '../backup/nudge'
import BackupExport from '../components/BackupExport.vue'
import BackupRestore from '../components/BackupRestore.vue'
import GoalForm from '../components/GoalForm.vue'
import StoragePanel from '../components/StoragePanel.vue'

const route = useRoute()

/**
 * Arriving from the backup prompt (#147): bring the export form into view and put
 * the cursor in its first field, so the passphrase is the next thing to do.
 */
onMounted(async () => {
  if (route.hash !== BACKUP_SECTION_HASH) return

  await nextTick()
  document.getElementById('backup-passphrase')?.focus()
})
</script>

<template>
  <div class="page">
    <h1>Settings</h1>

    <GoalForm />

    <StoragePanel>
      <BackupExport />
      <BackupRestore />
    </StoragePanel>
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
