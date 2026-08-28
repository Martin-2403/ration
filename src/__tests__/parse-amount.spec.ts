import { describe, expect, it } from 'vitest'

import { parseAmount } from '../parse-amount'

describe('parseAmount', () => {
  it.each([
    ['', 'empty'],
    ['   ', 'whitespace only'],
  ])('treats %s as blank (%s)', (raw) => {
    expect(parseAmount(raw)).toEqual({ kind: 'blank' })
  })

  it.each([
    ['5', 5],
    ['150', 150],
    ['0', 0],
    ['5.5', 5.5],
    ['.5', 0.5],
    ['5.', 5],
    ['  42  ', 42],
    ['-5', -5],
  ])('parses %s as %s', (raw, expected) => {
    expect(parseAmount(raw)).toEqual({ kind: 'number', value: expected })
  })

  it.each([
    ['5,5', 5.5],
    [',5', 0.5],
    ['1,25', 1.25],
  ])('accepts the decimal comma: %s is %s', (raw, expected) => {
    // German uses a comma as the decimal separator (§14), and a number input
    // rejects it outright in some locales — the field just empties.
    expect(parseAmount(raw)).toEqual({ kind: 'number', value: expected })
  })

  it.each([
    ['abc', 'letters'],
    ['e', 'a lone exponent character'],
    ['1e3', 'exponent notation'],
    ['12abc', 'trailing letters'],
    ['1 234', 'an internal space'],
    ['--5', 'a doubled sign'],
    ['5.5.5', 'two separators'],
    ['5,5,5', 'two commas'],
    ['.', 'a bare separator'],
    ['-', 'a bare sign'],
    ['+5', 'a leading plus'],
    ['NaN', 'the word NaN'],
    ['Infinity', 'the word Infinity'],
  ])('refuses %s (%s)', (raw) => {
    expect(parseAmount(raw)).toEqual({ kind: 'not-a-number' })
  })

  it('reports a negative as a number, leaving the sign to the caller', () => {
    // "not a number" and "negative" need different messages, so the parser does
    // not conflate them.
    expect(parseAmount('-5')).toEqual({ kind: 'number', value: -5 })
  })
})
