<script setup lang="ts">
import { computed, ref, shallowRef } from 'vue'

import {
  localCounts,
  payloadCounts,
  replaceFromBackup,
  unknownClasses,
  validatePayload,
  RestoreError,
  type ClassCounts,
} from '../backup/apply'
import {
  BackupError,
  decryptBackup,
  parseEnvelope,
  type BackupEnvelope,
  type BackupPayload,
} from '../backup/envelope'

const LABELS: Record<string, string> = {
  foods: 'Foods',
  logEntries: 'Log entries',
  mealTemplates: 'Meal templates',
  dayTemplates: 'Day templates',
  goals: 'Daily goals',
}

const labelOf = (name: string) => LABELS[name] ?? name

/** The file's text and header; set once a file has been read and recognised. */
const fileText = ref('')
const envelope = ref<BackupEnvelope>()
const passphrase = ref('')
const busy = ref(false)
const problem = ref('')

/** Set once the passphrase has opened the file and every row passed validation. */
const payload = shallowRef<BackupPayload>()
const incoming = ref<ClassCounts>({})
const current = ref<ClassCounts>({})
const skipped = ref<string[]>([])

/** The counts written, once the restore has happened. */
const restored = ref<ClassCounts>()

const fileInput = ref<HTMLInputElement>()
const passphraseInput = ref<HTMLInputElement>()

const createdText = computed(() => {
  if (!envelope.value) return ''
  const at = new Date(envelope.value.createdAt)

  return Number.isNaN(at.getTime())
    ? envelope.value.createdAt
    : at.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
})

const classNames = computed(() => envelope.value?.classes.map(labelOf).join(', ') || 'nothing')

const summaryRows = computed(() =>
  Object.keys(incoming.value).map((name) => ({
    name,
    label: labelOf(name),
    incoming: incoming.value[name]!,
    current: current.value[name] ?? 0,
  })),
)

const restoredText = computed(() =>
  Object.entries(restored.value ?? {})
    .map(([name, count]) => `${count} ${labelOf(name).toLowerCase()}`)
    .join(', '),
)

const plural = (count: number, one: string, many: string) => (count === 1 ? one : many)

function reset() {
  fileText.value = ''
  envelope.value = undefined
  passphrase.value = ''
  problem.value = ''
  payload.value = undefined
  incoming.value = {}
  current.value = {}
  skipped.value = []
  busy.value = false
  if (fileInput.value) fileInput.value.value = ''
}

/** One place for wording, so a failure never leaves a raw library message on screen. */
function describe(error: unknown): string {
  if (error instanceof BackupError) {
    switch (error.code) {
      case 'unsupported-version':
        return 'This backup was made by a newer version of Ration. Update the app, then try again.'
      case 'decryption-failed':
        return 'Wrong passphrase, or the file is damaged.'
      case 'empty-passphrase':
        return 'Enter the passphrase for this backup.'
      default:
        return 'This is not a Ration backup.'
    }
  }

  if (error instanceof RestoreError) {
    return error.code === 'invalid-row'
      ? `The backup holds data this version of Ration cannot restore (${error.message}) Nothing on this device was changed.`
      : 'Ration could not write the backup to this device. Nothing was changed.'
  }

  return 'Something went wrong while reading the backup. Nothing on this device was changed.'
}

async function onFile(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  reset()
  restored.value = undefined
  if (!file) return

  try {
    const text = await file.text()
    envelope.value = parseEnvelope(text)
    fileText.value = text
  } catch (error) {
    problem.value = describe(error)
  }
}

async function open() {
  if (!envelope.value || busy.value) return
  busy.value = true
  problem.value = ''

  try {
    const opened = await decryptBackup(fileText.value, passphrase.value)
    validatePayload(opened)
    incoming.value = payloadCounts(opened)
    current.value = await localCounts(Object.keys(incoming.value))
    skipped.value = unknownClasses(opened)
    payload.value = opened
  } catch (error) {
    problem.value = describe(error)
    passphraseInput.value?.focus()
  } finally {
    busy.value = false
  }
}

async function replace() {
  if (!payload.value || busy.value) return
  busy.value = true
  problem.value = ''

  try {
    const written = await replaceFromBackup(payload.value)
    reset()
    restored.value = written
  } catch (error) {
    problem.value = describe(error)
    busy.value = false
  }
}

function dismiss() {
  restored.value = undefined
}
</script>

