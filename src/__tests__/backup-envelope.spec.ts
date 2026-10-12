import { describe, expect, it } from 'vitest'
import {
  BackupError,
  ENVELOPE_SCHEMA_VERSION,
  PBKDF2_ITERATIONS,
  decryptBackup,
  encryptBackup,
  parseEnvelope,
  type BackupEnvelope,
  type BackupPayload,
} from '../backup/envelope'

const FAST = { iterations: 1_000 }
const payload: BackupPayload = {
  foods: [{ id: 'f1', name: 'Haferflocken', kcal: 372 }],
  logEntries: [{ id: 'l1', timestamp: 1_760_000_000_000, grams: 0, note: null }],
  mealTemplates: [],
  dayTemplates: [],
  goals: [{ kcal: 2000 }],
}

async function code(p: Promise<unknown>) {
  try {
    await p
  } catch (e) {
    expect(e).toBeInstanceOf(BackupError)
    return (e as BackupError).code
  }
  return 'resolved'
}

describe('backup envelope', () => {
  it('round-trips through file text', async () => {
    const env = await encryptBackup(payload, 'correct horse', FAST)
    expect(env.schemaVersion).toBe(ENVELOPE_SCHEMA_VERSION)
    expect(env.classes).toEqual(Object.keys(payload))
    expect(JSON.stringify(env)).not.toContain('Haferflocken')
    expect(await decryptBackup(JSON.stringify(env), 'correct horse')).toEqual(payload)
  })

  it('uses a fresh salt and IV per file', async () => {
    const a = await encryptBackup(payload, 'pw', FAST)
    const b = await encryptBackup(payload, 'pw', FAST)
    expect(a.kdf.salt).not.toBe(b.kdf.salt)
    expect(a.cipher.iv).not.toBe(b.cipher.iv)
  })

  it('rejects a wrong passphrase', async () => {
    const env = await encryptBackup(payload, 'right', FAST)
    expect(await code(decryptBackup(env, 'wrong'))).toBe('decryption-failed')
  })

  it('rejects tampered ciphertext', async () => {
    const env = await encryptBackup(payload, 'pw', FAST)
    const bytes = atob(env.ciphertext)
    const flipped = String.fromCharCode(bytes.charCodeAt(0) ^ 1) + bytes.slice(1)
    expect(await code(decryptBackup({ ...env, ciphertext: btoa(flipped) }, 'pw'))).toBe(
      'decryption-failed',
    )
  })

  it.each<[string, (e: BackupEnvelope) => BackupEnvelope]>([
    ['iterations', (e) => ({ ...e, kdf: { ...e.kdf, iterations: 1_001 } })],
    ['classes', (e) => ({ ...e, classes: [...e.classes, 'labs'] })],
    ['createdAt', (e) => ({ ...e, createdAt: '2000-01-01T00:00:00.000Z' })],
  ])('rejects a tampered %s header', async (_name, tamper) => {
    const env = await encryptBackup(payload, 'pw', FAST)
    expect(await code(decryptBackup(tamper(env), 'pw'))).toBe('decryption-failed')
  })

  it('decrypts an envelope written with a lower iteration count', async () => {
    const env = await encryptBackup(payload, 'pw', { iterations: 1_000 })
    expect(env.kdf.iterations).toBe(1_000)
    expect(await decryptBackup(env, 'pw')).toEqual(payload)
  })

  it('refuses a newer schema version', async () => {
    const env = await encryptBackup(payload, 'pw', FAST)
    const newer = JSON.stringify({ ...env, schemaVersion: ENVELOPE_SCHEMA_VERSION + 1 })
    expect(await code(decryptBackup(newer, 'pw'))).toBe('unsupported-version')
  })

  it.each([
    ['not json', '{nope'],
    ['not an object', '[1]'],
    ['missing fields', '{"schemaVersion":1}'],
  ])('reports malformed input: %s', (_name, text) => {
    expect(() => parseEnvelope(text)).toThrowError(BackupError)
  })

  it('round-trips a large payload', async () => {
    const rows = Array.from({ length: 50_000 }, (_, i) => ({
      id: `row-${i}`,
      text: 'x'.repeat(40),
    }))
    const big: BackupPayload = { foods: rows }
    const env = await encryptBackup(big, 'pw', FAST)
    expect(await decryptBackup(JSON.stringify(env), 'pw')).toEqual(big)
  })

  it('round-trips with the real default iteration count', async () => {
    const env = await encryptBackup(payload, 'pw')
    expect(env.kdf.iterations).toBe(PBKDF2_ITERATIONS)
    expect(await decryptBackup(env, 'pw')).toEqual(payload)
  }, 30_000)

  it('treats composed and decomposed forms of a passphrase as the same', async () => {
    const env = await encryptBackup(payload, 'Gr\u00fc\u00dfe', FAST)
    expect(await decryptBackup(env, 'Gru\u0308\u00dfe')).toEqual(payload)
  })

  it('rejects an empty passphrase on encrypt and decrypt', async () => {
    expect(await code(encryptBackup(payload, '', FAST))).toBe('empty-passphrase')
    const env = await encryptBackup(payload, 'pw', FAST)
    expect(await code(decryptBackup(env, ''))).toBe('empty-passphrase')
  })

  it('rejects a payload whose keys differ from the listed classes', async () => {
    const env = await encryptBackup(payload, 'pw', { ...FAST, classes: ['foods'] })
    expect(await code(decryptBackup(env, 'pw'))).toBe('malformed')
  })
})
