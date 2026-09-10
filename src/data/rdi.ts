/**
 * Reference intakes (§5, §18, #16): what the evaluation compares against when
 * the user has set no goal of their own. Data only, keyed on nutrient id.
 *
 * **Source: Regulation (EU) No 1169/2011, Annex XIII, OJ L 304, 22.11.2011,
 * p. 61.** Retrieved 2026-09-08 from EUR-Lex (CELEX 32011R1169) and checked
 * against the UK-retained rendering of the same regulation, entry by entry.
 * Part A point 1 supplies the nutrient reference values for vitamins and
 * minerals; Part B supplies energy and the macronutrients. Every figure is a
 * daily amount in the nutrient's canonical unit (§6), which is the annex's own
 * unit in each case — energy excepted, where §6 makes kcal canonical and the
 * annex prints 8 400 kJ/2 000 kcal.
 *
 * Nothing here is computed. §5 is explicit that the app flags a number rather
 * than prescribing one: no TDEE, no activity adjustment, no suggested deficit.
 *
 * **Saturates, sugars and salt are deliberately absent.** The annex prints a
 * reference intake for each (20 g, 90 g, 6 g) but does not say which direction
 * it points, and both fields in this table carry one — a `target` of 6 g of
 * salt would make the evaluation report reaching it as an achievement. They get
 * an `upperLimit` once #17 sources one from EFSA, which is a figure that states
 * its own direction. Until then they have no comparison, which §9 already
 * renders as no target rather than as met. The four macros that remain are the
 * same four §20 allows a user to set a goal for, chosen on the same reasoning.
 *
 * **Upper limits: EFSA, "Overview on Tolerable Upper Intake Levels as derived by
 * the Scientific Committee on Food (SCF) and the EFSA Panel on Dietetic
 * Products, Nutrition and Allergies (NDA)", Version 11 (August 2025)**,
 * retrieved 2026-09-10 from
 * https://www.efsa.europa.eu/sites/default/files/2024-05/ul-summary-report.pdf
 * (#17). Adult column. Reproduction of EFSA material requires the source to be
 * acknowledged, which #78 covers.
 *
 * A limit is present only where EFSA's figure applies to total chronic intake
 * from all dietary sources, which is what the app's totals sum. Nine do. The
 * rest are absent, and §5's "never infer one" is why rather than an oversight:
 *
 * - **Magnesium (250 mg)** applies only to readily dissociable magnesium salts
 *   added to food, water or supplements, explicitly excluding the magnesium
 *   naturally present in food. It is also *below* the 375 mg reference intake,
 *   so comparing a food total against it would report anyone meeting their
 *   target as over the limit.
 * - **Folic acid (1000 µg)** applies to folic acid and related forms added to
 *   foods or used in supplements, not to folate naturally present in food.
 * - **Vitamin A (3000 µg RE)** applies to preformed vitamin A — retinol and
 *   retinyl esters — not to the total retinol equivalents food data reports.
 * - **Niacin** has two limits by form: 900 mg for nicotinamide, 10 mg for
 *   nicotinic acid. §6 already refuses a form-dependent conversion rather than
 *   guessing, and the same reasoning applies to a form-dependent ceiling.
 * - **Iron (40 mg), manganese (8 mg) and fluoride (3.3 mg)** have no UL at all.
 *   EFSA publishes a *safe level of intake* for each and states that intakes
 *   above it do not necessarily indicate a risk and cannot be used to
 *   characterise who is at risk. That is not a limit.
 *
 * EFSA sets **no UL for total fat, saturated fatty acids, sugars, protein or
 * sodium** (Tables 1 and 4), so the three nutrients #16 left without a target
 * do not gain one here either. They carry intake and no comparison.
 *
 * The vitamin E figure carries a footnote that its review is on-going.
 */
import type { NutrientKey, ReferenceTarget } from './nutrients'

/**
 * Which framework and which population a table of figures describes.
 *
 * One value today. It exists so that the German D-A-CH values, which are
 * age- and sex-specific, can be added as further profiles without reshaping
 * the table or its consumers (§5, #16).
 */
