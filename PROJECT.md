# Nutrient Tracker — Project Reference

A calorie/nutrient tracking PWA. Local-first, cross-device via the browser, with
meal templates, barcode lookup, supplements, and long-term nutrient evaluation.

This document records the architecture decisions made so far and the rationale
behind them. Items marked **[verify]** depend on an authoritative external source
and must not be filled in from memory. Items marked **[deferred]** are out of MVP
scope by decision.

---

## 0. Starting from here (read first)

This file is the single source of truth for the project. It was written to be a
self-contained spec — everything needed to build the MVP is below, with rationale.
If you're an AI coding assistant picking this up, read the whole file first, then
follow the build order.

**First session — scaffolding:**

1. Scaffold with `npm create vue@latest` — Vue's own scaffolder — selecting
   TypeScript, Router, Pinia, Vitest, ESLint and Prettier. It wires those up
   correctly, including the Vitest config, which is tedious to assemble by hand.
   Then install `dexie`, `@lucide/vue`, `vite-plugin-pwa`, and the IBM Plex fonts
   (see §15). Note: create-vue also ships `oxlint` with a mismatched peer range
   that blocks further installs — remove `oxlint` and `eslint-plugin-oxlint`.
2. Create `src/theme/tokens.css` from the design tokens in §15 (palette, type,
   motion) — **both the light and dark blocks**, not light alone. Load IBM Plex Sans
   + IBM Plex Mono. Components reference CSS variables, never literal hex.
3. Define the nutrient registry (`src/data/nutrients.ts`, §5) before any feature
   code. Every later layer keys on it: canonical units, labels, targets, limits.
4. Lay out the folder structure in §16.

**Build order** (each step is shippable before the next — see §16 for detail):

1. **Core loop** — meal templates → slots → daily totals, wired to Dexie (§7, §3
   for the nutrient/provenance model). Built from scratch; there is no prior
   prototype to port. The math is small: per-100g scaling by `grams / 100`, slot
   resolution to a chosen Food id, sum across items (§7). Includes **manual food
   entry** — without it the app can't log an apple (§7).
2. **Nutrient config + RDI evaluation view** (§5, §9). Build this second — it
   exercises the provenance model and the data-quality indicator end to end.
   Two-sided: shortfalls *and* upper limits (§5, §9).
3. **Barcode resolver + offline cache** (§4, §12, §13). Start with `units.ts`
   normalization (§6), then the tier walk.
4. **Supplements + schedules** (§8).
5. **Backup / restore** (§10).
6. **[deferred]** Lab feedback (§11) — only after the privacy review noted there.

**Non-negotiables to keep in mind while building:**

- Provenance lives per *nutrient value*, not per food (§3). This threads through
  everything — the resolver, the evaluation, the UI treatments.
- `unknown` nutrients render "no data," never a silent zero (§3, §9).
- Log entries snapshot their values at log time. **Upstream** data never rewrites
  history; the user may still correct their own entries (§9).
- Missing *records* are not zero intake either — evaluation divides by days actually
  logged, and says so (§9). Same honesty principle as `unknown`.
- Never invent the **[verify]** values in §18 — source them authoritatively.
- No LLM enrichment (decided, §3). OCR is kept — it's transcription, not estimation.
- Request storage persistence early (§10). Local-only with no accounts means browser
  eviction is unrecoverable data loss.

**Suggested opening prompt for a coding assistant:**

> Read PROJECT.md — it's the full spec for this project. Confirm you've read it,
> then do all four "First session — scaffolding" steps from §0: scaffold Vite + Vue 3
> + TS, install the dependencies, create theme/tokens.css from §15 with both the
> light and dark blocks, and define the nutrient registry from §5. Don't start
> feature code yet — stop after scaffolding so I can review.

---

## 1. Goal & scope

Track daily/long-term intake of calories and nutrients (macros + a configurable
set of micronutrients), reconcile it against reference intakes, and — later —
against real lab results. Runs on most devices from one codebase.

**In MVP**

1. Core loop: meal templates → resolve slots → daily totals, plus manual food entry.
2. Barcode lookup with offline cache, and quick-log straight from a scan.
3. Supplements (manual + OCR), with intake schedules.
4. Long-term evaluation over rolling windows, showing shortfalls **and** upper-limit
   overruns, with data-quality and coverage context.
5. Local-only storage with user-controlled encrypted backup/restore.

**Deferred**

- **[deferred]** Lab-result feedback loop (feature 4). Highest risk/complexity;
  needs a data/privacy owner in the design, not just the ship. Build the core
  first, then scope this separately. Design intent is recorded in §11 so the data
  model doesn't paint us into a corner.
- Accounts and server-side sync — replaced by the backup model in §10.

---

## 2. Platform & stack (settled)

- **PWA, not native.** One codebase across iOS/Android/desktop, installable,
  offline-capable. Revisit native only if a hard dependency appears (e.g. native
  health-platform integration).
- **Vue 3 + Vite + TypeScript.** SFCs with `<script setup>`. Chosen for the
  Angular-adjacent mental model and mature ecosystem.
- **Pinia** for state, **Dexie** (IndexedDB) for persistence.
- **vue-router** for navigation. Real URLs per view, deep-linkable days, and back-
  button behaviour that matches an installed PWA — a tab flag in `App.vue` gives
  none of those and is painful to unpick later.
- **Vite PWA plugin / Workbox** for the service worker. Registered minimally from
  the start — manifest plus an auto-updating worker — so the app is installable
  early, since §10 treats installation as a durability feature. The two-cache
  strategy in §13 waits for layer 3, where the routes it caches actually exist.
