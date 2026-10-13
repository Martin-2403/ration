// Must come before db.ts, which constructs a Dexie instance on import.
import 'fake-indexeddb/auto'

import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'

import { encryptBackup, type BackupPayload } from '../../backup/envelope'
import { lastBackupAt, recordBackup } from '../../backup/last-backup'
import { db } from '../../db'
import BackupExport from '../BackupExport.vue'
import BackupRestore from '../BackupRestore.vue'

// The export form uses the production iteration count unless told otherwise;
// 600,000 rounds in a test would take minutes. Everything else is real.
vi.mock('../../backup/envelope', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../backup/envelope')>()

  return {
    ...original,
    encryptBackup: (
      data: Parameters<typeof original.encryptBackup>[0],
      pass: string,
      options?: Parameters<typeof original.encryptBackup>[2],
    ) => original.encryptBackup(data, pass, options ?? { iterations: 1000 }),
  }
})

const FAST = { iterations: 1_000 }

const goal = (nutrient: string, target: number) => ({ nutrient, target, updatedAt: 4_000 })
const food = (id: string) => ({ id, name: id, per100g: {}, updatedAt: 1_000 })

const payload: BackupPayload = {
  foods: [food('oats'), food('milk')],
  goals: [goal('energy', 2000)],
}

async function fileOf(content: BackupPayload | object | string, passphrase = 'correct horse') {
  const text =
    typeof content === 'string'
      ? content
      : 'ciphertext' in content
        ? JSON.stringify(content)
        : JSON.stringify(await encryptBackup(content as BackupPayload, passphrase, FAST))

  return new File([text], 'ration-backup.json', { type: 'application/json' })
}

async function choose(wrapper: ReturnType<typeof mount>, file: File) {
  const input = wrapper.get<HTMLInputElement>('input[type=file]')
  Object.defineProperty(input.element, 'files', { value: [file], configurable: true })
  await input.trigger('change')
  await flushPromises()
}

async function openWith(wrapper: ReturnType<typeof mount>, passphrase: string) {
  await wrapper.get('input[type=password]').setValue(passphrase)
  await wrapper.get('form').trigger('submit')
  // Key derivation and decryption run on WebCrypto, outside the microtask queue.
  await vi.waitFor(() => expect(wrapper.find('form button[disabled]').exists()).toBe(false))
  await flushPromises()
}

const buttonByText = (wrapper: ReturnType<typeof mount>, text: string) =>
  wrapper.findAll('button').find((b) => b.text() === text)

async function snapshot() {
  return {
    foods: await db.foods.toArray(),
    goals: await db.nutrientGoals.toArray(),
    logEntries: await db.logEntries.toArray(),
  }
}

beforeEach(async () => {
  localStorage.clear()
  await Promise.all([
    db.foods.clear(),
    db.mealTemplates.clear(),
    db.dayTemplates.clear(),
    db.logEntries.clear(),
    db.nutrientGoals.clear(),
  ])
  await db.foods.put({ ...food('local-food'), updatedAt: 9_999 } as never)
  await db.nutrientGoals.put(goal('protein', 90) as never)
})

