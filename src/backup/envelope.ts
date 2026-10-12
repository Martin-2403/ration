/**
 * Backup envelope (PROJECT.md §10): a versioned JSON file whose payload is
 * encrypted with a passphrase. Pure and UI-free; it knows nothing about Dexie.
 * Reading rows out of the database and writing them back is a separate concern.
 *
 * WebCrypto only: passphrase -> PBKDF2 -> AES-GCM-256. Nothing is hand-rolled.
 */

/** Newest envelope format this build writes, and the newest it will read. */
export const ENVELOPE_SCHEMA_VERSION = 1

/**
 * Names of the data classes a backup can carry. An open union: supplements (#4)
 * and lab results (#6) join later without a format change, because the envelope
 * lists its classes and the payload is keyed by them.
 */
export type BackupClass =
  'foods' | 'logEntries' | 'mealTemplates' | 'dayTemplates' | 'goals' | (string & {})

/** Plain JSON data only: no Date, Map, Set or undefined. Dates go in as numbers or ISO strings. */
export type JsonValue =
  string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue }

/** Class name -> rows of that class. */
export type BackupPayload = { [name in BackupClass]?: JsonValue[] }

/**
 * PBKDF2-HMAC-SHA256 iteration count for new backups.
 * Source: OWASP Password Storage Cheat Sheet, PBKDF2 section, which lists
 * PBKDF2-HMAC-SHA256 at 600,000 iterations
 * (https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html,
 * retrieved 2026-10-12). The figure is per hash; it is not valid for other hashes.
 * Decryption reads the count from the envelope, never from this constant, so it
 * can be raised later without breaking old backups.
 */
export const PBKDF2_ITERATIONS = 600_000

export const PBKDF2_HASH = 'SHA-256'

/**
 * Salt length in bytes. A project choice: NIST SP 800-63B-4 requires at least
 * 32 bits (4 bytes); 16 random bytes sits well above that floor.
 * (https://pages.nist.gov/800-63-4/sp800-63b.html, retrieved 2026-10-12)
 */
export const SALT_BYTES = 16

/** AES-GCM nonce length: the 96 bits the algorithm is specified around. */
const IV_BYTES = 12

/** Hashes accepted when reading an envelope; anything else is treated as malformed. */
const ACCEPTED_HASHES = ['SHA-256', 'SHA-384', 'SHA-512']

/** Upper bound on an envelope's iteration count, so a hostile file cannot hang the device. */
const MAX_ITERATIONS = 10_000_000

export interface BackupEnvelope {
  schemaVersion: number
  /** ISO 8601, UTC. */
  createdAt: string
  classes: BackupClass[]
  kdf: { name: 'PBKDF2'; hash: string; iterations: number; salt: string }
  cipher: { name: 'AES-GCM'; iv: string }
  /** Base64 of the AES-GCM output (ciphertext followed by the auth tag). */
  ciphertext: string
}

export type BackupErrorCode =
  /** The file is not a well-formed envelope. */
  | 'malformed'
  /** The file was written by a newer version of the app. */
  | 'unsupported-version'
  /**
   * Authentication failed: wrong passphrase, or the ciphertext or header was
   * altered. AES-GCM cannot tell these apart, and neither can we.
   */
  | 'decryption-failed'

export class BackupError extends Error {
  readonly code: BackupErrorCode
  constructor(code: BackupErrorCode, message: string) {
    super(message)
    this.name = 'BackupError'
    this.code = code
  }
}

export interface EncryptOptions {
  /** Override for tests; production uses PBKDF2_ITERATIONS. */
  iterations?: number
  /** Override for tests. */
  now?: Date
}

const CHUNK = 0x8000

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(binary)
}

export function base64ToBytes(text: string): Uint8Array<ArrayBuffer> {
  let binary: string
  try {
    binary = atob(text)
  } catch {
    throw new BackupError('malformed', 'Backup contains invalid base64.')
  }
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

async function deriveKey(
  passphrase: string,
  salt: Uint8Array<ArrayBuffer>,
  hash: string,
  iterations: number,
): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey'],
  )
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash, iterations, salt },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

/**
 * The plaintext header, serialised in a fixed field order, bound to the
 * ciphertext as AES-GCM additional data. Editing any of it (classes, iteration
 * count, salt, IV, version, timestamp) makes decryption fail authentication.
 */
function headerBytes(e: Omit<BackupEnvelope, 'ciphertext'>): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(
    JSON.stringify([
      e.schemaVersion,
      e.createdAt,
      e.classes,
      [e.kdf.name, e.kdf.hash, e.kdf.iterations, e.kdf.salt],
      [e.cipher.name, e.cipher.iv],
    ]),
  )
}

