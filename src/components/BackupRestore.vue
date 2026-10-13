<script setup lang="ts">
import { computed, ref, shallowRef, watch } from 'vue'

import {
  localCounts,
  mergeFromBackup,
  payloadCounts,
  previewMerge,
  replaceFromBackup,
  unknownClasses,
  validatePayload,
  RestoreError,
  type ClassCounts,
  type MergeResult,
  type RestoreMode,
} from '../backup/apply'
import {
  BackupError,
  decryptBackup,
  parseEnvelope,
  type BackupEnvelope,
  type BackupPayload,
} from '../backup/envelope'
import { focusBackupForm } from '../backup/focus-export'
import { lastBackupAt } from '../backup/last-backup'
import { BACKUP_MAX_AGE_MS } from '../backup/nudge'

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

/** Merging is the default: it cannot remove anything from this device. */
const mode = ref<RestoreMode>('merge')
/** What a merge would add, update and keep, worked out while the backup is open. */
const mergePlan = ref<MergeResult>({})
/** Why a replace would be refused, when a merge would not be (a day naming a meal only this device has). */
const replaceBlocked = ref('')

/** The counts written, once a replace has happened. */
const restored = ref<ClassCounts>()
/** The counts written, once a merge has happened. */
const merged = ref<MergeResult>()

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

const mergeRows = computed(() =>
  Object.entries(mergePlan.value).map(([name, counts]) => ({
    name,
    label: labelOf(name),
    ...counts,
  })),
)

const restoredText = computed(() =>
  Object.entries(restored.value ?? {})
    .map(([name, count]) => `${count} ${labelOf(name).toLowerCase()}`)
    .join(', '),
)

const mergedText = computed(() =>
  Object.entries(merged.value ?? {})
    .map(
      ([name, c]) =>
        `${labelOf(name).toLowerCase()}: ${c.added} added, ${c.updated} updated, ${c.kept} kept`,
    )
    .join('; '),
)

/** Prose list: "a, b and c". */
function joinList(items: string[]): string {
  if (items.length < 2) return items[0] ?? ''

  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
}

/**
 * How fresh the last backup of the log is, for the replace confirm. `now` is set
 * when the confirm opens and again when a backup is recorded, never read at render.
 * Reactive through `lastBackupAt()`, so an export made on this same page updates it.
 */
const now = ref(Date.now())
const lastLogBackup = computed(() => lastBackupAt())

watch(lastLogBackup, () => {
  now.value = Date.now()
})

function ago(at: number): string {
  const minutes = Math.floor(Math.max(0, now.value - at) / 60_000)
  const relative = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })

  if (minutes < 1) return 'just now'
  if (minutes < 60) return relative.format(-minutes, 'minute')
  if (minutes < 24 * 60) return relative.format(-Math.floor(minutes / 60), 'hour')

  return relative.format(-Math.floor(minutes / (24 * 60)), 'day')
}

const lastBackupText = computed(() => {
  const at = lastLogBackup.value
  if (at === undefined) return 'never'

  const date = new Date(at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })

  return `${ago(at)} (${date})`
})

/** No backup of the log, or one older than the cadence the backup prompt uses. */
const backupStale = computed(
  () => lastLogBackup.value === undefined || now.value - lastLogBackup.value >= BACKUP_MAX_AGE_MS,
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
  mode.value = 'merge'
  mergePlan.value = {}
  replaceBlocked.value = ''
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
  dismiss()
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
    // Checked as a merge, the default: its meal references are the looser of the two.
    await validatePayload(opened, 'merge')
    incoming.value = payloadCounts(opened)
    current.value = await localCounts(Object.keys(incoming.value))
    mergePlan.value = await previewMerge(opened)
    skipped.value = unknownClasses(opened)
    now.value = Date.now()
    replaceBlocked.value = await replaceProblem(opened)
    payload.value = opened
  } catch (error) {
    problem.value = describe(error)
    passphraseInput.value?.focus()
  } finally {
    busy.value = false
  }
}