describe('BackupRestore', () => {
  it('labels the passphrase field and keeps it a password input', async () => {
    const wrapper = mount(BackupRestore)
    await choose(wrapper, await fileOf(payload))

    const input = wrapper.get('input[type=password]')
    expect(input.attributes('autocomplete')).toBe('current-password')
    expect(wrapper.get(`label[for=${input.attributes('id')}]`).text()).toBe('Passphrase')
  })

  it('shows the date and class names, but no row counts, before the passphrase', async () => {
    const wrapper = mount(BackupRestore)
    await choose(wrapper, await fileOf(payload))

    const info = wrapper.get('[data-testid=restore-file-info]').text()
    expect(info).toContain('Foods')
    expect(info).toContain('Daily goals')
    expect(info).not.toMatch(/\d+ foods/i)
    expect(wrapper.find('[data-testid=restore-summary]').exists()).toBe(false)
  })

  it('needs two steps: nothing is written until Replace my data is pressed', async () => {
    const wrapper = mount(BackupRestore)
    await choose(wrapper, await fileOf(payload))
    await openWith(wrapper, 'correct horse')
    await wrapper.get('#restore-mode-replace').setValue(true)

    // Step one has happened: the backup is open and summarised, with what is lost.
    const summary = wrapper.get('[data-testid=restore-summary]').text()
    expect(summary).toContain('Foods')
    expect(summary).toMatch(/Foods\s*1\s*2/)
    expect(summary).toMatch(/Daily goals\s*1\s*1/)
    expect(wrapper.get('[data-testid=restore-warning]').text()).toContain('lost')
    expect(await db.foods.count()).toBe(1)
    expect((await db.foods.toArray())[0]!.id).toBe('local-food')

    await buttonByText(wrapper, 'Replace my data')!.trigger('click')
    await vi.waitFor(() => expect(wrapper.find('[data-testid=restore-done]').exists()).toBe(true))

    expect((await db.foods.toArray()).map((f) => f.id).sort()).toEqual(['milk', 'oats'])
    expect(await db.nutrientGoals.toArray()).toEqual([goal('energy', 2000)])
    expect(wrapper.get('[data-testid=restore-done]').text()).toContain('2 foods, 1 daily goals')
  })

  describe('merge or replace', () => {
    it('offers both with labelled radios, and merge is the default', async () => {
      const wrapper = mount(BackupRestore)
      await choose(wrapper, await fileOf(payload))
      await openWith(wrapper, 'correct horse')

      const merge = wrapper.get<HTMLInputElement>('#restore-mode-merge')
      const replace = wrapper.get<HTMLInputElement>('#restore-mode-replace')
      expect(wrapper.get('label[for=restore-mode-merge]').text()).toBe('Merge into this device')
      expect(wrapper.get('label[for=restore-mode-replace]').text()).toBe(
        'Replace this device’s data',
      )
      expect(merge.element.checked).toBe(true)
      expect(replace.element.checked).toBe(false)
      expect(wrapper.find('[data-testid=restore-summary]').exists()).toBe(false)
      expect(buttonByText(wrapper, 'Replace my data')).toBeUndefined()
    })

    it('shows what a merge would add, update and keep, and that deletions come back', async () => {
      await db.foods.put({ ...food('milk'), name: 'local milk', updatedAt: 5_000 } as never)
      const wrapper = mount(BackupRestore)
      await choose(wrapper, await fileOf(payload))
      await openWith(wrapper, 'correct horse')

      // oats is new; milk is on both sides and the local one is newer; the goal is new.
      const summary = wrapper.get('[data-testid=restore-merge-summary]').text()
      expect(summary).toMatch(/Foods\s*1\s*0\s*1/)
      expect(summary).toMatch(/Daily goals\s*1\s*0\s*0/)
      expect(wrapper.get('[data-testid=restore-merge-note]').text()).toContain(
        'comes back from the backup',
      )
      expect(wrapper.get('[data-testid=restore-merge-note]').text()).toContain('never deletes')
      expect(wrapper.get('[data-testid=restore-merge-clock]').text()).toContain(
        'a device with a wrong clock can win',
      )
      expect(await db.foods.count()).toBe(2)
    })

    it('merges: nothing is written until Merge into my data, then local data survives and counts are stated', async () => {
      await db.foods.put({ ...food('milk'), name: 'local milk', updatedAt: 5_000 } as never)
      const wrapper = mount(BackupRestore)
      await choose(wrapper, await fileOf(payload))
      await openWith(wrapper, 'correct horse')
      expect(await db.foods.count()).toBe(2)
      expect((await db.foods.get('oats')) === undefined).toBe(true)

      await buttonByText(wrapper, 'Merge into my data')!.trigger('click')
      await vi.waitFor(() => expect(wrapper.find('[data-testid=restore-done]').exists()).toBe(true))

      expect((await db.foods.toArray()).map((f) => f.id).sort()).toEqual([
        'local-food',
        'milk',
        'oats',
      ])
      expect((await db.foods.get('milk'))!.name).toBe('local milk')
      expect((await db.nutrientGoals.toArray()).map((g) => g.nutrient).sort()).toEqual([
        'energy',
        'protein',
      ])
      const done = wrapper.get('[data-testid=restore-done]').text()
      expect(done).toContain('foods: 1 added, 0 updated, 1 kept')
      expect(done).toContain('daily goals: 1 added, 0 updated, 0 kept')
      expect(done).toContain('Nothing was deleted')
    })

    it('Replace is still there behind the radio, with its warning', async () => {
      const wrapper = mount(BackupRestore)
      await choose(wrapper, await fileOf(payload))
      await openWith(wrapper, 'correct horse')

      await wrapper.get('#restore-mode-replace').setValue(true)

      expect(wrapper.find('[data-testid=restore-merge-summary]').exists()).toBe(false)
      expect(wrapper.get('[data-testid=restore-warning]').text()).toContain('cannot be undone')
      expect(buttonByText(wrapper, 'Merge into my data')).toBeUndefined()
    })

    it('cancelling a merge writes nothing', async () => {
      const wrapper = mount(BackupRestore)
      await choose(wrapper, await fileOf(payload))
      await openWith(wrapper, 'correct horse')
      const before = await snapshot()

      await buttonByText(wrapper, 'Cancel')!.trigger('click')

      expect(await snapshot()).toEqual(before)
      expect(wrapper.find('input[type=file]').exists()).toBe(true)
    })

    it('a later file starts on merge again', async () => {
      const wrapper = mount(BackupRestore)
      await choose(wrapper, await fileOf(payload))
      await openWith(wrapper, 'correct horse')
      await wrapper.get('#restore-mode-replace').setValue(true)
      await buttonByText(wrapper, 'Cancel')!.trigger('click')

      await choose(wrapper, await fileOf(payload))
      await openWith(wrapper, 'correct horse')

      expect(wrapper.get<HTMLInputElement>('#restore-mode-merge').element.checked).toBe(true)
    })

    it('refuses a replace, but not a merge, of a day naming a meal only this device has', async () => {
      await db.mealTemplates.put({
        id: 'local-meal',
        name: 'Local',
        slots: [],
        updatedAt: 1,
      } as never)
      const wrapper = mount(BackupRestore)
      const days: BackupPayload = {
        mealTemplates: [{ id: 'm1', name: 'M', slots: [], updatedAt: 1 }],
        dayTemplates: [{ id: 'd1', name: 'D', mealTemplateIds: ['local-meal'], updatedAt: 1 }],
      }
      await choose(wrapper, await fileOf(days))
      await openWith(wrapper, 'correct horse')

      expect(buttonByText(wrapper, 'Merge into my data')!.attributes('disabled')).toBeUndefined()

      await wrapper.get('#restore-mode-replace').setValue(true)

      expect(wrapper.get('[data-testid=restore-replace-blocked]').text()).toContain('local-meal')
      expect(buttonByText(wrapper, 'Replace my data')!.attributes('disabled')).toBeDefined()
    })

    it('says why a merge was refused and leaves the database as it was', async () => {
      const wrapper = mount(BackupRestore)
      await choose(
        wrapper,
        await fileOf({
          dayTemplates: [{ id: 'd1', name: 'D', mealTemplateIds: ['nowhere'], updatedAt: 1 }],
        }),
      )
      const before = await snapshot()

      await openWith(wrapper, 'correct horse')

      expect(wrapper.get('[data-testid=restore-problem]').text()).toContain('nowhere')
      expect(buttonByText(wrapper, 'Merge into my data')).toBeUndefined()
      expect(await snapshot()).toEqual(before)
    })
  })

  it('Cancel leaves the database untouched and returns to the start', async () => {
    const wrapper = mount(BackupRestore)
    await choose(wrapper, await fileOf(payload))
    await openWith(wrapper, 'correct horse')
    const before = await snapshot()

    await buttonByText(wrapper, 'Cancel')!.trigger('click')

    expect(await snapshot()).toEqual(before)
    expect(wrapper.find('[data-testid=restore-summary]').exists()).toBe(false)
    expect(wrapper.find('input[type=file]').exists()).toBe(true)
  })

  it('says wrong passphrase and writes nothing', async () => {
    const wrapper = mount(BackupRestore)
    await choose(wrapper, await fileOf(payload))
    const before = await snapshot()

    await openWith(wrapper, 'not it')

    expect(wrapper.get('[data-testid=restore-problem]').text()).toBe(
      'Wrong passphrase, or the file is damaged.',
    )
    expect(wrapper.find('[data-testid=restore-summary]').exists()).toBe(false)
    expect(await snapshot()).toEqual(before)
  })

  it('tells the user to update the app for a newer backup', async () => {
    const wrapper = mount(BackupRestore)
    const newer = { ...(await encryptBackup(payload, 'pw', FAST)), schemaVersion: 2 }
    const before = await snapshot()

    await choose(wrapper, await fileOf(newer))

    expect(wrapper.get('[data-testid=restore-problem]').text()).toContain('Update the app')
    expect(wrapper.find('input[type=password]').exists()).toBe(false)
    expect(await snapshot()).toEqual(before)
  })

  it('says a file that is not a backup is not a Ration backup', async () => {
    const wrapper = mount(BackupRestore)
    const before = await snapshot()

    await choose(wrapper, await fileOf('{"hello": "world"}'))

    expect(wrapper.get('[data-testid=restore-problem]').text()).toBe('This is not a Ration backup.')
    expect(await snapshot()).toEqual(before)
  })

  it('refuses a backup with a bad row before offering the replace, writing nothing', async () => {
    const wrapper = mount(BackupRestore)
    await choose(wrapper, await fileOf({ goals: [goal('energy', 0)], foods: [food('a')] }))
    const before = await snapshot()

    await openWith(wrapper, 'correct horse')

    expect(wrapper.get('[data-testid=restore-problem]').text()).toContain('goals row 1')
    expect(wrapper.get('[data-testid=restore-problem]').text()).toContain('Nothing on this device')
    expect(buttonByText(wrapper, 'Replace my data')).toBeUndefined()
    expect(await snapshot()).toEqual(before)
  })
})

