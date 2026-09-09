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
//
// The set is Annex XIII of Regulation (EU) No 1169/2011 — Part B for the seven
// that an EU nutrition declaration must carry, Part A point 1 for the vitamins
// and minerals that may be declared and have a nutrient reference value. Taking
// the regulation's own list rather than choosing one means the tracked set has
// an external definition, and the NRV figures (#16) drop onto exactly these
// keys. Source: OJ L 304, 22.11.2011, p. 61 (#56).
//
// Names follow the regulation's spelling, so `thiamin` and `folicAcid` rather
// than thiamine and folate.
//
// `decimals` is display precision only. Grams follow the tenth of a gram a label
// is printed to; micronutrients follow magnitude, 0 where the NRV is 100 or more
// and 1 below it, since a tenth of a milligram is noise against 800 mg of
// calcium and the whole story for 1,1 mg of thiamin.
export const NUTRIENTS = {
  // Part B — the mandatory declaration.
  energy: { unit: 'kcal', kind: 'macro', decimals: 0 },
  fat: { unit: 'g', kind: 'macro', decimals: 1 },
  saturates: { unit: 'g', kind: 'macro', decimals: 1 },
  carbohydrate: { unit: 'g', kind: 'macro', decimals: 1 },
  sugars: { unit: 'g', kind: 'macro', decimals: 1 },
  protein: { unit: 'g', kind: 'macro', decimals: 1 },
  salt: { unit: 'g', kind: 'macro', decimals: 1 },

  // Part A point 1 — vitamins.
  vitaminA: { unit: 'µg', kind: 'micro', decimals: 0 },
  vitaminD: { unit: 'µg', kind: 'micro', decimals: 1 },
  vitaminE: { unit: 'mg', kind: 'micro', decimals: 1 },
  vitaminK: { unit: 'µg', kind: 'micro', decimals: 1 },
  vitaminC: { unit: 'mg', kind: 'micro', decimals: 1 },
  thiamin: { unit: 'mg', kind: 'micro', decimals: 1 },
  riboflavin: { unit: 'mg', kind: 'micro', decimals: 1 },
  niacin: { unit: 'mg', kind: 'micro', decimals: 1 },
  vitaminB6: { unit: 'mg', kind: 'micro', decimals: 1 },
  folicAcid: { unit: 'µg', kind: 'micro', decimals: 0 },
  vitaminB12: { unit: 'µg', kind: 'micro', decimals: 1 },
  biotin: { unit: 'µg', kind: 'micro', decimals: 1 },
  pantothenicAcid: { unit: 'mg', kind: 'micro', decimals: 1 },

  // Part A point 1 — minerals.
  potassium: { unit: 'mg', kind: 'micro', decimals: 0 },
  chloride: { unit: 'mg', kind: 'micro', decimals: 0 },
  calcium: { unit: 'mg', kind: 'micro', decimals: 0 },
  phosphorus: { unit: 'mg', kind: 'micro', decimals: 0 },
  magnesium: { unit: 'mg', kind: 'micro', decimals: 0 },
  iron: { unit: 'mg', kind: 'micro', decimals: 1 },
  zinc: { unit: 'mg', kind: 'micro', decimals: 1 },
  copper: { unit: 'mg', kind: 'micro', decimals: 1 },
  manganese: { unit: 'mg', kind: 'micro', decimals: 1 },
  fluoride: { unit: 'mg', kind: 'micro', decimals: 1 },
  selenium: { unit: 'µg', kind: 'micro', decimals: 1 },
  chromium: { unit: 'µg', kind: 'micro', decimals: 1 },
  molybdenum: { unit: 'µg', kind: 'micro', decimals: 1 },
  iodine: { unit: 'µg', kind: 'micro', decimals: 0 },
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

/**
 * The seven an EU nutrition declaration must carry — Annex XIII Part B, in the
 * order it prints them (#56).
 *
 * This is what a surface should offer when a person is reading a label: the
 * manual-food form mirrors the panel in front of them, and it is the same set
 * §14 scopes the German OCR vocabulary to. Micronutrients reach a food through
 * the resolver or the generic table (§4) rather than by being typed.
 *
 * Not derived from `kind: 'macro'`, even though it currently coincides: the
 * grouping is "what the label declares", and a macro-shaped nutrient outside
 * the declaration would otherwise join this set silently.
 */
export const DECLARATION_NUTRIENTS = [
  'energy',
  'fat',
  'saturates',
  'carbohydrate',
  'sugars',
  'protein',
  'salt',
] as const satisfies readonly NutrientKey[]

export type DeclarationNutrientKey = (typeof DECLARATION_NUTRIENTS)[number]

/**
 * The nutrients a user may set their own daily target for (§20).
 *
 * Listed explicitly rather than derived from `kind: 'macro'`, because whether a
 * self-chosen number is safe is a per-nutrient judgement and not a category
 * one. Energy and the three macros are a diet question. A micronutrient is a
 * toxicity question — the tolerable upper intakes exist for a reason, and they
 * vary from generous (B12) to narrow (selenium). Deriving the set from `kind`
 * would also make a future macro-shaped entry with a real ceiling — salt — user
 * settable the moment it is added to the registry, silently.
 */
export const USER_GOAL_NUTRIENTS = [
  'energy',
  'protein',
  'carbohydrate',
  'fat',
] as const satisfies readonly NutrientKey[]

export type GoalNutrientKey = (typeof USER_GOAL_NUTRIENTS)[number]

export function isGoalNutrient(key: NutrientKey): key is GoalNutrientKey {
  return (USER_GOAL_NUTRIENTS as readonly NutrientKey[]).includes(key)
}

/** A daily target the user set themselves, overriding the reference table (§5). */
export interface UserGoal {
  nutrient: GoalNutrientKey
  target: number // per day, in the nutrient's canonical unit
  updatedAt: number // write time; §10's merge resolves last-write-wins on this
}

/** A goal before it is stored: the repository stamps updatedAt. */
export type NewUserGoal = Omit<UserGoal, 'updatedAt'>

/**
 * What intake is measured against, carrying where the number came from — the
 * same provenance discipline the intake side follows (§3). The evaluation view
 * can then say whether it is comparing against an authoritative NRV or against
 * the user's own figure.
 */
export interface ResolvedTarget {
  nutrient: NutrientKey
  target: number
  origin: 'user' | 'reference'
  /**
   * Tolerable upper intake, same unit. Always from the reference table, never
   * from a user goal: a ceiling is a safety figure, not a preference. Absent
   * means no limit is known — never infer one (§5).
   */
  upperLimit?: number
}
