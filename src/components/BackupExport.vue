<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'

import { BACKUP_CLASSES, collectBackup, countClasses, type CollectedClass } from '../backup/collect'
import { encryptBackup } from '../backup/envelope'
import { backupFileName, canShareFile, handOffBackup, type HandOff } from '../backup/hand-off'
import { lastExport, lastLogExport, recordBackup } from '../backup/last-backup'
import { checkPassphrase } from '../backup/passphrase'

const labels: Record<CollectedClass, string> = {
  foods: 'Foods',
  logEntries: 'Log history',
  mealTemplates: 'Meal templates',
  dayTemplates: 'Day templates',
  goals: 'Goals',
}

/** Everything is on to begin with: a backup that quietly left something out is the worse mistake. */
const selected = ref<CollectedClass[]>([...BACKUP_CLASSES])
/** undefined until the first read lands, so "loading" is not a claim of zero. */
const counts = ref<Record<CollectedClass, number>>()
const passphrase = ref('')
const confirmation = ref('')
const busy = ref(false)
const done = ref<string>()
const failed = ref(false)
const lastWithLog = ref(lastLogExport())
const latest = ref(lastExport())

/**
 * An encrypted file waiting for the tap that shares it. On a phone the share sheet
 * only opens from a fresh tap, and encrypting takes long enough to use the last
 * one up, so the work is done first and the hand-off is a second step. It is held
 * only until that tap succeeds or the user discards it, never longer.
 */
const ready = shallowRef<{ file: File; classes: CollectedClass[] }>()
const locked = computed(() => busy.value || ready.value !== undefined)

onBeforeUnmount(() => {
  ready.value = undefined
})

onMounted(async () => {
  try {
    counts.value = await countClasses()
  } catch {
    // The counts are information, not a precondition: the export reads for itself.
  }
})

const strength = computed(() => checkPassphrase(passphrase.value))

/** Shown once the second field has been started, so it does not scold an empty form. */
const mismatch = computed(
  () => confirmation.value.length > 0 && confirmation.value !== passphrase.value,
)

/** Why the button is disabled, or undefined when nothing blocks it. */
const blocker = computed(() => {
  if (selected.value.length === 0) return 'Choose at least one kind of data to include.'
  if (strength.value.kind === 'empty') return 'Enter a passphrase.'
  if (confirmation.value !== passphrase.value) return 'Enter the same passphrase twice.'

  return undefined
})

const countText = (name: CollectedClass) => {
  const n = counts.value?.[name]
  if (n === undefined) return '–'

  return `${n} ${n === 1 ? 'item' : 'items'}`
}

const dayWithoutMeals = computed(
  () => selected.value.includes('dayTemplates') && !selected.value.includes('mealTemplates'),
)

const when = (at: number) =>
  new Date(at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })

const held = (classes: string[]) =>
  classes.map((name) => labels[name as CollectedClass] ?? name).join(', ')

/** What the panel says about the log, which is the part a nudge cares about. */
const lastText = computed(() =>
  lastWithLog.value
    ? `Last backup: ${when(lastWithLog.value.at)} (${held(lastWithLog.value.classes)})`
    : 'Last backup of your log: never',
)

/** Shown only when a later export left the log out, so it cannot pass for a full backup. */
const partialText = computed(() =>
  latest.value && latest.value.at !== lastWithLog.value?.at
    ? `Latest partial export: ${when(latest.value.at)} (${held(latest.value.classes)}). It did not include the log.`
    : undefined,
)

function finish(outcome: Exclude<HandOff, 'cancelled'>, name: string, classes: CollectedClass[]) {
  recordBackup(classes)
  lastWithLog.value = lastLogExport()
  latest.value = lastExport()
  ready.value = undefined
  passphrase.value = ''
  confirmation.value = ''

  done.value =
    outcome === 'shared'
      ? `Shared ${name}.`
      : outcome === 'fallback'
        ? `Sharing did not work here, so ${name} was saved as a file instead.`
        : `Saved as a file: ${name}.`
}

async function backUp() {
  if (locked.value || blocker.value) return

  busy.value = true
  done.value = undefined
  failed.value = false

  try {
    // Let the busy state paint before the work starts. The key derivation runs
    // off the main thread in WebCrypto, but serialising a large log does not.
    await nextTick()

    const classes = [...selected.value]
    const payload = await collectBackup(classes)
    const envelope = await encryptBackup(payload, passphrase.value)
    // Read here, in the handler, not at render time.
    const name = backupFileName()
    const file = new File([JSON.stringify(envelope)], name, { type: 'application/json' })

    if (canShareFile(file)) {
      // The tap that started this is spent by now; wait for a fresh one.
      ready.value = { file, classes }

      return
    }

    // A download needs no gesture, so one step is enough.
    const outcome = await handOffBackup(file)
    if (outcome !== 'cancelled') finish(outcome, name, classes)
  } catch {
    failed.value = true
  } finally {
    busy.value = false
  }
}

/** The second tap. Nothing is awaited before the hand-off, or the sheet may refuse. */
async function shareReady() {
  const pending = ready.value
  if (!pending || busy.value) return

  failed.value = false
  busy.value = true

  try {
    const outcome = await handOffBackup(pending.file)

    // A closed share sheet sent nothing anywhere: not a backup, not an error.
    // The file stays ready, so trying again costs one tap.
    if (outcome !== 'cancelled') finish(outcome, pending.file.name, pending.classes)
  } catch {
    failed.value = true
  } finally {
    busy.value = false
  }
}

function discard() {
  ready.value = undefined
}
</script>

