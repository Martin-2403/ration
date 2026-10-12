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
  /** We asked this session and the browser declined. */
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
 * Nothing is persisted about the answer, on purpose. A grant is always visible
 * through `persisted()`, which is the source of truth, so caching it would only
 * add a second copy that can disagree. A refusal must not be cached at all:
 * Chrome decides from engagement, and the first write is at near-zero
 * engagement, so a later session may be granted what this one was refused
 * (web.dev, see the research on #8). The refusal is remembered for this session
 * only, to keep the panel honest and to ask once per session.
 */
let refusedThisSession = false

const storage = (): StorageManager | undefined =>
  typeof navigator === 'undefined' ? undefined : navigator.storage

/** The one request in flight or finished this session. */
let requested: Promise<void> | undefined

/** Test seam: forget this session's request. */
export function resetPersistenceSession(): void {
  requested = undefined
  refusedThisSession = false
}

/**
 * Asks for persistent storage at most once per session, and not at all when the
 * browser already reports it persistent. A refusal is retried next session.
 * Never rejects.
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

    // Already persistent (e.g. installed): nothing to ask.
    if (typeof manager.persisted === 'function' && (await manager.persisted())) return

    refusedThisSession = !(await manager.persist())
  } catch {
    // A rejected request is not an answer; the next session tries again.
  }
}

/**
 * What the browser says now. 'refused' only describes this session's request:
 * a grant that is no longer in effect, or a refusal from an earlier session,
 * reads as 'not-asked', because the next write asks again.
 */
export async function readPersistence(): Promise<PersistenceState> {
  const manager = storage()
  if (!manager || typeof manager.persisted !== 'function') return 'unsupported'

  try {
    if (await manager.persisted()) return 'granted'
  } catch {
    return 'unsupported'
  }

  return refusedThisSession ? 'refused' : 'not-asked'
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
