import { describe, expect, it } from 'vitest'

import { checkPassphrase } from '../backup/passphrase'

describe('checkPassphrase', () => {
  it('blocks an empty passphrase', () => {
    expect(checkPassphrase('')).toEqual({ kind: 'empty' })
  })

  it.each([
    ['a short one', 'hunter2'],
    ['eleven characters of every kind', 'Abcdef1!ghi'],
    ['a long run of one character', 'aaaaaaaaaaaaaaaaaaaa'],
    ['one kind of character, under sixteen', 'abcdefghijklmn'],
  ])('warns about %s', (_name, passphrase) => {
    expect(checkPassphrase(passphrase).kind).toBe('weak')
  })

  it.each([
    ['four words with spaces', 'correct horse battery staple'],
    ['sixteen lowercase letters', 'abcdefghijklmnop'],
    ['twelve mixed characters', 'Tr0ub4dor&3x'],
    ['umlauts and a space', 'Müsli am Morgen'],
  ])('accepts %s', (_name, passphrase) => {
    expect(checkPassphrase(passphrase).kind).toBe('ok')
  })

  it('counts a character, not a UTF-16 unit', () => {
    // Sixteen emoji are sixteen characters even though each is two code units.
    expect(checkPassphrase('😀😁😂🤣😃😄😅😆😉😊😋😎😍😘😗😙').kind).toBe('ok')
    // Eleven are short, though twenty-two code units would not be.
    expect(checkPassphrase('😀😁😂🤣😃😄😅😆😉😊😋').kind).toBe('weak')
  })

  it('says why it is weak', () => {
    const result = checkPassphrase('hunter2')

    expect(result.kind === 'weak' && result.reason).toContain('7 characters')
  })
})
