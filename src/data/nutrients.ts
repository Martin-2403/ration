// The closed set of canonical units (§6). A union type rather than a class:
// this only ever needs to exist at compile time, and an empty class would
// constrain nothing, since its structural type `{}` accepts any non-null value
// — including any string.
export type CanonicalUnit = 'kcal' | 'g' | 'mg' | 'µg'

export type Source =
  | 'off-packaging' // Open Food Facts, from the label
  | 'off-manufacturer' // OFF, supplied by producer
  | 'off-estimated' // OFF, estimated from ingredient percentages
  | 'usda-generic' // generic-food fallback
  | 'label-ocr' // transcribed from a photographed panel
  | 'user' // user-entered/edited
  | 'schedule-assumed' // planned by a schedule, not yet confirmed (§8)
  | 'unknown' // no data — NOT zero

export interface NutrientValue {
  value: number // in the nutrient's canonical unit (§6), on the basis of
  // the map's owner: per 100g for a Food, per dose for a
  // Supplement (§8). The map itself does not carry a basis —
  // it is fixed by the entity that holds it.
  source: Source
  at?: number // when derived, for auditing
}

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

// Derived from the nutrient registry (§5), not a bare string — a typo in a
// nutrient key must not silently create a new nutrient.
export type NutrientMap = Partial<Record<NutrientKey, NutrientValue>>

export interface NutrientTotal {
  amount: number // sum of known contributions
  bySource: Partial<Record<Source, number>> // how much came from each source
  missing: number // contributors with no usable value
}

export type NutrientTotals = Partial<Record<NutrientKey, NutrientTotal>>

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
