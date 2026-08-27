// The closed set of canonical units (§6). A union type rather than a class:
// this only ever needs to exist at compile time, and an empty class would
// constrain nothing, since its structural type `{}` accepts any non-null value
// — including any string.
export type CanonicalUnit = 'kcal' | 'g' | 'mg' | 'µg'

export interface NutrientDef {
  unit: CanonicalUnit // the one canonical unit for this nutrient (§6)
  kind: 'macro' | 'micro'
  decimals: number // display precision
}

// Ids are stable and language-neutral. Display labels are NOT here — they come
// from i18n keyed on the id (§14).
export const NUTRIENTS = {
  energy: { unit: 'kcal', kind: 'macro', decimals: 0 },
  protein: { unit: 'g', kind: 'macro', decimals: 1 },
  vitaminD: { unit: 'µg', kind: 'micro', decimals: 1 },
  // ... one entry per nutrient the app can ever track
} as const satisfies Record<string, NutrientDef>

// Derived from the registry so that a typo cannot silently invent a nutrient
// (§3). Declared after NUTRIENTS because it reads its keys.
export type NutrientKey = keyof typeof NUTRIENTS

// Belongs with the reference table in data/rdi.ts (§16), but that file has no
// data until the [verify] figures land (#16, #17), so the shape lives here for
// now rather than in an otherwise empty module.
export interface ReferenceTarget {
  nutrient: NutrientKey
  target: number // per day, in the nutrient's canonical unit
  // Tolerable upper intake, same unit. Absent means no limit is known for this
  // nutrient — never infer one (§5).
  upperLimit?: number
}