- **Vitest** + **@vue/test-utils** for tests (§17).
- Storage sits behind a **repository interface** so the persistence layer can
  change (e.g. add sync) without touching UI.

---

## 3. Core principle: provenance per nutrient

Provenance lives on each **nutrient value**, not on the food as a whole. A single
food can have kcal/protein from packaging and Vitamin K from an ingredient-based
estimate — each value carries its own source. This one decision drives the
resolver, the data-quality indicator, and the trust hierarchy below.

```ts
type Source =
  | 'off-packaging'      // Open Food Facts, from the label
  | 'off-manufacturer'   // OFF, supplied by producer
  | 'off-estimated'      // OFF, estimated from ingredient percentages
  | 'usda-generic'       // generic-food fallback
  | 'label-ocr'          // transcribed from a photographed panel
  | 'user'               // user-entered/edited
  | 'schedule-assumed'   // planned by a schedule, not yet confirmed (§8)
  | 'unknown';           // no data — NOT zero

interface NutrientValue {
  value: number;         // in the nutrient's canonical unit (§6), on the basis of
                         // the map's owner: per 100g for a Food, per dose for a
                         // Supplement (§8). The map itself does not carry a basis —
                         // it is fixed by the entity that holds it.
  source: Source;
  at?: number;           // when derived, for auditing
}

// Derived from the nutrient registry (§5), not a bare string — a typo in a
// nutrient key must not silently create a new nutrient.
type NutrientKey = keyof typeof NUTRIENTS;
type NutrientMap = Partial<Record<NutrientKey, NutrientValue>>;
```

### Trust hierarchy

Everything downstream reads this order, weakest to strongest:

```
assumed (schedule-assumed)  <  estimated (off-estimated)  <  measured (packaging /
usda / ocr / user)  <  lab markers
```

The RDI evaluation and (later) the lab view are two read-models over the same
accumulated data at different trust levels.

**No LLM enrichment.** Dropped by decision: OFF already provides ingredient-based
estimates *with per-source provenance*, so a language-model guess from a product
name added cost and risk for no gain. OCR is kept — it's transcription of real
printed values, not estimation, and is categorically stronger.

---

## 4. Food-data resolver

Given a barcode, walk tiers and return a `NutrientMap` with a source on each value.
Only fill nutrients that are in the user's tracked set (§5) — don't resolve the
full micronutrient panel for every food.

```
1. Local IndexedDB cache (works offline)
2. Open Food Facts aggregated nutrients  (online)
      - already includes off-estimated values, tagged by source
3. Generic-food fallback for still-missing tracked micros  (online)
      - map branded item -> nearest generic food, pull micros
4. Mark remaining tracked nutrients as source: 'unknown'
   -> write the resolved food back to the cache
```

- **Label OCR** is a *user-triggered* path to fill a specific gap, not an automatic
  tier.
- Offline, the walk stops after step 1; missing tracked nutrients are marked
  `unknown`. No async queue needed now that LLM enrichment is gone — the walk
  resolves synchronously once online.

---

## 5. Nutrient config & reference intakes

A first-class entity. Drives (a) which columns the UI shows, (b) which gaps the
resolver bothers to fill, (c) which nutrients the evaluation reports on.

### The registry (build this first)

`data/nutrients.ts` is the keystone. §6's "one canonical unit per nutrient", §9's
display, §14's "key on ids, never on labels" and the resolver's tracked-set check
all read from here. Define it before any feature code.

```ts
interface NutrientDef {
  unit: CanonicalUnit;      // the one canonical unit for this nutrient (§6)
  kind: 'macro' | 'micro';
  decimals: number;         // display precision
}

// Ids are stable and language-neutral. Display labels are NOT here — they come
// from i18n keyed on the id (§14).
const NUTRIENTS = {
  energy:   { unit: 'kcal', kind: 'macro', decimals: 0 },
  protein:  { unit: 'g',    kind: 'macro', decimals: 1 },
  vitaminD: { unit: 'µg',   kind: 'micro', decimals: 1 },
  // ... one entry per nutrient the app can ever track
} as const satisfies Record<string, NutrientDef>;

interface ReferenceTarget {
  nutrient: NutrientKey;
  target: number;           // per day, in the nutrient's canonical unit
  upperLimit?: number;      // tolerable upper intake, same unit.
                            // Absent = no limit known. Never infer one.
}
```

- Config = a list of tracked nutrients, each with a `ReferenceTarget`.
- Targets are **data-driven**, loaded from a reference table — never hardcoded.
- MVP: one reference framework, one adult profile. Structure allows age/sex/
  pregnancy profiles later.

### Upper limits (in MVP, decided)

Evaluation is **two-sided**: shortfalls *and* over-target. The app deliberately
models supplement stacking on top of fortified foods, so a tracker that only ever
says "more" has a real blind spot — the fat-soluble vitamins are where intake can
plausibly run high. Reporting only shortfalls would be the same silent-zero mistake
in a different direction.

- The app **flags the number, it does not prescribe.** Same discipline as §11: no
  dosing advice, no causal claim, point at a healthcare provider for anything that
  looks off. This holds app-wide, not just in the lab view.
- **[verify]** Upper-limit figures need an authoritative source (EFSA tolerable
  upper intake levels for the EU framework) — same rule as the targets themselves.

**Reference for EU/Germany:**
- MVP: EU **NRVs** (Regulation 1169/2011, Annex XIII) — a single population value,
  simplest to start.
