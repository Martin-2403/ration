// Before db.ts constructs its Dexie instance.
import 'fake-indexeddb/auto'

import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { decryptBackup } from '../../backup/envelope'
import { lastBackupAt } from '../../backup/last-backup'
import { db } from '../../db'
import BackupExport from '../BackupExport.vue'

// The component uses the production iteration count; 600,000 rounds per test
// would make this file take minutes. Everything else in the envelope is real.
vi.mock('../../backup/envelope', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../backup/envelope')>()

  return {
    ...original,
    encryptBackup: (payload: Parameters<typeof original.encryptBackup>[0], pass: string) =>
      original.encryptBackup(payload, pass, { iterations: 1000 }),
  }
})

const PASS = 'correct horse battery staple'

const render = async () => {
  const wrapper = mount(BackupExport)
  // The counts arrive from IndexedDB, which settles on its own timers.
  await vi.waitFor(() => expect(wrapper.find('.count').text()).not.toBe('–'))

  return wrapper
}

type Wrapper = Awaited<ReturnType<typeof render>>

async function typePassphrases(wrapper: Wrapper, first: string, second = first) {
  await wrapper.get('#backup-passphrase').setValue(first)
  await wrapper.get('#backup-passphrase-again').setValue(second)
}

const button = (wrapper: Wrapper) => wrapper.get('button[type=submit]')

/** Submits and waits for the encrypt-and-hand-off to finish. */
async function submit(wrapper: Wrapper) {
  await wrapper.get('form').trigger('submit')
  await vi.waitFor(() => expect(wrapper.attributes('aria-busy')).toBeUndefined())
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
  vi.spyOn(Date, 'now').mockReturnValue(new Date(2026, 9, 12, 21, 30).getTime())
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

/** A browser that can share files; `share` receives what the component hands over. */
const sharing = (share: (data: ShareData) => Promise<void>) =>
  vi.stubGlobal('navigator', { canShare: () => true, share })

describe('BackupExport form', () => {
  it('starts with every class ticked and a row count beside each', async () => {
    await db.foods.put({ id: 'oats', name: 'Oats', per100g: {}, updatedAt: 1 })
    await db.nutrientGoals.put({ nutrient: 'protein', target: 90, updatedAt: 1 })
    const wrapper = await render()

    const boxes = wrapper.findAll('input[type=checkbox]')
    expect(boxes).toHaveLength(5)
    expect(boxes.every((box) => (box.element as HTMLInputElement).checked)).toBe(true)
    expect(wrapper.text()).toContain('1 item')
    expect(wrapper.text()).toContain('0 items')
  })

  it('says never until a backup has been made', async () => {
    const wrapper = await render()

    expect(wrapper.get('[data-testid=last-backup]').text()).toBe('Last backup of your log: never')
  })

  it('warns, without blocking, when days are ticked but their meals are not', async () => {
    const wrapper = await render()
    await typePassphrases(wrapper, PASS)
    expect(wrapper.find('[data-testid=days-without-meals]').exists()).toBe(false)

    await wrapper.get('input[type=checkbox][value=mealTemplates]').setValue(false)

    expect(wrapper.get('[data-testid=days-without-meals]').text()).toContain('restore will refuse')
    expect(button(wrapper).attributes('disabled')).toBeUndefined()

    await wrapper.get('input[type=checkbox][value=dayTemplates]').setValue(false)
    expect(wrapper.find('[data-testid=days-without-meals]').exists()).toBe(false)
  })

  it('states that the passphrase is the only key, before the button is used', async () => {
    const wrapper = await render()

    expect(wrapper.get('[data-testid=no-recovery]').text()).toMatch(/no account/i)
    expect(wrapper.get('[data-testid=no-recovery]').text()).toMatch(/only key/i)
  })

  it('labels both passphrase fields and keeps them out of autofill and plain sight', async () => {
    const wrapper = await render()

    for (const id of ['backup-passphrase', 'backup-passphrase-again']) {
      const input = wrapper.get(`#${id}`)
      expect(input.attributes('type')).toBe('password')
      expect(input.attributes('autocomplete')).toBe('new-password')
      expect(wrapper.find(`label[for=${id}]`).exists()).toBe(true)
    }
  })

  it('blocks an empty passphrase', async () => {
    const wrapper = await render()

    expect(button(wrapper).attributes('disabled')).toBeDefined()
    expect(wrapper.get('[data-testid=blocker]').text()).toContain('Enter a passphrase')
  })

  it('blocks and says so when the two passphrases differ', async () => {
    const wrapper = await render()
    await typePassphrases(wrapper, PASS, PASS + 'x')

    expect(wrapper.get('[data-testid=mismatch]').text()).toContain('do not match')
    expect(wrapper.get('#backup-passphrase-again').attributes('aria-invalid')).toBe('true')
    expect(button(wrapper).attributes('disabled')).toBeDefined()
  })

  it('does not call it a mismatch while the second field is still empty', async () => {
    const wrapper = await render()
    await wrapper.get('#backup-passphrase').setValue(PASS)

    expect(wrapper.find('[data-testid=mismatch]').exists()).toBe(false)
    expect(button(wrapper).attributes('disabled')).toBeDefined()
  })

  it('warns about a weak passphrase but lets it through', async () => {
    const wrapper = await render()
    await typePassphrases(wrapper, 'hunter2')

    expect(wrapper.get('[data-testid=weak]').text()).toContain('Weak passphrase')
    expect(button(wrapper).attributes('disabled')).toBeUndefined()
  })

  it('shows no warning for a long passphrase', async () => {
    const wrapper = await render()
    await typePassphrases(wrapper, PASS)

    expect(wrapper.find('[data-testid=weak]').exists()).toBe(false)
    expect(button(wrapper).attributes('disabled')).toBeUndefined()
  })

  it('blocks when no class is chosen', async () => {
    const wrapper = await render()
    await typePassphrases(wrapper, PASS)
    for (const box of wrapper.findAll('input[type=checkbox]')) await box.setValue(false)

    expect(wrapper.get('[data-testid=blocker]').text()).toContain('at least one')
    expect(button(wrapper).attributes('disabled')).toBeDefined()
  })
})

const downloads = () => {
  URL.createObjectURL = vi.fn(() => 'blob:ration')
  URL.revokeObjectURL = vi.fn()
  const names: string[] = []
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    names.push(this.download)
  })

  return names
}

