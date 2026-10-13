/**
 * Which kind of device this is, as far as the backup prompt cares (#147).
 *
 * Only one distinction is used: iOS, where every browser runs on WebKit and a
 * browser tab is the highest-risk place for the data to live (#8). Anything this
 * cannot positively recognise is 'other', which is the milder prompt: a wrong
 * guess in that direction costs a hint the user did not need, not a missing one
 * that would have mattered.
 */
export type Platform = 'ios' | 'other'

/** The parts of `navigator` that are read, so a test can hand in its own. */
export interface PlatformInfo {
  userAgent?: string
  platform?: string
  maxTouchPoints?: number
}

/**
 * iPhone, iPad and iPod announce themselves in the user agent. An iPad in its
 * default "desktop website" mode does not: it reports a Mac, which is told apart
 * from a real Mac by having a touch screen (no Mac reports touch points).
 */
export function detectPlatform(info?: PlatformInfo): Platform {
  const source = info ?? (typeof navigator === 'undefined' ? undefined : navigator)
  if (!source) return 'other'

  if (/iPhone|iPad|iPod/.test(source.userAgent ?? '')) return 'ios'

  const iPadAsMac = source.platform === 'MacIntel' && (source.maxTouchPoints ?? 0) > 1

  return iPadAsMac ? 'ios' : 'other'
}
