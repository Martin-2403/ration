/**
 * Reference intakes (§5): the table the evaluation compares against when the
 * user has not set a goal of their own. Data only, keyed on nutrient id.
 *
 * Deliberately empty. The MVP framework is EU NRVs (Regulation 1169/2011,
 * Annex XIII) and those figures are still [verify] on #16 — inventing plausible
 * numbers here would be exactly the prescribing §5 forbids. An empty table is
 * honest: resolveTarget reports no target for these nutrients, the same way §3
 * treats an unknown value as unknown rather than zero.
 *
 * When #16 lands this file is the only one that changes.
 */
import type { NutrientKey, ReferenceTarget } from './nutrients'

export const REFERENCE_TARGETS: Partial<Record<NutrientKey, ReferenceTarget>> = {}