<template>
  <div class="restore" aria-labelledby="restore-heading" role="group">
    <h3 id="restore-heading">Restore from a backup</h3>

    <p class="hint">
      Restoring replaces the data on this device with the backup’s. Choose a backup file, then enter
      the passphrase it was made with.
    </p>

    <p v-if="restored" class="done" role="status" data-testid="restore-done">
      Restored {{ restoredText || 'nothing' }}. The data on this device now matches the backup. The
      app’s screens read the new data when you open them.
      <button type="button" class="ghost" @click="dismiss">Dismiss</button>
    </p>

    <template v-if="!payload">
      <div class="field">
        <label for="restore-file">Backup file</label>
        <input
          id="restore-file"
          ref="fileInput"
          type="file"
          accept=".json,application/json"
          @change="onFile"
        />
      </div>

      <template v-if="envelope">
        <p class="facts" data-testid="restore-file-info">
          Made {{ createdText }}. Holds: {{ classNames }}.
        </p>

        <form class="field" @submit.prevent="open">
          <label for="restore-passphrase">Passphrase</label>
          <input
            id="restore-passphrase"
            ref="passphraseInput"
            v-model="passphrase"
            type="password"
            autocomplete="current-password"
          />
          <button type="submit" :disabled="busy || passphrase.length === 0">
            {{ busy ? 'Opening…' : 'Open backup' }}
          </button>
        </form>
      </template>
    </template>

    <section v-else class="confirm" aria-labelledby="restore-confirm-heading">
      <h4 id="restore-confirm-heading">Replace the data on this device?</h4>

      <table class="summary" data-testid="restore-summary">
        <thead>
          <tr>
            <th scope="col">Data</th>
            <th scope="col">On this device</th>
            <th scope="col">In the backup</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in summaryRows" :key="row.name">
            <th scope="row">{{ row.label }}</th>
            <td>{{ row.current }}</td>
            <td>{{ row.incoming }}</td>
          </tr>
        </tbody>
      </table>

      <p v-if="skipped.length" class="facts">
        Not restored, because this version of Ration does not know them: {{ skipped.join(', ') }}.
      </p>

      <p class="warning" data-testid="restore-warning">
        <template v-if="summaryRows.length">
          The {{ summaryRows.map((row) => row.label.toLowerCase()).join(', ') }}
          {{ plural(summaryRows.length, 'on this device is', 'on this device are') }} replaced by
          the backup’s. Anything saved here that the backup does not hold is lost, and this cannot
          be undone.
        </template>
        <template v-else>The backup holds nothing this version can restore.</template>
        Data of other kinds is left as it is.
      </p>

      <div class="actions">
        <button type="button" class="ghost" :disabled="busy" @click="reset">Cancel</button>
        <button
          type="button"
          class="danger"
          :disabled="busy || !summaryRows.length"
          @click="replace"
        >
          {{ busy ? 'Replacing…' : 'Replace my data' }}
        </button>
      </div>
    </section>

    <p v-if="problem" class="problem" role="alert" data-testid="restore-problem">{{ problem }}</p>
  </div>
</template>

<style scoped>
.restore {
  display: grid;
  gap: var(--space-3);
  padding-top: var(--space-3);
  border-top: 1px solid var(--line);
}

h3,
h4 {
  margin: 0;
  font-weight: var(--weight-medium);
}

h3 {
  font-size: var(--text-body);
}

h4 {
  font-size: var(--text-body);
}

.hint,
.facts {
  margin: 0;
  font-size: var(--text-caption);
  color: var(--ink-soft);
  overflow-wrap: anywhere;
}

.field {
  display: grid;
  gap: var(--space-2);
}

label {
  color: var(--ink-soft);
  font-size: var(--text-caption);
  letter-spacing: var(--tracking-eyebrow);
  text-transform: uppercase;
}

input {
  font: inherit;
  min-width: 0;
  color: var(--ink);
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius-control);
  padding: var(--space-1) var(--space-2);
  transition: border-color var(--motion-fast) var(--ease-out);
}

input:hover {
  border-color: var(--ink-soft);
}

.confirm {
  display: grid;
  gap: var(--space-3);
}

.summary {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--text-caption);
  font-feature-settings: var(--figures-tabular);
}

.summary th,
.summary td {
  padding: var(--space-2) var(--space-1);
  border-top: 1px solid var(--line);
  text-align: right;
}

.summary th:first-child {
  text-align: left;
  font-weight: var(--weight-regular, normal);
}

.summary thead th {
  color: var(--ink-soft);
  font-weight: var(--weight-regular, normal);
}

.warning {
  margin: 0;
  padding: var(--space-3);
  border: 1px solid var(--status-under);
  border-radius: var(--radius-control);
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
}

.problem {
  margin: 0;
  color: var(--status-under);
}

.done {
  margin: 0;
  display: grid;
  gap: var(--space-2);
  justify-items: start;
}

button {
  font: inherit;
  font-size: var(--text-caption);
  font-weight: var(--weight-medium);
  color: var(--surface);
  background: var(--primary);
  border: 1px solid transparent;
  border-radius: var(--radius-pill);
  padding: var(--space-1) var(--space-4);
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

button.ghost {
  color: var(--ink-soft);
  background: none;
  border-color: var(--line);
}

button.ghost:hover:not(:disabled) {
  background: none;
  border-color: var(--ink-soft);
}

button.danger {
  background: var(--status-under);
}

button.danger:hover:not(:disabled) {
  background: var(--status-under);
  filter: brightness(0.92);
}
</style>