const field = (wrapper: Wrapper, id: string) =>
  (wrapper.get(`#${id}`).element as HTMLInputElement).value

/** The second tap, on a browser that shares. */
async function tapShare(wrapper: Wrapper) {
  await wrapper.get('[data-testid=ready] button:not(.ghost)').trigger('click')
  await vi.waitFor(() => expect(wrapper.attributes('aria-busy')).toBeUndefined())
}

const entry = {
  id: 5,
  name: 'Porridge',
  timestamp: 10,
  createdAt: 20,
  updatedAt: 30,
  items: [],
  totals: {},
}
const NOW = new Date(2026, 9, 12, 21, 30).getTime()

describe('BackupExport on a browser that shares files', () => {
  it('encrypts first and waits for a fresh tap before opening the share sheet', async () => {
    const share = vi.fn(async () => {})
    sharing(share)
    const wrapper = await render()
    await typePassphrases(wrapper, PASS)
    await submit(wrapper)

    expect(share).not.toHaveBeenCalled()
    expect(wrapper.get('[data-testid=ready]').text()).toContain('Backup ready')
    expect(lastBackupAt()).toBeUndefined()
    // Not a backup yet, so the passphrase stays and the form cannot be edited under it.
    expect(field(wrapper, 'backup-passphrase')).toBe(PASS)
    expect(wrapper.get('#backup-passphrase').attributes('disabled')).toBeDefined()
    expect(wrapper.find('button[type=submit]').exists()).toBe(false)
  })

  it('shares a file that decrypts back to the stored data, then records and clears', async () => {
    await db.logEntries.put(entry)
    await db.nutrientGoals.put({ nutrient: 'protein', target: 90, updatedAt: 40 })
    const shared: File[] = []
    sharing(async (data) => void shared.push(...(data.files ?? [])))

    const wrapper = await render()
    await typePassphrases(wrapper, PASS)
    await submit(wrapper)
    await tapShare(wrapper)

    expect(shared).toHaveLength(1)
    expect(shared[0]!.name).toBe('ration-backup-2026-10-12.json')

    const payload = await decryptBackup(await shared[0]!.text(), PASS)
    expect(payload.logEntries).toEqual([entry])
    expect(payload.goals).toEqual([{ nutrient: 'protein', target: 90, updatedAt: 40 }])
    expect(payload.foods).toEqual([])

    expect(lastBackupAt()).toBe(NOW)
    expect(wrapper.get('[data-testid=last-backup]').text()).toContain('Log history')
    expect(wrapper.get('[data-testid=done]').text()).toContain(
      'Shared ration-backup-2026-10-12.json',
    )
    expect(wrapper.find('[data-testid=ready]').exists()).toBe(false)
    expect(field(wrapper, 'backup-passphrase')).toBe('')
    expect(field(wrapper, 'backup-passphrase-again')).toBe('')
  })

  it('puts only the chosen classes in the file', async () => {
    await db.logEntries.put(entry)
    const shared: File[] = []
    sharing(async (data) => void shared.push(...(data.files ?? [])))

    const wrapper = await render()
    await typePassphrases(wrapper, PASS)
    await wrapper.get('input[type=checkbox][value=logEntries]').setValue(false)
    await submit(wrapper)
    await tapShare(wrapper)

    const payload = await decryptBackup(await shared[0]!.text(), PASS)
    expect(Object.keys(payload).sort()).toEqual(['dayTemplates', 'foods', 'goals', 'mealTemplates'])
  })

  it('does not record a backup, or show an error, when the share sheet is cancelled', async () => {
    const share = vi.fn(async () => {
      throw new DOMException('closed', 'AbortError')
    })
    sharing(share)
    const wrapper = await render()
    await typePassphrases(wrapper, PASS)
    await submit(wrapper)
    await tapShare(wrapper)

    expect(share).toHaveBeenCalledOnce()
    expect(lastBackupAt()).toBeUndefined()
    expect(wrapper.get('[data-testid=last-backup]').text()).toBe('Last backup of your log: never')
    expect(wrapper.find('[data-testid=failed]').exists()).toBe(false)
    expect(wrapper.find('[data-testid=done]').exists()).toBe(false)
    // Still ready, passphrase kept: trying again costs one tap.
    expect(wrapper.find('[data-testid=ready]').exists()).toBe(true)
    expect(field(wrapper, 'backup-passphrase')).toBe(PASS)
  })

  it('shares the same file again on a retry after a cancel, and records only then', async () => {
    const seen: File[] = []
    let calls = 0
    sharing(async (data) => {
      seen.push(...(data.files ?? []))
      if (++calls === 1) throw new DOMException('closed', 'AbortError')
    })
    const wrapper = await render()
    await typePassphrases(wrapper, PASS)
    await submit(wrapper)
    await tapShare(wrapper)
    expect(lastBackupAt()).toBeUndefined()

    await tapShare(wrapper)

    expect(seen).toHaveLength(2)
    expect(seen[1]).toBe(seen[0])
    expect(lastBackupAt()).toBe(NOW)
    expect(wrapper.find('[data-testid=ready]').exists()).toBe(false)
  })

  it('saves a file and says so when the sheet refuses for another reason', async () => {
    const names = downloads()
    sharing(async () => {
      throw new DOMException('refused', 'NotAllowedError')
    })
    const wrapper = await render()
    await typePassphrases(wrapper, PASS)
    await submit(wrapper)
    await tapShare(wrapper)

    expect(names).toEqual(['ration-backup-2026-10-12.json'])
    expect(wrapper.get('[data-testid=done]').text()).toContain('saved as a file instead')
    expect(lastBackupAt()).toBe(NOW)
    expect(field(wrapper, 'backup-passphrase')).toBe('')
  })

  it('drops the file when it is discarded, and records nothing', async () => {
    const share = vi.fn(async () => {})
    sharing(share)
    const wrapper = await render()
    await typePassphrases(wrapper, PASS)
    await submit(wrapper)

    await wrapper.get('[data-testid=ready] button.ghost').trigger('click')

    expect(wrapper.find('[data-testid=ready]').exists()).toBe(false)
    expect(share).not.toHaveBeenCalled()
    expect(lastBackupAt()).toBeUndefined()
    expect(button(wrapper).attributes('disabled')).toBeUndefined()
  })
})

