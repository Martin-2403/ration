// Must come before db.ts, which constructs a Dexie instance on import.
import 'fake-indexeddb/auto'

import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { encryptBackup, type BackupPayload } from '../../backup/envelope'
import { db } from '../../db'
import BackupRestore from '../BackupRestore.vue'

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