- Later: German **D-A-CH** values (DGE), which are age/sex-specific.
- **[verify]** Actual NRV/DACH figures must come from the authoritative source
  (EU regulation text / DGE). Do not invent.

---

## 6. Units & canonical representation

Normalize at the resolver boundary (on ingest). One canonical unit per nutrient,
stored **per 100g by mass**, plus a serving weight for per-serving conversion.

- Energy: canonical **kcal** internally (kJ → kcal is ÷ 4.184).
- Salt/sodium: OFF stores salt in some regions; salt = 2.5 × sodium.
- Vitamin D: 1 µg = 40 IU (stable).
- **Vitamins A and E: form-dependent** (retinol vs beta-carotene; natural RRR- vs
  synthetic all-rac α-tocopherol). No single safe IU factor — special-case with a
  documented conversion. **[verify]** against an authoritative source.
- Every raw value carries its incoming `unit`; a normalization function converts
  to canonical on the way in. Never store mixed units.

---

## 7. Meal templates with variations

A meal is a **template of slots**. A slot is fixed (one option) or variable (a
dropdown of options). Grams are prefilled but editable. This generalizes the
"porridge with swappable fruit" case.

```ts
interface Food {
  id: string;
  name: string;               // display only; localized lookup, not data
  per100g: NutrientMap;       // provenance per nutrient (§3)
  barcode?: string;
  servingWeight?: number;     // grams, for per-serving sources
}

interface MealSlot {
  id: string;                 // stable slot id — LogEntry.items reference this,
                              // never the label (labels are display strings)
  label: string;              // "Fruit"
  kind: 'fixed' | 'variable';
  options: string[];          // Food ids — length 1 = fixed, >1 = dropdown
  defaultOptionId: string;
  defaultGrams: number;       // prefilled, editable at log time
}

interface MealTemplate { id: string; name: string; slots: MealSlot[]; }

// An item is either a food by mass or a supplement by dose. One union keeps §8's
// single summing path literally true — nutrientsFor() resolves quantity at the leaf,
// and a day's totals stay one query and one snapshot.
type LogItem =
  | { kind: 'food'; slotId?: string; foodId: string; grams: number }
  | { kind: 'supplement'; supplementId: string; doses: number; confirmed: boolean };

interface LogEntry {
  id?: number;
  templateId?: string;        // absent for a quick-log (below)
  name: string;
  timestamp: number;          // when it was eaten — NOT when the row was written
  createdAt: number;
  updatedAt: number;          // write time; §10 merge resolves last-write-wins here
  items: LogItem[];
  totals: NutrientTotals;     // DENORMALIZED snapshot at log time (see §9)
}
```

### Totals are not a NutrientMap

A `NutrientMap` holds one `source` per value, which is right for a food: that value
came from one place. A *sum* has many origins, and §9 promises to report what
fraction of a total came from estimated values. One source tag cannot answer that,
and recomputing it later would mean re-reading the food cache — which §9 forbids,
because the cache changes and history must not.

So a summed total carries the breakdown with it:

```ts
interface NutrientTotal {
  amount: number;                            // sum of known contributions
  bySource: Partial<Record<Source, number>>; // how much came from each source
  missing: number;                           // contributors with no usable value
}

type NutrientTotals = Partial<Record<NutrientKey, NutrientTotal>>;
```

- `Σ bySource === amount`, always. That invariant is what makes §9's percentages
  plain arithmetic on stored data.
- **`'unknown'` never appears in `bySource`.** It is not an amount, it is an absence,
  so it is counted in `missing` instead. A nutrient every contributor lacks still
  gets an entry — `amount: 0, missing: n` — because "tracked but no data" and "not
  tracked at all" must not look the same (§3).
- `missing` counts *contributors*, not nutrients, so the UI can say "≥ 50 µg, 1 of 3
  items has no data" rather than implying the sum is complete.

### Scaling and summing

Values scale linearly from per-100g by `grams / 100` for a food, and by dose count
for a supplement (§8) — `nutrientsFor(entity, quantity)` resolves the quantity at the
leaf, so there is one summing path.

**No rounding on the way in.** The registry's `decimals` (§5) is a display concern;
rounding at store would compound across a week of entries and cannot be undone. A
nutrient displayed at 0 decimals would shed real intake at every meal.

The arithmetic lives in a plain module (`src/totals.ts`), not in the composable:
§17 makes it the most-tested code in the project, and it should be testable without
mounting anything. `composables/useMeal.ts` holds only the reactive draft state.

Slot ids are stable and never reused: a logged entry keeps its `slotId` even if the
template is later edited or the slot removed, which is what makes history readable
without the template (§9, immutable history).

**Quick-log.** Scanning a barcode and eating that one thing is the most common real
flow, and it must not require a template: a `LogEntry` with no `templateId` and a
single food item with no `slotId`. The resolver (§4) hands off straight into this.

**Manual food entry (MVP).** Fresh food, bulk goods and anything home-cooked have no
barcode, and OFF misses plenty of products that do. A hand-entered food is an
ordinary `Food` with its values tagged `source: 'user'` — no special case downstream,
it just sits lower than packaging in the trust hierarchy (§3).

**Editing and deleting.** The user may correct or delete their own entries; an edit
re-resolves and re-snapshots `totals` and bumps `updatedAt`. This does not weaken §9
— the immutability rule is specifically that *upstream* data (a later, better OFF
record) never silently rewrites what the user recorded. A user fixing "300g" to "30g"
is the opposite case: it makes the record truer.

---