/** Encrypts the payload into an envelope. The classes listed are the payload's keys. */
export async function encryptBackup(
  payload: BackupPayload,
  passphrase: string,
  options: EncryptOptions = {},
): Promise<BackupEnvelope> {
  const iterations = options.iterations ?? PBKDF2_ITERATIONS
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES))
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES))
  const header = {
    schemaVersion: ENVELOPE_SCHEMA_VERSION,
    createdAt: (options.now ?? new Date()).toISOString(),
    classes: Object.keys(payload),
    kdf: {
      name: 'PBKDF2' as const,
      hash: PBKDF2_HASH,
      iterations,
      salt: bytesToBase64(salt),
    },
    cipher: { name: 'AES-GCM' as const, iv: bytesToBase64(iv) },
  }
  const key = await deriveKey(passphrase, salt, PBKDF2_HASH, iterations)
  const sealed = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: headerBytes(header) },
    key,
    new TextEncoder().encode(JSON.stringify(payload)),
  )
  return { ...header, ciphertext: bytesToBase64(new Uint8Array(sealed)) }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/** Parses and validates backup file text. Throws BackupError, never returns partial data. */
export function parseEnvelope(text: string): BackupEnvelope {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new BackupError('malformed', 'Backup file is not valid JSON.')
  }
  if (!isRecord(raw)) throw new BackupError('malformed', 'Backup file is not an envelope.')

  const { schemaVersion, createdAt, classes, kdf, cipher, ciphertext } = raw
  if (typeof schemaVersion !== 'number' || !Number.isInteger(schemaVersion) || schemaVersion < 1) {
    throw new BackupError('malformed', 'Backup has no valid schema version.')
  }
  // Checked before the rest: a newer file may legitimately change the other fields.
  if (schemaVersion > ENVELOPE_SCHEMA_VERSION) {
    throw new BackupError(
      'unsupported-version',
      `Backup schema version ${schemaVersion} is newer than this app supports (${ENVELOPE_SCHEMA_VERSION}).`,
    )
  }
  if (
    typeof createdAt !== 'string' ||
    !Array.isArray(classes) ||
    !classes.every((c) => typeof c === 'string') ||
    !isRecord(kdf) ||
    kdf.name !== 'PBKDF2' ||
    typeof kdf.hash !== 'string' ||
    !ACCEPTED_HASHES.includes(kdf.hash) ||
    typeof kdf.iterations !== 'number' ||
    !Number.isInteger(kdf.iterations) ||
    kdf.iterations < 1 ||
    kdf.iterations > MAX_ITERATIONS ||
    typeof kdf.salt !== 'string' ||
    !isRecord(cipher) ||
    cipher.name !== 'AES-GCM' ||
    typeof cipher.iv !== 'string' ||
    typeof ciphertext !== 'string'
  ) {
    throw new BackupError('malformed', 'Backup envelope is missing or has invalid fields.')
  }
  if (base64ToBytes(cipher.iv).length !== IV_BYTES || base64ToBytes(kdf.salt).length === 0) {
    throw new BackupError('malformed', 'Backup envelope has an invalid salt or IV.')
  }
  return {
    schemaVersion,
    createdAt,
    classes: classes as string[],
    kdf: { name: 'PBKDF2', hash: kdf.hash, iterations: kdf.iterations, salt: kdf.salt },
    cipher: { name: 'AES-GCM', iv: cipher.iv },
    ciphertext,
  }
}

/**
 * Decrypts an envelope (an object, or file text). Iterations and hash come from
 * the envelope. Throws BackupError; on failure nothing partial is returned.
 */
export async function decryptBackup(
  input: BackupEnvelope | string,
  passphrase: string,
): Promise<BackupPayload> {
  const envelope = parseEnvelope(typeof input === 'string' ? input : JSON.stringify(input))
  const key = await deriveKey(
    passphrase,
    base64ToBytes(envelope.kdf.salt),
    envelope.kdf.hash,
    envelope.kdf.iterations,
  )
  let plain: ArrayBuffer
  try {
    plain = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: base64ToBytes(envelope.cipher.iv),
        additionalData: headerBytes(envelope),
      },
      key,
      base64ToBytes(envelope.ciphertext),
    )
  } catch {
    throw new BackupError(
      'decryption-failed',
      'Wrong passphrase, or the backup has been altered or damaged.',
    )
  }
  let payload: unknown
  try {
    payload = JSON.parse(new TextDecoder().decode(plain))
  } catch {
    throw new BackupError('malformed', 'Backup payload is not valid JSON.')
  }
  if (!isRecord(payload) || !Object.values(payload).every(Array.isArray)) {
    throw new BackupError('malformed', 'Backup payload is not a map of class name to rows.')
  }
  return payload as BackupPayload
}
