/**
 * Asking the browser to keep our data, and reading back what it said (§10).
 *
 * Every API here is optional: `navigator.storage` is missing in jsdom and in
 * older browsers, and each call can reject. Nothing in this module throws, and
 * nothing a caller does with it may block or fail a write.
 *
 * What the research on #8 supports, and what it does not: a granted
 * `persist()` makes a bucket persistent under the Storage Standard, but no
 * source says it survives pressure eviction on iOS. The states below describe
 * what the browser answered, not whether the data is safe.
 */

export type PersistenceState =
  /** `persisted()` reports true. */
  | 'granted'
  /** We asked and the browser declined (or `persisted()` still says no). */
  | 'refused'
  /** Supported, but no write has asked yet. */
  | 'not-asked'
  /** No Storage API, or it failed when read. */
  | 'unsupported'

export interface StorageEstimate {
  /** Bytes in use, as the browser estimates it. */
  usage: number
  /** Bytes the origin may use, as the browser estimates it. */
  quota: number
}

/**
 * Whether we have asked before, so a later session does not ask again.
 *
 * localStorage rather than a Dexie row: it is synchronous, needs no schema
 * version, and a write to Dexie from inside the first Dexie write would be
 * circular. It is evictable along with IndexedDB, but it only caches the
 * answer — `persisted()` stays the source of truth and is always re-read, so
 * losing the flag costs one more `persist()` call, which is harmless.
 */
const ASKED_KEY = 'ration.persist-asked'

type Asked = 'granted' | 'refused'

function remembered(): Asked | undefined {
  try {
    const value = localStorage.getItem(ASKED_KEY)

    return value === 'granted' || value === 'refused' ? value : undefined
  } catch {
    return undefined
  }
}

function remember(outcome: Asked): void {
  try {
    localStorage.setItem(ASKED_KEY, outcome)
  } catch {
    // Private mode or a full disk: we just ask again next session.
  }
}

const storage = (): StorageManager | undefined =>
  typeof navigator === 'undefined' ? undefined : navigator.storage

/** The one request in flight or finished this session. */
let requested: Promise<void> | undefined

/** Test seam: forget this session's request. */
export function resetPersistenceSession(): void {
  requested = undefined
}

/**
 * Asks for persistent storage at most once per session, and not at all once an
 * earlier session has asked. Never rejects.
 *
 * Called from the first user write, not at page load: Chrome decides from
 * engagement and Safari from heuristics such as being installed, so asking
 * when there is something worth keeping is the earliest it can mean anything.
 */
export function requestPersistence(): Promise<void> {
  requested ??= ask()

  return requested
}

async function ask(): Promise<void> {
  try {
    const manager = storage()
    if (!manager || typeof manager.persist !== 'function') return
    if (remembered()) return

    // Already persistent (e.g. installed): nothing to ask, but note it.
    if (typeof manager.persisted === 'function' && (await manager.persisted())) {
      remember('granted')

      return
    }

    remember((await manager.persist()) ? 'granted' : 'refused')
  } catch {
    // A rejected request is not an answer, so nothing is remembered and the
    // next session tries again.
  }
}

/** What the browser says now, falling back to what we remember of asking. */
export async function readPersistence(): Promise<PersistenceState> {
  const manager = storage()
  if (!manager || typeof manager.persisted !== 'function') return 'unsupported'

  try {
    if (await manager.persisted()) return 'granted'
  } catch {
    return 'unsupported'
  }

  return remembered() === undefined ? 'not-asked' : 'refused'
}

/** Rough usage and quota, or undefined when the browser will not say. */
export async function readEstimate(): Promise<StorageEstimate | undefined> {
  const manager = storage()
  if (!manager || typeof manager.estimate !== 'function') return undefined

  try {
    const { usage, quota } = await manager.estimate()

    // Zero is a real usage; only a missing figure is unknown.
    return usage === undefined || quota === undefined ? undefined : { usage, quota }
  } catch {
    return undefined
  }
}

/** Whether the app runs as an installed PWA rather than in a browser tab. */
export function isInstalled(): boolean {
  if (typeof window === 'undefined') return false

  // iOS Safari's own flag; not in the DOM typings.
  if ((navigator as Navigator & { standalone?: boolean }).standalone === true) return true

  return typeof window.matchMedia === 'function'
    ? window.matchMedia('(display-mode: standalone)').matches
    : false
}
