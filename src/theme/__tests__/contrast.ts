/**
 * WCAG contrast arithmetic, and just enough CSS parsing to read the palette out
 * of tokens.css (#11).
 *
 * Lives in __tests__ because nothing in the app needs it: the point is to check
 * the tokens at build time, not to compute ratios at runtime. Kept out of the
 * spec file so the maths can itself be tested against known reference values —
 * a contrast check with a wrong formula is worse than none, because it reports
 * a floor that was never actually met.
 */

/** A palette is custom-property names (without the `--`) to hex colours. */
export type Palette = Record<string, string>

/**
 * sRGB channel to linear light, per WCAG 2.x relative luminance.
 * https://www.w3.org/TR/WCAG22/#dfn-relative-luminance
 */
function channel(value: number): number {
  const c = value / 255

  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
}

function luminance(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16)

  return (
    0.2126 * channel((n >> 16) & 0xff) +
    0.7152 * channel((n >> 8) & 0xff) +
    0.0722 * channel(n & 0xff)
  )
}

/**
 * WCAG contrast ratio, 1 to 21. Symmetric: the lighter colour is the numerator
 * whichever order the arguments arrive in.
 */
export function contrastRatio(a: string, b: string): number {
  const [lighter, darker] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number]

  return (lighter + 0.05) / (darker + 0.05)
}

/** Six-digit hex only — the palette is written that way and shorthand would
 *  silently parse as the wrong colour if it ever appeared. */
const HEX = /^#[0-9a-f]{6}$/i
const DECLARATION = /--([\w-]+)\s*:\s*([^;]+);/g
const LIGHT_BLOCK = /:root\s*\{([^}]*)\}/
const DARK_BLOCK = /@media\s*\(prefers-color-scheme:\s*dark\)\s*\{\s*:root\s*\{([^}]*)\}/

function declarationsIn(block: string): Palette {
  const found: Palette = {}

  for (const [, name, rawValue] of block.matchAll(DECLARATION)) {
    // Strip trailing comments, which tokens.css uses on most lines.
    const value = rawValue!.replace(/\/\*[\s\S]*?\*\//g, '').trim()

    found[name!] = value
  }

  return found
}

/** Resolves one level of `var(--x)`, which is how the focus ring is declared. */
function resolve(palette: Palette): Palette {
  const resolved: Palette = {}

  for (const [name, value] of Object.entries(palette)) {
    const reference = /^var\(--([\w-]+)\)$/.exec(value)
    const candidate = reference ? palette[reference[1]!] : value

    // Colours only: the same file carries spacing, radii and font stacks, and a
    // ratio against `1.5rem` is not a meaningful failure.
    if (candidate && HEX.test(candidate)) resolved[name] = candidate.toLowerCase()
  }

  return resolved
}

/**
 * The two palettes tokens.css declares. Dark is the light palette with the
 * dark-scheme block applied over it, which is what a browser computes — a token
 * the dark block does not override keeps its light value, and that is exactly
 * the kind of omission worth catching.
 */
export function parsePalettes(css: string): { light: Palette; dark: Palette } {
  const light = declarationsIn(LIGHT_BLOCK.exec(css)?.[1] ?? '')
  const dark = declarationsIn(DARK_BLOCK.exec(css)?.[1] ?? '')

  return { light: resolve(light), dark: resolve({ ...light, ...dark }) }
}