describe('the safety backup before a replace (#153)', () => {
  const NOW = new Date(2026, 9, 13, 12, 0).getTime()
  const HOUR = 60 * 60 * 1000

  const mounted: Array<{ unmount: () => void }> = []

  beforeEach(() => {
    vi.spyOn(Date, 'now').mockReturnValue(NOW)
  })

  afterEach(() => {
    mounted.splice(0).forEach((wrapper) => wrapper.unmount())
    Reflect.deleteProperty(Element.prototype, 'scrollIntoView')
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  async function replaceConfirm() {
    const wrapper = mount(BackupRestore)
    await choose(wrapper, await fileOf(payload))
    await openWith(wrapper, 'correct horse')
    await wrapper.get('#restore-mode-replace').setValue(true)

    return wrapper
  }

  const line = (wrapper: ReturnType<typeof mount>) =>
    wrapper.get('[data-testid=restore-last-backup]')

  it('says never, and that anything saved here is lost with no way back', async () => {
    const wrapper = await replaceConfirm()

    expect(line(wrapper).text()).toContain('Last backup of this device’s log: never.')
    expect(line(wrapper).text()).toContain('no way back')
    expect(line(wrapper).attributes('data-stale')).toBeDefined()
  })

  it('gives a recent backup as a relative time and a date, without calling the data safe', async () => {
    recordBackup(['logEntries', 'foods'], NOW - 2 * HOUR)
    const wrapper = await replaceConfirm()

    const text = line(wrapper).text()
    expect(text).toContain('Last backup of this device’s log: 2 hours ago (')
    expect(text).toContain('not in it')
    expect(text).not.toContain('no way back')
    expect(text).not.toMatch(/\bsafe\b/i)
    expect(line(wrapper).attributes('data-stale')).toBeUndefined()
  })

  it('says plainly that what was saved since is lost when the backup is older than a day', async () => {
    recordBackup(['logEntries'], NOW - 3 * 24 * HOUR)
    const wrapper = await replaceConfirm()

    expect(line(wrapper).text()).toContain('3 days ago')
    expect(line(wrapper).text()).toContain('Anything saved here since then will be lost')
    expect(line(wrapper).text()).toContain('no way back')
    expect(line(wrapper).attributes('data-stale')).toBeDefined()
  })

  it('uses the iOS-tab cadence the prompt uses: 18 hours is overdue there, not elsewhere', async () => {
    recordBackup(['logEntries'], NOW - 18 * HOUR)
    const elsewhere = await replaceConfirm()
    expect(line(elsewhere).attributes('data-stale')).toBeUndefined()

    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Safari/604.1',
    )
    const iosTab = await replaceConfirm()

    expect(line(iosTab).text()).toContain('18 hours ago')
    expect(line(iosTab).attributes('data-stale')).toBeDefined()
    expect(line(iosTab).text()).toContain('no way back')
  })

  it('words a backup made this minute with the browser’s own "now"', async () => {
    recordBackup(['logEntries'], NOW - 20_000)
    const wrapper = await replaceConfirm()

    expect(line(wrapper).text()).toContain(
      `log: ${new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' }).format(0, 'second')} (`,
    )
    expect(line(wrapper).text()).not.toContain('just now')
  })

  it('does not count an export that left the log out', async () => {
    recordBackup(['foods', 'goals'], NOW - HOUR)
    const wrapper = await replaceConfirm()

    expect(line(wrapper).text()).toContain('log: never.')
  })

  it('is not shown for a merge', async () => {
    const wrapper = mount(BackupRestore)
    await choose(wrapper, await fileOf(payload))
    await openWith(wrapper, 'correct horse')

    expect(wrapper.find('[data-testid=restore-last-backup]').exists()).toBe(false)
    expect(buttonByText(wrapper, 'Back up this device first')).toBeUndefined()
  })

  it('joins the replaced kinds with "and" before the last', async () => {
    await db.mealTemplates.put({ id: 'm', name: 'M', slots: [], updatedAt: 1 } as never)
    const wrapper = mount(BackupRestore)
    const everything: BackupPayload = {
      foods: [food('oats')],
      mealTemplates: [{ id: 'm', name: 'M', slots: [], updatedAt: 1 }],
      dayTemplates: [{ id: 'd', name: 'D', mealTemplateIds: ['m'], updatedAt: 1 }],
      logEntries: [],
      goals: [goal('energy', 2000)],
    }
    await choose(wrapper, await fileOf(everything))
    await openWith(wrapper, 'correct horse')
    await wrapper.get('#restore-mode-replace').setValue(true)

    expect(wrapper.get('[data-testid=restore-warning]').text()).toMatch(
      /^The foods, meal templates, day templates, log entries and daily goals on this device are replaced/,
    )
  })

  it('words two kinds with a bare "and" and one kind with none', async () => {
    const wrapper = await replaceConfirm()
    expect(wrapper.get('[data-testid=restore-warning]').text()).toMatch(
      /^The foods and daily goals on this device are replaced/,
    )

    await buttonByText(wrapper, 'Cancel')!.trigger('click')
    await choose(wrapper, await fileOf({ goals: [goal('energy', 2000)] }))
    await openWith(wrapper, 'correct horse')
    await wrapper.get('#restore-mode-replace').setValue(true)

    expect(wrapper.get('[data-testid=restore-warning]').text()).toMatch(
      /^The daily goals on this device is replaced/,
    )
  })

  describe('with the export form on the same page', () => {
    const Page = defineComponent({
      render: () => h('div', [h(BackupExport), h(BackupRestore)]),
    })

    async function openedPage() {
      const wrapper = mount(Page, { attachTo: document.body })
      mounted.push(wrapper)
      await vi.waitFor(() => expect(wrapper.find('.count').text()).not.toBe('–'))

      const input = wrapper.get<HTMLInputElement>('input[type=file]')
      Object.defineProperty(input.element, 'files', {
        value: [await fileOf(payload)],
        configurable: true,
      })
      await input.trigger('change')
      await flushPromises()
      await wrapper.get('#restore-passphrase').setValue('correct horse')
      await wrapper.get('.restore form').trigger('submit')
      await vi.waitFor(() => expect(wrapper.find('#restore-mode-replace').exists()).toBe(true))
      await wrapper.get('#restore-mode-replace').setValue(true)

      return wrapper
    }

    it('focuses the export passphrase and leaves the opened backup and its confirm in place', async () => {
      const wrapper = await openedPage()
      const before = await snapshot()
      expect(document.activeElement?.id).not.toBe('backup-passphrase')

      await buttonByText(wrapper, 'Back up this device first')!.trigger('click')

      expect(document.activeElement?.id).toBe('backup-passphrase')
      expect(wrapper.find('[data-testid=restore-summary]').exists()).toBe(true)
      expect(buttonByText(wrapper, 'Replace my data')!.attributes('disabled')).toBeUndefined()
      expect(wrapper.get<HTMLInputElement>('#restore-mode-replace').element.checked).toBe(true)
      expect(await snapshot()).toEqual(before)
    })

    it('updates the freshness line once the export is recorded, and the replace still works', async () => {
      vi.stubGlobal('navigator', {})
      URL.createObjectURL = vi.fn(() => 'blob:ration')
      URL.revokeObjectURL = vi.fn()
      vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
      // jsdom has no scrollIntoView; the page calls it on the confirm heading.
      const scrolled = vi.fn()
      Element.prototype.scrollIntoView = scrolled
      const wrapper = await openedPage()
      expect(line(wrapper).text()).toContain('log: never.')

      await wrapper.get('#backup-passphrase').setValue('a long passphrase for a backup')
      await wrapper.get('#backup-passphrase-again').setValue('a long passphrase for a backup')
      await wrapper.get('form.export').trigger('submit')
      await vi.waitFor(() => expect(wrapper.find('[data-testid=done]').exists()).toBe(true))
      await flushPromises()

      expect(lastBackupAt()).toBe(NOW)
      expect(line(wrapper).text()).toContain('Last backup of this device’s log: now (')
      expect(line(wrapper).attributes('data-stale')).toBeUndefined()
      // The user lands back on the confirm, with nothing activated.
      expect(scrolled).toHaveBeenCalled()
      expect(document.activeElement?.id).toBe('restore-confirm-heading')
      expect(await db.foods.get('local-food')).toBeDefined()
      // The opened backup is still there, and the replace is still the same single step.
      expect(wrapper.find('[data-testid=restore-summary]').exists()).toBe(true)

      await buttonByText(wrapper, 'Replace my data')!.trigger('click')
      await vi.waitFor(() => expect(wrapper.find('[data-testid=restore-done]').exists()).toBe(true))
      expect((await db.foods.toArray()).map((f) => f.id).sort()).toEqual(['milk', 'oats'])
    })

    it('does not move anything when an export finishes with no restore open', async () => {
      const scrolled = vi.fn()
      Element.prototype.scrollIntoView = scrolled
      const wrapper = mount(Page, { attachTo: document.body })
      mounted.push(wrapper)
      await flushPromises()

      recordBackup(['logEntries'], NOW)
      await flushPromises()

      expect(scrolled).not.toHaveBeenCalled()
      expect(document.activeElement?.id).not.toBe('restore-confirm-heading')
    })
  })
})