export type ReferenceProfile = 'eu-nrv-adult'

/** The profile the app compares against: one framework, one adult profile (§5). */
export const ACTIVE_PROFILE: ReferenceProfile = 'eu-nrv-adult'

export const REFERENCE_PROFILES: Record<
  ReferenceProfile,
  Partial<Record<NutrientKey, ReferenceTarget>>
> = {
  'eu-nrv-adult': {
    // Part B — energy and macronutrients.
    energy: { nutrient: 'energy', target: 2000 }, // Energy (kcal)
    fat: { nutrient: 'fat', target: 70 }, // Total fat (g)
    carbohydrate: { nutrient: 'carbohydrate', target: 260 }, // Carbohydrate (g)
    protein: { nutrient: 'protein', target: 50 }, // Protein (g)

    // Part A point 1 — vitamins, in the annex's order.
    vitaminA: { nutrient: 'vitaminA', target: 800 }, // Vitamin A (μg)
    vitaminD: { nutrient: 'vitaminD', target: 5, upperLimit: 100 }, // Vitamin D (μg)
    vitaminE: { nutrient: 'vitaminE', target: 12, upperLimit: 300 }, // Vitamin E (mg)
    vitaminK: { nutrient: 'vitaminK', target: 75 }, // Vitamin K (μg)
    vitaminC: { nutrient: 'vitaminC', target: 80 }, // Vitamin C (mg)
    thiamin: { nutrient: 'thiamin', target: 1.1 }, // Thiamin (mg)
    riboflavin: { nutrient: 'riboflavin', target: 1.4 }, // Riboflavin (mg)
    niacin: { nutrient: 'niacin', target: 16 }, // Niacin (mg)
    vitaminB6: { nutrient: 'vitaminB6', target: 1.4, upperLimit: 12 }, // Vitamin B6 (mg)
    folicAcid: { nutrient: 'folicAcid', target: 200 }, // Folic acid (μg)
    vitaminB12: { nutrient: 'vitaminB12', target: 2.5 }, // Vitamin B12 (μg)
    biotin: { nutrient: 'biotin', target: 50 }, // Biotin (μg)
    pantothenicAcid: { nutrient: 'pantothenicAcid', target: 6 }, // Pantothenic acid (mg)

    // Part A point 1 — minerals, in the annex's order.
    potassium: { nutrient: 'potassium', target: 2000 }, // Potassium (mg)
    chloride: { nutrient: 'chloride', target: 800 }, // Chloride (mg)
    calcium: { nutrient: 'calcium', target: 800, upperLimit: 2500 }, // Calcium (mg)
    phosphorus: { nutrient: 'phosphorus', target: 700 }, // Phosphorus (mg)
    magnesium: { nutrient: 'magnesium', target: 375 }, // Magnesium (mg)
    iron: { nutrient: 'iron', target: 14 }, // Iron (mg)
    zinc: { nutrient: 'zinc', target: 10, upperLimit: 25 }, // Zinc (mg)
    copper: { nutrient: 'copper', target: 1, upperLimit: 5 }, // Copper (mg)
    manganese: { nutrient: 'manganese', target: 2 }, // Manganese (mg)
    fluoride: { nutrient: 'fluoride', target: 3.5 }, // Fluoride (mg)
    selenium: { nutrient: 'selenium', target: 55, upperLimit: 255 }, // Selenium (μg)
    chromium: { nutrient: 'chromium', target: 40 }, // Chromium (μg)
    // EFSA states the molybdenum UL as 0.6 mg/d; converted to the canonical µg.
    molybdenum: { nutrient: 'molybdenum', target: 50, upperLimit: 600 }, // Molybdenum (μg)
    iodine: { nutrient: 'iodine', target: 150, upperLimit: 600 }, // Iodine (μg)
  },
}

/**
 * The active profile's figures. Kept as the module's primary export so callers
 * ask for "the reference table" rather than selecting a profile themselves.
 */
export const REFERENCE_TARGETS = REFERENCE_PROFILES[ACTIVE_PROFILE]