## 8. Supplements

A supplement is a Food-like entity **per dose**, plus a schedule. Do not force it
into per-100g.

```ts
interface Supplement { id: string; name: string; perDose: NutrientMap; }
interface Schedule {
  id: string;                 // own key — one supplement can have several schedules
  supplementId: string;
  frequency: 'daily' | 'weekly' | 'weekdays';
  weekdays?: number[];        // when frequency = 'weekdays'
  amount: number;             // doses
  startDate: number;          // required — see "never reach backwards" below
  endDate?: number;           // fixed-length course; absent = open-ended
}
```

- **Unified summing:** `nutrientsFor(entity, quantity)` where quantity = grams for
  a food, doses for a supplement, resolved at the leaf. One summing path for
  evaluation.
- OCR creation reuses the label-reading approach (supplement facts panels are
  structured). Watch IU↔µg on the way in (§6).
- A schedule contributes **planned** intake with a confirm/skip. Unconfirmed doses
  carry `source: 'schedule-assumed'` (§3) — the weakest rung of the trust hierarchy
  — and `confirmed: false` on the log item (§7). Same provenance discipline as
  everything else.
- **Schedules never reach backwards.** Planned intake applies from `startDate`
  forward only. Adding a schedule today must not invent doses for last month: the
  user confirmed nothing on those days, and back-filling assumed data would quietly
  inflate the very long-term evaluation §9 is supposed to keep honest.

---

## 9. Long-term RDI evaluation

Aggregate log entries over a window (foods and supplement doses come through the
same `items` union, §7) and sum each tracked nutrient.

### Windows and boundaries

- A **day** is local midnight to local midnight.
- Windows are **rolling**: trailing 7 and 30 days, not calendar weeks and months.
  A Monday-start calendar week resets to near-empty every Monday and reports a
  frightening shortfall for two days out of seven.

### The denominator: days logged, not days elapsed

Compare against `target × daysLogged`, where `daysLogged` counts days in the window
that have at least one entry — and **show the coverage**: "5 of 7 days logged."

A day with no entries is a *missing record*, not a zero-intake day. Dividing by
elapsed days conflates the two and manufactures a shortfall out of nothing, which is
the silent-zero mistake (§3) wearing a different hat. Anyone who logs on weekdays
only would see permanent deficiency in everything.

Two independent quality axes, both surfaced, neither collapsed into the other:

- **Coverage** — how many days have records at all.
- **Provenance** — how good the values in those records are (below).

### Two-sided: shortfall and over-limit

- Compare to `target × daysLogged`, and where a `upperLimit` is known (§5), to
  `upperLimit × daysLogged`.
- Default sort is largest shortfall first — the "what am I missing" view. Nutrients
  **over** a known limit pin to the top regardless: an exceeded limit is more
  actionable than a small gap.
- Rendered without a new colour — the bar runs past a marked target line and carries
  an "over" label (§15).

### Honesty in the UI

- A period *average* meeting the target is a weaker claim than hitting it daily —
  fine as a shortfall proxy, don't phrase it as the stronger claim.
- Surface a **data-quality indicator** off the provenance: e.g. "Vitamin K: 55% of
  RDI — 40% of that from estimated values." That percentage comes from the stored
  `bySource` breakdown on each total (§7), never from re-reading the food cache. An
  `unknown` nutrient reads as "no data," never a silent zero, and a total with
  `missing > 0` must not be presented as complete.
- Unconfirmed scheduled doses (`schedule-assumed`, §8) are the weakest input in any
  total. Count them, but never let them read as measured.

### History: upstream never rewrites it

Log entries snapshot their resolved values at log time (the denormalized `totals`).
Do **not** retroactively rewrite history when OFF improves a food later — it would
silently alter the user's record and corrupt the intake side of any future lab
correlation. The food *cache* is updatable; snapshots are not. Offer an explicit
"refresh this entry" and nothing implicit.

This constrains *upstream* data, not the user: they may edit or delete their own
entries, which re-snapshots `totals` and bumps `updatedAt` (§7). Correcting a
mistyped weight makes the record truer; a background data update replacing what
someone recorded does not.

---

## 10. Storage & backup (local-only, user-controlled)

- **Local-only, single user, IndexedDB.** No accounts.
- **Backup = manual, user-controlled, encrypted export.** The user picks *what*
  (by data class: food cache, log history, supplements, config, lab results) and
  *where* (the app produces an encrypted blob and hands it off; it never holds a
  cloud credential). Desktop: File System Access API / download. Mobile: share
  sheet. "Own cloud" = user saves the blob into their own Drive/Dropbox.
- **Encryption is the default**, not optional, for any export with personal or lab
  data. **WebCrypto only: passphrase → PBKDF2 → AES-GCM.** Do not hand-roll crypto.
  Argon2 would resist offline brute force better, but it has no WebCrypto
  implementation and would mean auditing and maintaining a WASM dependency —
  PBKDF2 with a high, documented iteration count plus the passphrase-strength
  warning below is the accepted trade. Record the iteration count in the envelope
  so it can be raised later without breaking old backups.
- **No account = the passphrase is the only key.** Losing it loses the backup —
  warn explicitly at export time. This is the cost of full user control.
- Export = a **versioned JSON envelope** (schema version, timestamp, included
  classes, KDF parameters), then encrypted. Restore offers **merge vs replace**.
- **Merge resolves last-write-wins on `updatedAt`** — the record's write time, which
  every syncable row carries alongside `createdAt` (§7). Not `LogEntry.timestamp`:
  that is when the meal was *eaten*, so using it would let an old backup of
  yesterday's breakfast beat an edit made this morning.