describe('BackupExport on a browser that cannot share files', () => {
  it('downloads in one step and records, then clears the passphrase', async () => {
    vi.stubGlobal('navigator', {})
    const names = downloads()

    const wrapper = await render()
    await typePassphrases(wrapper, PASS)
    await submit(wrapper)

    expect(names).toEqual(['ration-backup-2026-10-12.json'])
    expect(wrapper.find('[data-testid=ready]').exists()).toBe(false)
    expect(lastBackupAt()).toBe(NOW)
    expect(wrapper.get('[data-testid=done]').text()).toContain('Saved as a file')
    expect(field(wrapper, 'backup-passphrase')).toBe('')
  })
})

describe('BackupExport records what a backup held', () => {
  it('does not let a backup without the log stand in for one with it', async () => {
    vi.stubGlobal('navigator', {})
    downloads()
    const wrapper = await render()
    await typePassphrases(wrapper, PASS)
    await wrapper.get('input[type=checkbox][value=logEntries]').setValue(false)
    await submit(wrapper)

    expect(lastBackupAt()).toBeUndefined()
    expect(wrapper.get('[data-testid=last-backup]').text()).toBe('Last backup of your log: never')
    expect(wrapper.get('[data-testid=last-partial]').text()).toContain('did not include the log')
  })

  it('lists the classes the last full backup held', async () => {
    vi.stubGlobal('navigator', {})
    downloads()
    const wrapper = await render()
    await typePassphrases(wrapper, PASS)
    await wrapper.get('input[type=checkbox][value=goals]').setValue(false)
    await submit(wrapper)

    const text = wrapper.get('[data-testid=last-backup]').text()
    expect(text).toContain('Log history')
    expect(text).toContain('Foods')
    expect(text).not.toContain('Goals')
    expect(wrapper.find('[data-testid=last-partial]').exists()).toBe(false)
  })
})

describe('BackupExport failures', () => {
  it('reports a failure without recording a backup', async () => {
    sharing(async () => {})
    const wrapper = await render()
    vi.spyOn(db, 'transaction').mockRejectedValue(new Error('read failed'))
    await typePassphrases(wrapper, PASS)
    await submit(wrapper)

    expect(wrapper.get('[data-testid=failed]').text()).toContain('could not be created')
    expect(wrapper.find('[data-testid=ready]').exists()).toBe(false)
    expect(lastBackupAt()).toBeUndefined()
  })
})
