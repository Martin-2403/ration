/**
 * The §15 accessibility floor, enforced against tokens.css rather than checked
 * by hand (#11). Contrast is arithmetic on the token values, so a test is as
 * authoritative as a colour picker and — unlike one — it fails the next time a
 * token moves.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { contrastRatio, parsePalettes, type Palette } from './contrast'

// Read from the project root rather than relative to this module: under Vitest
// `import.meta.url` is an http URL from Vite's module graph, so `new URL` has no
// file path to resolve against. A `?raw` import is worse still — Vitest stubs
// CSS imports to an empty string by default, so the palette would parse as empty
// and every pair below would silently pass.
const css = readFileSync(resolve(process.cwd(), 'src/theme/tokens.css'), 'utf8')
const { light, dark } = parsePalettes(css)

/**
 * §15's floor is "AA: 4.5:1 body text, 3:1 large text and graphics", so which
 * one applies depends on how a token is used, not on what kind of colour it is.
 *
 * `text` — rendered as words at body or caption size somewhere in the app.
 * `graphic` — a bar fill, an indicator or a rule that carries meaning.
 *
 * `--line` is deliberately absent: hairline dividers and card borders are
 * decorative, and WCAG does not put a floor under them. Its ratio is ~1.2,
 * which is the intent (§15 asks for hairlines, not visible boxes).
 * `--primary-tint` is a fill that nothing currently sets text on; when
 * something does, it belongs here as a background, not as a foreground.
 */
const FOREGROUNDS: Record<string, 'text' | 'graphic'> = {
  ink: 'text',
  'ink-soft': 'text',
  // Nav labels, links and the active tab, all at caption or body size.
  primary: 'text',
  'primary-strong': 'text',
  // The over-target and shortfall wording, which §15 requires to be readable
  // as text precisely so colour is not carrying the meaning alone.
  'status-ok': 'text',
  'status-under': 'text',
  // Bars and data marks.
  'accent-blue': 'graphic',
  'macro-protein': 'graphic',
  'macro-carbs': 'graphic',
  'macro-fat': 'graphic',
  // Not text, but §15 names it in the same breath as contrast, and an invisible
  // focus ring fails the floor in a way nobody notices until they unplug a mouse.
  'focus-ring-color': 'graphic',
}

const FLOOR = { text: 4.5, graphic: 3 } as const

/** Every foreground against both backgrounds it can appear on. */
const pairs = (palette: Palette) =>
  Object.entries(FOREGROUNDS).flatMap(([token, role]) =>
    (['bg', 'surface'] as const).map((background) => ({
      name: `${token} on ${background}`,
      ratio: contrastRatio(palette[token]!, palette[background]!),
      floor: FLOOR[role],
    })),
  )

describe('contrast arithmetic', () => {
  // The formula is the thing everything else trusts, so it is pinned to values
  // that are not in dispute rather than to the palette it will be used on.
  it.each([
    { a: '#000000', b: '#ffffff', expected: 21 },
    { a: '#ffffff', b: '#ffffff', expected: 1 },
    { a: '#777777', b: '#ffffff', expected: 4.48 },
  ])('rates $a against $b as $expected:1', ({ a, b, expected }) => {
    expect(contrastRatio(a, b)).toBeCloseTo(expected, 1)
  })

  it('does not depend on the order of its arguments', () => {
    expect(contrastRatio('#146c6a', '#f4f7f7')).toBeCloseTo(
      contrastRatio('#f4f7f7', '#146c6a'),
      10,
    )
  })
})

describe('token parsing', () => {
  it('reads both palettes out of the real file', () => {
    expect(light.bg).toBe('#f4f7f7')
    expect(dark.bg).toBe('#0e1214')
  })

  it('resolves a token declared as var() of another', () => {
    // --focus-ring-color: var(--primary). Left unresolved it would be compared
    // as the string "var(--primary)" and quietly skipped.
    expect(light['focus-ring-color']).toBe(light.primary)
  })

  it('carries light values into dark for anything the dark block omits', () => {
    const { dark: computed } = parsePalettes(
      `:root { --bg: #ffffff; --ink: #000000; }
       @media (prefers-color-scheme: dark) { :root { --bg: #000000; } }`,
    )

    // What a browser computes, and the omission worth catching: a foreground
    // left at its light value on a dark background.
    expect(computed).toEqual({ bg: '#000000', ink: '#000000' })
  })

  it('ignores the non-colour tokens in the same file', () => {
    expect(light['space-4']).toBeUndefined()
    expect(light['font-sans']).toBeUndefined()
  })
})

describe.each([
  { scheme: 'light', palette: light },
  { scheme: 'dark', palette: dark },
])('$scheme palette', ({ palette }) => {
  it.each(pairs(palette))('$name meets $floor:1', ({ ratio, floor }) => {
    expect(ratio).toBeGreaterThanOrEqual(floor)
  })

  it('declares every foreground the floor covers', () => {
    // Guards the table above against drifting from the file: a renamed token
    // would otherwise be skipped rather than failing.
    for (const token of Object.keys(FOREGROUNDS)) {
      expect(palette[token], `${token} is missing from tokens.css`).toBeDefined()
    }
  })
})
