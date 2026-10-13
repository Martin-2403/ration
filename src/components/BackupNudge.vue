<script setup lang="ts">
/**
 * The prompt shown right after something is logged (#147): a banner, not a modal,
 * and never in the way of logging. It asks; it does not claim the data is safe or
 * that it is about to be lost. Whether and how it asks is decided in
 * backup/nudge.ts, which is where its cadence is tuned.
 *
 * "Back up now" cannot be literally one tap: the backup is encrypted with a
 * passphrase the user has to type, and a phone only opens the share sheet from a
 * fresh tap. So it takes them to the export form with the passphrase field
 * focused, which is as short as the platform allows.
 */
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'

import { oldestEntryAt } from '../backup/log-age'
import { lastBackupAt } from '../backup/last-backup'
import { BACKUP_SECTION_HASH, shouldNudge, type NudgeVariant } from '../backup/nudge'
import { lastSnoozedAt, snoozeNudge } from '../backup/snooze'
import { detectPlatform } from '../platform'
import { isInstalled } from '../storage-persistence'

const router = useRouter()

const variant = ref<NudgeVariant>()

// Read when the banner appears, not at render: it is the log that has just
// happened that makes this the moment to ask.
onMounted(async () => {
  const oldest = await oldestEntryAt()

  variant.value = shouldNudge({
    now: Date.now(),
    lastBackupAt: lastBackupAt(),
    oldestEntryAt: oldest,
    lastSnoozedAt: lastSnoozedAt(),
    installed: isInstalled(),
    platform: detectPlatform(),
  })
})

function notNow() {
  snoozeNudge()
  variant.value = undefined
}

function backUp() {
  void router.push({ path: '/settings', hash: BACKUP_SECTION_HASH })
}
</script>

<template>
  <aside
    v-if="variant"
    class="nudge"
    role="status"
    :data-variant="variant"
    aria-label="Back up your data"
  >
    <p v-if="variant === 'first'" class="lead">
      <strong>You have not backed up your log yet.</strong>
      It is stored only on this device. A backup is an encrypted file you keep somewhere you choose.
    </p>
    <p v-else-if="variant === 'overdue'" class="lead">
      <strong>Your last backup is more than a day old.</strong>
      Your log is stored only on this device, so entries since then are not in it.
    </p>
    <p v-else class="lead" data-testid="ios-warning">
      <strong>Back up your log.</strong>
      In a browser tab on iOS, a website’s data can be cleared when it has not been used for a
      while. A backup is an encrypted file you keep somewhere you choose.
    </p>

    <p v-if="variant === 'ios-tab'" class="hint" data-testid="install-hint">
      Installing helps, because iOS treats Home Screen apps differently: in Safari, tap Share, then
      Add to Home Screen. The installed app starts with empty storage, so back up first and restore
      into it afterwards.
    </p>

    <div class="actions">
      <button type="button" @click="backUp">Back up now</button>
      <button type="button" class="ghost" @click="notNow">Not now</button>
    </div>
  </aside>
</template>

<style scoped>
.nudge {
  display: grid;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  background: var(--surface);
  border: 1px solid var(--line);
  border-left: 4px solid var(--primary);
  border-radius: var(--radius-control);
  font-size: var(--text-caption);
}

p {
  margin: 0;
  color: var(--ink-soft);
}

.lead strong {
  display: block;
  color: var(--ink);
  font-weight: var(--weight-medium);
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

button {
  font: inherit;
  font-weight: var(--weight-medium);
  color: var(--surface);
  background: var(--primary);
  border: 1px solid transparent;
  border-radius: var(--radius-pill);
  padding: var(--space-2) var(--space-4);
  cursor: pointer;
  transition: background var(--motion-fast) var(--ease-out);
}

button:hover {
  background: var(--primary-strong);
}

button.ghost {
  color: var(--ink-soft);
  background: none;
  border-color: var(--line);
}

button.ghost:hover {
  background: none;
  border-color: var(--ink-soft);
}
</style>