- **Lab results are a separately-encryptable class**, so food logs can go to a
  cloud file while lab data stays in a local-only export.

### Durability: eviction is the real threat

No accounts and no server means the browser is the only copy, and browsers evict
IndexedDB under storage pressure — on some platforms also after a period of
inactivity, and more aggressively for a site the user hasn't installed. There is no
recovery path from that.

- Request `navigator.storage.persist()` at first write, and surface the outcome
  honestly — it can be refused.
- Show `navigator.storage.estimate()` usage in the backup panel.
- Treat installing the PWA as a durability feature, not just convenience, and
  prompt for a backup on a sensible cadence rather than leaving it entirely to
  the user to remember.
- **[verify]** current iOS/WebKit and Chrome eviction rules at build time —
  installed vs not, inactivity thresholds. These shift between releases and must
  not be filled in from memory (§18).

---

## 11. Lab feedback — design intent only **[deferred]**

Recorded so the data model doesn't preclude it. Not in MVP.

```ts
interface LabResult {
  date: number;
  markers: { name: string; value: number; unit: string;
             refLow?: number; refHigh?: number; source: Source }[];
}
```

- Value: a lab marker is ground truth in a way intake estimation never is, so the
  app can flag **discrepancies** ("logged vitamin D looked adequate, but serum
  25-OH-D is below range"). Discrepancy surfacing is the whole point.
- **Guardrails (requirements, not nice-to-haves):**
  - Intake does not map linearly to serum markers (sunlight, absorption,
    genetics). Surface discrepancies and trends only — **no causation, no dosing
    advice**, explicit "discuss with a healthcare provider."
  - Marker normalization is messy (names, units, ranges vary by lab). Require a
    confirmation/mapping step on import; ship a small curated dictionary for common
    markers, let the user map the rest.
  - Sensitive health data: store local + encrypted; on-device OCR preferred so lab
    images never leave the device; any cloud OCR needs explicit per-use consent.
- **[verify]** Design must be reviewed with the data/privacy owner before build.

---

## 12. Barcode scanning

- Native `BarcodeDetector` is **not supported on iOS/Safari** (all iOS browsers are
  WebKit) and fails silently there. Do not depend on it.
- Feature-detect it as a **fast path** on Android/Chrome; ship a **JS/WASM decoder**
  as the real cross-platform path (`@zxing/browser`, or ZBar-via-WASM if pure-JS is
  too slow on older iPhones), over `getUserMedia` with `facingMode: environment`.
- **[verify]** library maintenance status at implementation time.

---

## 13. Offline caching

Two separate caches:

- **Service-worker runtime cache** (app shell, live API responses): expires
  normally, stale-while-revalidate.
- **IndexedDB food store** (resolved barcodes): durable. Nutrient data doesn't
  change, so staleness isn't a correctness issue — bound only for storage. **LRU
  with pinning:** never evict a food the user has actually logged. Guarantees
  offline re-scans and offline history always resolve.

**Seed foods are not cache entries.** The starter foods and templates in
`data/foods.ts` stay in the module and are never copied into IndexedDB. Storing
them would make them evictable by the LRU above, and would freeze a wrong value
on every install that had already copied it — a later fix in the app bundle would
never reach those users. The cost is two lookup paths for a food id, seeds then
store, which is one small function.

---

## 14. Region & language

- **Region: EU / Germany** for MVP; other regions selectable later (a setting with
  one value for now). Cascades to RDI reference (§5), generic-food fallback table,
  OFF regional data, and food-name language.
- **[verify]** Generic-food fallback licensing: German **BLS** is licensed/paid;
  **CIQUAL** (FR) and **USDA** are free. Pick a free table or budget for BLS.

**Language — three independent axes; no real conflict:**

- **UI language (English):** pure app-side i18n, decoupled from data. Key
  everything on language-neutral nutrient *ids*; render labels via i18n.
- **OFF data:** request `lc=de,en` (German, fallback English); prefer products sold
  in Germany via `countries_tags`. Nutrient numbers (`_100g` / `_serving`) are
  language-neutral; only product name and ingredient text are localized. If ever
  writing back to OFF, use language-specific fields or risk corrupting products.
- **German OCR:** the only axis where German matters functionally, isolated to the
  label parser. Needs a German label-vocabulary dictionary (Brennwert/Energie,
  Fett, davon gesättigte Fettsäuren, Kohlenhydrate, davon Zucker, Eiweiß, Salz →
  canonical nutrient keys). Self-contained; add other languages as more
  dictionaries later.

Discipline that keeps this clean: **key on nutrient ids everywhere; treat every
human-readable string as a localized lookup, not data.**

---

## 15. Design language

Direction: **clean, professional, clinical.** Reference is the B-well healthcare
template — white cards on a near-neutral field, near-black text, hairline borders,
generous whitespace, pill primary buttons, small line-arrow affordances, a single
grotesk throughout, no decoration. We swap the reference's pale sky-blue for a
restrained **petrol / deep-teal** accent. No emojis, ever.

### Palette (CSS custom properties)

Light is the primary design. **Dark ships from day one** — same token names, a second
block behind `prefers-color-scheme`, so no component ever learns a theme exists.
Retrofitting dark later means re-checking every status and macro hue at once; doing
it now costs one extra column in the token file.

```css
:root {
  --bg:            #F4F7F7;  /* app background, near-neutral cool grey-green */
  --surface:       #FFFFFF;  /* cards */
  --ink:           #14181A;  /* near-black, slightly cool — not pure #000 */
  --ink-soft:      #5A6568;  /* secondary text */
  --line:          #E5EAEA;  /* hairline borders / dividers */

  --primary:       #146C6A;  /* petrol / deep teal — the one accent */
  --primary-strong:#0E5250;  /* hover / pressed — darker on light */
  --primary-tint:  #E4EFEE;  /* selected fills, subtle backgrounds */
  --accent-blue:   #2F6690;  /* secondary data hue, used sparingly */

  /* macros — kept within the clinical family */
  --macro-protein: #146C6A;  /* petrol */
  --macro-carbs:   #2F6690;  /* steel blue */
  --macro-fat:     #C88A2E;  /* amber */

  /* status — two tones only; SEVERITY IS SHOWN BY BAR LENGTH, not extra colors.
     (Dropped the earlier warn ochre: it collided with the fat macro, and encoding
     severity in color duplicated what the bar length already communicates.)
     Over-limit gets no third color either — see "Target and over-limit" below. */
  --status-ok:     #146C6A;  /* met / on-track */
  --status-under:  #B24A3F;  /* below target (desaturated brick) */
}

@media (prefers-color-scheme: dark) {
  :root {
    --bg:            #0E1214;  /* deep cool near-black, not pure #000 */
    --surface:       #171C1E;  /* raised card — lift by surface, not by shadow */
    --ink:           #E8EDED;
    --ink-soft:      #9AA5A8;
    --line:          #262D2F;  /* hairline still reads as a hairline */

    /* Petrol lightens on dark: #146C6A against --bg is far too low-contrast. */
    --primary:       #3E9D99;
    --primary-strong:#5CB8B4;  /* hover / pressed — LIGHTER on dark, not darker */
    --primary-tint:  #16302F;
    --accent-blue:   #6098C4;

    --macro-protein: #3E9D99;
    --macro-carbs:   #6098C4;
    --macro-fat:     #D9A44F;

    --status-ok:     #3E9D99;
    --status-under:  #D4736A;
  }
}
```

The dark accent and status tones sit around 5.8:1 against `--bg`, so they clear AA
for body text and comfortably for bars and icons. Re-check with a contrast tool when
the tokens land, and for any pair added later.

### Typography

- **IBM Plex Sans** — UI, body, and headings (differentiate by weight, not a second
  family). Sentence case throughout.
- **IBM Plex Mono** — hero and emphasis figures only (the day's kcal, a single big
  value). Gives the precise clinical-instrument feel where it counts.
- **Dense number columns** (RDI tables, nutrient lists) use **IBM Plex Sans with
  tabular-lining figures** (`font-feature-settings: "tnum" 1, "lnum" 1`). This keeps
  columns aligned without mono's width and weight, which get heavy and hard to scan
  in a 20-row table. Same family, lighter feel — mono earns attention by being rare.
- No serif.
- Scale: display 28–32 / 600 · section 18 / 500 · body 14–15 / 400 · caption 12 /
  500 with uppercase tracking for eyebrows and field labels.
- **Loaded self-hosted, not from a CDN**: `@fontsource-variable/ibm-plex-sans` (the
  variable build — one file covers 400/500/600) and `@fontsource/ibm-plex-mono` at
  400 and 500 only, since mono is used sparingly. Bundled by Vite and cached by the
  service worker, so text renders offline (§13) and no request per user leaves the
  device. Imported in `main.ts`; the `font-family` declarations live in
  `theme/tokens.css`.

### Iconography

- **Lucide** line icons (`@lucide/vue` — `lucide-vue-next` is deprecated upstream),
  1.5px stroke, 16–20px, consistent.
- Small chevrons / line-arrows for navigable rows, as in the reference. Never emoji.

### Motion

- Smooth but simple: **160–220ms**, `ease` / `ease-out`, on hover, selection, and
  state change. Subtle fade or 4–8px slide on mount.
- No spring/bounce, no orchestrated multi-step sequences.
- **Respect `prefers-reduced-motion`** — disable transitions/animations.

### Surfaces & layout

- White cards on `--bg`; prefer hairline `--line` borders over shadows. Shadows, if
  any, soft and low.
- Radius: 12px cards, 10px controls, pill (999px) primary buttons.
- Generous whitespace; thin dividers for lists; right-aligned line-arrow on
  navigable rows.
- **Provenance shows without relying on color** (§3, §9): estimated values get a
  dotted underline / "est." tag; missing values render "no data," never a silent
  zero. This is both the honesty principle and an accessibility requirement.

### Target and over-limit

Nutrient bars carry a **tick mark at 100% of target**. Below target the bar stops
short of the tick; over a known upper limit (§5, §9) it **runs past** the tick and
picks up a small "over" label. No third status colour.

This follows the palette's own logic — severity is length, not hue. A dedicated
over-limit colour would reintroduce precisely the collision with `--macro-fat` that
got the warn ochre removed, and would put a third tone into a deliberately two-tone
system. The tick makes both directions legible at a glance; the label keeps it
readable without relying on colour at all.

### Accessibility floor

- Text contrast AA. Visible keyboard focus ring (petrol, 2px, offset).
- Never encode meaning in color alone — pair with label, length, or icon.
- Reduced motion honored.

Tokens live in `theme/tokens.css` and are the single source of truth; components
reference variables, never literal hex.

---

## 16. Suggested project structure

```
src/
  theme/
    tokens.css          // design tokens, light + dark — single source (§15)
  data/
    nutrients.ts        // NUTRIENT REGISTRY — build first, everything keys on it (§5)
    foods.ts            // seed foods + meal templates
    rdi.ts              // targets + upper limits, data-driven (§5)
    ocr-terms.de.ts     // German label vocabulary -> nutrient keys
  types.ts              // domain types from §7 — no persistence imports
  db.ts                 // Dexie schema + repository implementations (§2)
  units.ts              // canonical normalization (§6)
  totals.ts             // scaling + summing, no Vue imports (§7)
  resolver.ts           // barcode -> NutrientMap tier walk (§4)
  router.ts             // one route per view (§2)
  composables/
    useMeal.ts          // reactive draft state only; math lives in totals.ts
  stores/
    log.ts              // Pinia + Dexie liveQuery
    config.ts           // tracked nutrients + targets
  backup/
    export.ts           // versioned envelope + WebCrypto (§10)
    import.ts           // decrypt + merge/replace
  views/
    TodayView.vue  EvaluationView.vue  SupplementsView.vue  SettingsView.vue
  components/
    DaySummary.vue  MealBuilder.vue  MealSlot.vue  TodayLog.vue
    NutrientReport.vue  NutrientBar.vue  FoodForm.vue
    SupplementForm.vue  BackupPanel.vue
  App.vue
```

**Tests live beside the code they cover**, in a `__tests__/` directory next to it —
`src/data/__tests__/nutrients.spec.ts`, `src/__tests__/units.spec.ts`, and so on.
Not a parallel root-level `tests/` tree: the source layout above already encodes
which module owns what, and a mirror tree throws that away and then drifts from it.
`eslint.config.ts` scopes the Vitest plugin to `src/**/__tests__/*` for the same
reason. Colocated test files never reach the bundle — nothing imports them.

**Build sequence** (each layer shippable before the next):

0. Scaffold: tokens (light + dark), nutrient registry, router, Vitest.
1. Core loop — meal templates → slots → daily totals + manual food entry, on Dexie.
2. Nutrient config + evaluation view, two-sided (exercises provenance, coverage,
   data-quality and over-limit end to end).
3. Barcode resolver + offline cache + quick-log.
4. Supplements + schedules.
5. Backup/restore + storage persistence.
6. **[deferred]** Lab feedback, after privacy sign-off.

---

## 17. Testing

**Vitest for units, @vue/test-utils for components** — both, from the scaffold.

The entire value of this app is arithmetic with provenance attached. A wrong
conversion factor, a slipped window boundary or a bad denominator produces numbers
that look completely plausible and are wrong, and nobody notices by eye. That is
precisely the failure mode tests catch and manual checking does not.

**Unit — the priority:**

- `units.ts` — every conversion in §6, in both directions: kJ→kcal, salt↔sodium,
  vitamin D µg↔IU, and the form-dependent vitamin A/E cases including the ones that
  should *refuse* to convert rather than guess.
- Totals (§7) — per-100g scaling, the food/supplement item union, summing.
- Evaluation (§9) — rolling window edges, local-midnight day boundaries, the
  `daysLogged` denominator, shortfall and over-limit on both sides of target.
- Resolver (§4) — tier order, per-value provenance tagging, untracked nutrients
  skipped, unresolved ones ending as `unknown` and never `0`.
- Backup (§10) — envelope round-trip, merge LWW on `updatedAt`, wrong-passphrase
  failure path.

**Component — narrower, but not optional:**

§9's honesty rules are partly a rendering concern, so assert the treatments
directly: `unknown` renders "no data" and never "0"; estimated values carry their
marker; over-limit bars run past the tick and show the label; coverage ("5 of 7
days logged") is actually displayed. These are the claims the app makes to the user
about data quality — a regression here is a correctness bug, not a cosmetic one.

Out of scope for MVP: e2e and visual-regression testing.

---

## 18. External dependencies to resolve (not to invent)

- **[verify]** EU NRV / D-A-CH reference intake figures — authoritative source.
- **[verify]** Tolerable upper intake levels (§5) — EFSA or equivalent.
- **[verify]** Vitamin A/E IU↔µg conversion factors — authoritative source.
- **[verify]** Generic-food fallback table + its license (BLS paid; CIQUAL/USDA
  free).
- **[verify]** OFF nutrition-data schema (recent refactor) — current field names.
- **[verify]** OFF terms of use — required User-Agent, rate limits, and ODbL
  attribution/share-alike obligations. A licensing question, not a technical one.
- **[verify]** Barcode library maintenance status at build time.
- **[verify]** Browser storage eviction rules, iOS/WebKit and Chrome, installed vs
  not (§10).
- **[verify]** Current recommended PBKDF2 iteration count (§10) — a moving target;
  take it from current OWASP guidance at build time.
- **[verify]** Lab-feedback (feature 4) privacy design — data/privacy owner review.

---

## 19. Coding with AI coding assistant

This is a collaboration, not a handoff. The goal is to keep the speed of assisted
coding without losing the mental model of the codebase.

### Division of work: split by who decides, not who types

The instinct to "keep the small tasks" is backwards — small tasks teach the least
per minute spent. The files that constrain everything else are the ones worth typing
by hand, and in this project they are short.

**Owned by the human** — the shapes that everything downstream reads:

- `data/nutrients.ts`, the registry (§5), and the domain types in `types.ts`
- anything touching provenance semantics (§3) or the `daysLogged` denominator and
  window math (§9) — the places where a wrong answer still looks plausible
- the **[verify]** items in §18, categorically. They need authoritative sources, and
  the assistant is specifically instructed not to fill them in from memory

**Owned by the assistant** — mechanical expansion of decisions already made:

- Dexie schema boilerplate, Pinia store plumbing, router wiring
- Vue component markup and token wiring (§15)
- the German OCR vocabulary (§14) — tedious data entry
- resolver tier plumbing (§4), WebCrypto envelope mechanics (§10)

### Tests are the interface

Where it fits: **the human writes the failing test, the assistant makes it pass.**
Stating what "correct" means is the part worth doing by hand; §17 already enumerates
the surface. This matters most for `units.ts` conversions, the evaluation
denominator, and anything where a plausible-looking wrong number would go unnoticed.

### Working rhythm

- **One issue → one branch → one PR.** The issues are scoped for this.
- **Keep the issue list honest.** A PR that finishes an issue says `Closes #N` in
  its body, so merging closes it without anyone remembering to. A PR that only
  moves an issue along leaves a comment saying what landed and what is left. An
  issue list nobody prunes stops being a plan and becomes a graveyard — and the
  first thing that rots is the difference between "not started" and "nearly done".
- Do not close an issue to look productive. If nothing is finishable, say so.
- **Never merge a diff that hasn't been read line by line.** A diff too big to hold
  in your head means the task was scoped too big — that is a scoping signal, not a
  reason to skim.
- For anything non-obvious, ask for the approach in a few lines *before* any code.
  Far cheaper to disagree about a sentence than about a 300-line diff.
- Speed comes from deciding and reviewing quickly, not from typing quickly. Code
  written by hand will not be fast, and that is fine — it is bought understanding.
- Watch for rubber-stamping when tired. The fix is to stop merging, not to read
  harder.

### When the assistant stops and asks

Stop and ask rather than decide, whenever:

- the answer is not already in this document
- a **[verify]** value would have to be guessed to continue
- the change would bend one of the non-negotiables in §0
- the diff is growing past what a single PR should carry
- the request has a plausible second reading that leads somewhere different

State what you would do and why in a couple of lines, then wait. Conversely: do
**not** ask about things this document already settles — read it first.

### Naming commits and pull requests

**Write the title for the history, not for the review.** A PR title and a commit
subject outlive the review that produced them: they end up in `git log` and in the
merge commit, read by someone with no memory of the discussion.

- Describe the **durable change**, never the review-time state. "Spec-as-test for
  the nutrient registry" — not "(red until implemented)", "WIP", "part 2 of 3",
  "first attempt". Those stop being true on merge and mislead from then on.
- Dependencies between PRs belong in the body ("depends on #24"), not the title.
- The body explains **why**, and may record constraints that still hold. It should
  not narrate the review — a body saying "red on purpose, the file does not exist
  yet" is already wrong once the follow-up commit lands.
- Reference sections and issues where they help a future reader (§9, #17), since
  those stay resolvable.

### Code style

- keep code simple and readable
- comment complicated code explaining whys not just what
- keep commit messages, pr messages clean, no AI reference, short explanatory message written from a dev POV

---

## 20. Candidate features (not scoped)

Raised but not designed or committed. Distinct from **[deferred]** in §1, which is
scoped work held back deliberately — nothing here has a layer or an owner yet.

### Weekly intake graphs

A visual read of the §9 evaluation: nutrient and energy intake over a rolling window
against target. No new data — §9 already computes windows, targets, upper limits,
`bySource` and coverage.

If built:

- **§15 governs, not a chart library's defaults.** Severity is bar length, two status
  tones, over-limit is a bar past the target tick with a label. Colours must resolve
  from CSS variables or dark mode breaks. Hand-rolled SVG is probably less work than
  making a library obey this.
- **Unlogged days must read as absent**, not as zero and not interpolated. A smooth
  line drawn over partial data is §9's coverage rule broken in pixels.

Follows layer 2, which produces the numbers it would draw.

### Manual intake goals

A user-set target overriding the reference table (§5). Small: `ReferenceTarget`
already exists, so this adds a user-provided value layered over it — with its origin
recorded, so the UI can say whether it is measuring against an authoritative NRV or
against the user's own number.

- The app never **computes** a recommended intake: no TDEE, no suggested deficit.
  §5's rule holds — flag the number, do not prescribe.
- Worth doing early: a user-set goal needs no external source, so the evaluation view
  becomes usable before the §18 reference figures land.

### Fitness app connectivity — exploration only

Reading activity data or a calorie goal from Garmin Connect, Strava or similar.
**Not designed. Explore before committing to anything.** Known obstacles, roughly in
order of how much they hurt:

- OAuth means holding a credential, which §10 rules out outright, and browser-origin
  calls to these APIs are usually CORS-blocked — implying a server proxy. That turns
  Ration into a client-server app and reverses §1's deferral of accounts and sync.
  This applies to reads as much as writes.
- A fitness app's calorie goal is an **expenditure or weight-management target, not a
  reference intake**. Showing it beside NRV values would conflate two different
  things, and it is only meaningful for energy — never for a micronutrient.
- Such a goal **varies per day**, while §9 computes `target × daysLogged`. Per-day
  targets are a model change, not a setting.
- **[verify]** Garmin Connect has no open public API comparable to Strava's; access
  runs through a developer programme with approval. Strava's is documented but covers
  activity, not intake goals, and its token exchange needs a client secret.
- **File import** — the user exports from the fitness app, Ration reads the file —
  gets most of the value with no credential, no proxy, and no loss of offline-first.
  Start here if this is ever picked up.

