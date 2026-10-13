import { describe, expect, it } from 'vitest'

import { detectPlatform } from '../platform'

const MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)'

describe('detectPlatform', () => {
  it.each([
    [
      'an iPhone',
      { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Safari/604.1' },
      'ios',
    ],
    ['an iPad', { userAgent: 'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) Safari/604.1' }, 'ios'],
    [
      'an iPad reporting as a Mac',
      { userAgent: MAC, platform: 'MacIntel', maxTouchPoints: 5 },
      'ios',
    ],
    ['a Mac without touch', { userAgent: MAC, platform: 'MacIntel', maxTouchPoints: 0 }, 'other'],
    ['a Mac that does not say', { userAgent: MAC, platform: 'MacIntel' }, 'other'],
    [
      'Android',
      {
        userAgent: 'Mozilla/5.0 (Linux; Android 14) Chrome/120',
        platform: 'Linux armv81',
        maxTouchPoints: 5,
      },
      'other',
    ],
    ['Windows', { userAgent: 'Mozilla/5.0 (Windows NT 10.0)', platform: 'Win32' }, 'other'],
    ['nothing known', {}, 'other'],
  ] as const)('reads %s', (_name, info, expected) => {
    expect(detectPlatform(info)).toBe(expected)
  })
})