<template>
  <form class="export" :aria-busy="busy || undefined" @submit.prevent="backUp">
    <h3>Back up now</h3>

    <p class="hint">
      Ration keeps your data on this device only. A backup is an encrypted file you save somewhere
      you choose, such as your own cloud drive. It can be restored later.
    </p>

    <p class="last" data-testid="last-backup">{{ lastText }}</p>
    <p v-if="partialText" class="last" data-testid="last-partial">{{ partialText }}</p>

    <fieldset :disabled="locked">
      <legend>Include</legend>

      <label v-for="name in BACKUP_CLASSES" :key="name" class="choice">
        <input v-model="selected" type="checkbox" :value="name" />
        <span>{{ labels[name] }}</span>
        <span class="count">{{ countText(name) }}</span>
      </label>
    </fieldset>

    <div class="field">
      <label for="backup-passphrase">Passphrase</label>
      <input
        id="backup-passphrase"
        v-model="passphrase"
        type="password"
        autocomplete="new-password"
        :disabled="locked"
      />
    </div>

    <div class="field">
      <label for="backup-passphrase-again">Passphrase again</label>
      <input
        id="backup-passphrase-again"
        v-model="confirmation"
        type="password"
        autocomplete="new-password"
        :aria-invalid="mismatch || undefined"
        :disabled="locked"
      />
    </div>

    <div class="messages" aria-live="polite">
      <p v-if="mismatch" class="problem" data-testid="mismatch">
        The two passphrases do not match.
      </p>
      <p v-if="dayWithoutMeals" class="problem" data-testid="days-without-meals">
        <strong>Day templates need meal templates.</strong> A day refers to its meals, and the meals
        are not in this file, so a restore will refuse it. You can still make this backup.
      </p>
      <p v-if="strength.kind === 'weak'" class="problem" data-testid="weak">
        <strong>Weak passphrase.</strong> {{ strength.reason }} You can still use it.
      </p>
    </div>

    <!-- At the point of the decision, and not colour alone: §10 asks for this to be explicit. -->
    <div class="warning" role="note" data-testid="no-recovery">
      <strong>There is no account and no recovery.</strong>
      The passphrase is the only key to this file. If you lose it, the backup cannot be opened by
      anyone, including us. Store it somewhere other than this device.
    </div>

    <p v-if="blocker && !ready" class="blocker" data-testid="blocker">{{ blocker }}</p>

    <button v-if="!ready" type="submit" :disabled="busy || blocker !== undefined">
      {{ busy ? 'Encrypting…' : 'Back up now' }}
    </button>

    <div v-else class="ready" data-testid="ready">
      <p><strong>Backup ready.</strong> {{ ready.file.name }} is encrypted and not saved yet.</p>
      <button type="button" :disabled="busy" @click="shareReady">Share or save the backup</button>
      <button type="button" class="ghost" :disabled="busy" @click="discard">Discard</button>
    </div>

    <p v-if="done" class="ok" role="status" data-testid="done">
      {{ done }} Keep your passphrase: this file cannot be opened without it.
    </p>
    <p v-if="failed" class="problem" role="alert" data-testid="failed">
      The backup could not be created. Nothing was saved. Try again.
    </p>
  </form>
</template>

<style scoped>
.export {
  display: grid;
  gap: var(--space-3);
  margin-top: var(--space-4);
  padding-top: var(--space-4);
  border-top: 1px solid var(--line);
}

h3 {
  margin: 0;
  font-size: var(--text-body);
  font-weight: var(--weight-medium);
}

p {
  margin: 0;
}

.hint {
  font-size: var(--text-caption);
  color: var(--ink-soft);
}

.last {
  font-size: var(--text-caption);
  color: var(--ink-soft);
  font-feature-settings: var(--figures-tabular);
}

fieldset {
  margin: 0;
  padding: 0;
  border: 0;
  min-width: 0;
}

legend,
.field label {
  padding: 0;
  color: var(--ink-soft);
  font-size: var(--text-caption);
  letter-spacing: var(--tracking-eyebrow);
  text-transform: uppercase;
}

legend {
  margin-bottom: var(--space-1);
}

.choice {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-2) 0;
  border-top: 1px solid var(--line);
}

.choice input {
  margin: 0;
  accent-color: var(--primary);
}

.count {
  color: var(--ink-soft);
  font-size: var(--text-caption);
  font-feature-settings: var(--figures-tabular);
}

.field {
  display: grid;
  gap: var(--space-1);
}

.field input {
  font: inherit;
  width: 100%;
  color: var(--ink);
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius-control);
  padding: var(--space-2) var(--space-3);
  transition: border-color var(--motion-fast) var(--ease-out);
}

.field input:hover:not(:disabled) {
  border-color: var(--ink-soft);
}

/* Supplements the message rather than replacing it (§15). */
.field input[aria-invalid='true'] {
  border-color: var(--status-under);
}

.messages {
  display: grid;
  gap: var(--space-2);
}

.problem {
  font-size: var(--text-caption);
  color: var(--status-under);
}

.warning {
  border: 1px solid var(--line);
  border-left: 4px solid var(--status-under);
  border-radius: var(--radius-control);
  background: var(--bg);
  padding: var(--space-3) var(--space-4);
  font-size: var(--text-body);
}

.warning strong {
  display: block;
}

.blocker {
  font-size: var(--text-caption);
  color: var(--ink-soft);
}

.ok {
  font-size: var(--text-caption);
  color: var(--status-ok);
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

button:hover:not(:disabled) {
  background: var(--primary-strong);
}

button:disabled {
  opacity: 0.5;
  cursor: default;
}

.ready {
  display: grid;
  gap: var(--space-2);
}

button.ghost {
  color: var(--ink-soft);
  background: none;
  border-color: var(--line);
}

button.ghost:hover:not(:disabled) {
  background: none;
  border-color: var(--ink-soft);
}
</style>
