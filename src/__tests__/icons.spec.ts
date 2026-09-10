/**
 * The icon set as a contract (§10, #69).
 *
 * These are build outputs, not source, so nothing else notices when one rots:
 * rsvg-convert exits 0 on a malformed SVG, a renamed file still looks like an
 * icon in a directory listing, and a transparent apple-touch-icon renders with
 * black corners only on a device nobody is testing on. All three of those have
 * actually happened here.
 *
 * Read from the project root: under Vitest `import.meta.url` is an http URL
 * from Vite's module graph, so there is no file path to resolve against.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const asset = (name: string) => readFileSync(resolve(process.cwd(), 'public', name))

const PNG_MAGIC = '89504e470d0a1a0a'

/** Width, height and colour type out of a PNG's IHDR. */
const readPng = (name: string) => {
  const data = asset(name)

  return {
    magic: data.subarray(0, 8).toString('hex'),
    width: data.readUInt32BE(16),
    height: data.readUInt32BE(20),
    /** 6 is RGBA, 2 is RGB. No alpha channel is the strongest form of opaque. */
    colorType: data[25]!,
  }
}

describe('icon set', () => {
  it.each([
    ['icon-512.png', 512],
    ['icon-192.png', 192],
    ['icon-maskable-512.png', 512],
    ['icon-maskable-192.png', 192],
    ['apple-touch-icon.png', 180],
  ])('%s is a real PNG at %dx%d', (name, size) => {
    const png = readPng(name)

    // Not just "the file exists": a failed render or a copied SVG would leave
    // something at this path that is not an image.
    expect(png.magic).toBe(PNG_MAGIC)
    expect([png.width, png.height]).toEqual([size, size])
  })

  it.each(['apple-touch-icon.png', 'icon-maskable-512.png', 'icon-maskable-192.png'])(
    '%s is opaque to the edge',
    (name) => {
      // iOS composites a transparent apple-touch-icon as black, so the rounded
      // field's corners would show as black behind iOS's own rounding — which
      // is exactly what shipped before #69. A maskable icon has the same
      // requirement: the launcher crops it, so the field must reach every edge.
      expect(readPng(name).colorType).toBe(2)
    },
  )

  it.each(['icon-512.png', 'icon-192.png'])('%s keeps its transparent corners', (name) => {
    // The counterpart: the "any" icon is a rounded field on nothing, so the
    // platform's own shape shows through. Rendering it full-bleed would put a
    // petrol square behind every rounded presentation of it.
    expect(readPng(name).colorType).toBe(6)
  })

  it('ships favicon.ico as a real multi-image ICO', () => {
    const ico = asset('favicon.ico')

    expect(ico.readUInt16LE(0)).toBe(0) // reserved
    expect(ico.readUInt16LE(2)).toBe(1) // type 1 = icon
    const count = ico.readUInt16LE(4)
    expect(count).toBe(3)

    const sizes = []
    for (let i = 0; i < count; i += 1) {
      const entry = 6 + i * 16
      const declared = ico[entry]!
      const offset = ico.readUInt32LE(entry + 12)
      const embedded = ico.subarray(offset, offset + ico.readUInt32LE(entry + 8))

      // The directory entry and the image it points at have to agree; a
      // mismatch is what makes an ICO render at the wrong size or not at all.
      expect(embedded.subarray(0, 8).toString('hex')).toBe(PNG_MAGIC)
      expect(embedded.readUInt32BE(16)).toBe(declared)
      sizes.push(declared)
    }

    // 16 for a tab, 32 for a bookmark bar, 48 for a Windows shortcut.
    expect(sizes).toEqual([16, 32, 48])
  })

  it('keeps the maskable mark inside the safe circle', () => {
    // A launcher crops a maskable icon to its own shape, and art outside the
    // safe circle — 80% of the canvas, so radius 204.8 on a 512 square — gets
    // clipped. Nothing reveals that until it is on a device.
    const svg = asset('icon-maskable.svg').toString()
    const rects = [...svg.matchAll(/<rect([^>]*)\/>/g)].map((match) => {
      const attr = (name: string) =>
        Number(new RegExp(`${name}="([\\d.]+)"`).exec(match[1]!)?.[1] ?? '0')

      return { x: attr('x'), y: attr('y'), width: attr('width'), height: attr('height') }
    })

    // The full-bleed background is not part of the mark.
    const mark = rects.filter((rect) => rect.width < 512 || rect.height < 512)
    expect(mark.length).toBeGreaterThan(0)

    for (const rect of mark) {
      for (const x of [rect.x, rect.x + rect.width]) {
        for (const y of [rect.y, rect.y + rect.height]) {
          const radius = Math.hypot(x - 256, y - 256)

          expect(radius, `corner (${x}, ${y}) is outside the safe circle`).toBeLessThanOrEqual(204.8)
        }
      }
    }
  })
})
