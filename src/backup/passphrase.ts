/**
 * Passphrase check for an export (§10). It warns; it does not decide.
 *
 * The file can be attacked offline for as long as it exists, with PBKDF2 slowing
 * each guess but not stopping it, so length and variety are what the user can
 * actually control. This is a heuristic on length and character variety only: it
 * cannot tell a guessable phrase ("password1234!") from a random one, and a
 * passing result is not a promise. Only an empty passphrase is refused, because
 * that is the one the crypto layer cannot accept.
 */
export type PassphraseCheck =
  /** Nothing typed: the export is blocked. */
  | { kind: 'empty' }
  /** Allowed, but the user is told why it is thin. */
  | { kind: 'weak'; reason: string }
  | { kind: 'ok' }

const MIN_LENGTH = 12
/** Below this, a passphrase of one kind of character (all lowercase, say) is called weak. */
const COMFORTABLE_LENGTH = 16
const MIN_DISTINCT = 8

export function checkPassphrase(passphrase: string): PassphraseCheck {
  if (passphrase.length === 0) return { kind: 'empty' }

  // Counted in code points, so an emoji or a composed letter is one character.
  const chars = [...passphrase]

  if (chars.length < MIN_LENGTH) {
    return {
      kind: 'weak',
      reason: `Only ${chars.length} characters. Twelve or more is better; a phrase of four or five unrelated words is easy to remember and hard to guess.`,
    }
  }

  if (new Set(chars).size < MIN_DISTINCT) {
    return { kind: 'weak', reason: 'It repeats the same few characters.' }
  }

  const kinds = [/\p{Ll}/u, /\p{Lu}/u, /\p{N}/u, /[^\p{L}\p{N}]/u].filter((kind) =>
    kind.test(passphrase),
  ).length

  if (chars.length < COMFORTABLE_LENGTH && kinds < 2) {
    return {
      kind: 'weak',
      reason: 'It uses one kind of character. A longer passphrase, or a mix, is stronger.',
    }
  }

  return { kind: 'ok' }
}