/** The reason a replace would be refused, or '' when it would go ahead. */
async function replaceProblem(opened: BackupPayload): Promise<string> {
  try {
    await validatePayload(opened, 'replace')
    return ''
  } catch (error) {
    if (error instanceof RestoreError) return describe(error)
    throw error
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

async function merge() {
  if (!payload.value || busy.value) return
  busy.value = true
  problem.value = ''

  try {
    const written = await mergeFromBackup(payload.value)
    reset()
    merged.value = written
  } catch (error) {
    problem.value = describe(error)
    busy.value = false
  }
}

function dismiss() {
  restored.value = undefined
  merged.value = undefined
}
</script>

<template>
  <div class="restore" aria-labelledby="restore-heading" role="group">
    <h3 id="restore-heading">Restore from a backup</h3>

    <p class="hint">
      Choose a backup file, then enter the passphrase it was made with. You can then merge the
      backup into the data on this device, or replace this device’s data with it.
    </p>

    <p v-if="restored" class="done" role="status" data-testid="restore-done">
      Restored {{ restoredText || 'nothing' }}. The data on this device now matches the backup. The
      app’s screens read the new data when you open them.
      <button type="button" class="ghost" @click="dismiss">Dismiss</button>
    </p>

    <p v-else-if="merged" class="done" role="status" data-testid="restore-done">
      Merged the backup into this device. {{ mergedText || 'Nothing to merge.' }}. Nothing was
      deleted. The app’s screens read the new data when you open them.
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
      <h4 id="restore-confirm-heading">Restore this backup</h4>

      <fieldset class="modes" :disabled="busy">
        <legend>How to restore it</legend>

        <div class="mode">
          <input
            id="restore-mode-merge"
            v-model="mode"
            type="radio"
            name="restore-mode"
            value="merge"
          />
          <label for="restore-mode-merge">Merge into this device</label>
          <p class="hint">
            Keeps what is here and adds what only the backup holds. Where both have the same record,
            the one saved last is kept. Nothing is removed.
          </p>
        </div>

        <div class="mode">
          <input
            id="restore-mode-replace"
            v-model="mode"
            type="radio"
            name="restore-mode"
            value="replace"
          />
          <label for="restore-mode-replace">Replace this device’s data</label>
          <p class="hint">
            Swaps what is here for what the backup holds, for each kind of data it carries.
          </p>
        </div>
      </fieldset>

      <template v-if="mode === 'merge'">
        <table class="summary" data-testid="restore-merge-summary">
          <thead>
            <tr>
              <th scope="col">Data</th>
              <th scope="col">Added</th>
              <th scope="col">Updated</th>
              <th scope="col">Kept</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in mergeRows" :key="row.name">
              <th scope="row">{{ row.label }}</th>
              <td>{{ row.added }}</td>
              <td>{{ row.updated }}</td>
              <td>{{ row.kept }}</td>
            </tr>
          </tbody>
        </table>

        <p class="facts">
          Added: only in the backup. Updated: in both, and the backup’s was saved later, so it
          replaces this device’s. Kept: in both, and this device’s is as new or newer, so it stays.
        </p>

        <p class="facts" data-testid="restore-merge-clock">
          The newer of the two is decided by the time each device saved it, so a device with a wrong
          clock can win.
        </p>

        <p v-if="skipped.length" class="facts">
          Not restored, because this version of Ration does not know them: {{ skipped.join(', ') }}.
        </p>

        <p class="note" data-testid="restore-merge-note">
          A merge never deletes anything, and deletions are not tracked: something you deleted on
          this device comes back from the backup if the backup still holds it. Data of other kinds
          is left as it is.
        </p>

        <div class="actions">
          <button type="button" class="ghost" :disabled="busy" @click="reset">Cancel</button>
          <button type="button" :disabled="busy || !mergeRows.length" @click="merge">
            {{ busy ? 'Merging…' : 'Merge into my data' }}
          </button>
        </div>
      </template>

      <template v-else>
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
            The {{ joinList(summaryRows.map((row) => row.label.toLowerCase())) }}
            {{ plural(summaryRows.length, 'on this device is', 'on this device are') }} replaced by
            the backup’s. Anything saved here that the backup does not hold is lost, and this cannot
            be undone.
          </template>
          <template v-else>The backup holds nothing this version can restore.</template>
          Data of other kinds is left as it is.
        </p>

        <p v-if="replaceBlocked" class="problem" data-testid="restore-replace-blocked">
          {{ replaceBlocked }} Merging this backup is still possible.
        </p>

        <div
          class="note freshness"
          data-testid="restore-last-backup"
          :data-stale="backupStale || undefined"
        >
          <p>Last backup of this device’s log: {{ lastBackupText }}.</p>
          <p v-if="lastLogBackup === undefined">
            Anything saved here will be lost unless the backup holds it, and there is no way back.
          </p>
          <p v-else-if="backupStale">
            Anything saved here since then will be lost, and there is no way back.
          </p>
          <p v-else>Anything saved here since then is not in it, and a replace cannot be undone.</p>
        </div>

        <div class="actions">
          <button type="button" class="ghost" :disabled="busy" @click="reset">Cancel</button>
          <button
            type="button"
            class="ghost"
            data-testid="restore-backup-first"
            :disabled="busy"
            @click="focusBackupForm"
          >
            Back up this device first
          </button>
          <button
            type="button"
            class="danger"
            :disabled="busy || !summaryRows.length || !!replaceBlocked"
            @click="replace"
          >
            {{ busy ? 'Replacing…' : 'Replace my data' }}
          </button>
        </div>
      </template>
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

.note {
  margin: 0;
  padding: var(--space-3);
  border: 1px solid var(--line);
  border-radius: var(--radius-control);
}

.freshness {
  display: grid;
  gap: var(--space-1);
}

.freshness p {
  margin: 0;
}

.modes {
  display: grid;
  gap: var(--space-3);
  margin: 0;
  padding: 0;
  border: 0;
  min-width: 0;
}

legend {
  padding: 0;
  margin-bottom: var(--space-2);
  color: var(--ink-soft);
  font-size: var(--text-caption);
  letter-spacing: var(--tracking-eyebrow);
  text-transform: uppercase;
}

.mode {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  column-gap: var(--space-2);
  align-items: center;
}

.mode label {
  color: var(--ink);
  font-size: var(--text-body);
  letter-spacing: normal;
  text-transform: none;
}

.mode .hint {
  grid-column: 2;
}

input[type='radio'] {
  margin: 0;
  accent-color: var(--primary);
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
