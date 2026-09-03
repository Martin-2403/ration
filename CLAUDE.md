# Ration — working notes for the assistant

`PROJECT.md` is the spec: **read it before writing code**, and treat §0's
non-negotiables as binding. It says what to build and why, and §19 says how we split
the work. This file holds what lives in the environment rather than in the spec —
commands, gates, and traps that have already cost an afternoon.

## Commands

Node 24, pinned in `.nvmrc`. A fresh non-interactive shell may not have it on `PATH`;
check `node -v` and run `nvm use` before npm if it disagrees.

| | |
| --- | --- |
| `npm run dev` | Vite dev server |
| `npm run test:unit -- --run` | Vitest once (bare `test:unit` watches) |
| `npm run lint` | ESLint |
| `npm run type-check` | `vue-tsc`, templates included |
| `npm run build-only` | Vite build without repeating the type-check |

## The four gates

CI (`.github/workflows/ci.yml`) runs lint, type-check, tests and build as separate
steps, so a failure names which one broke. Run all four locally before pushing —
particularly **type-check**: the dev server strips types without checking them, and
the test run erases type-only imports, so a broken one is invisible until CI.

Verify a green run against the head SHA you actually pushed, not the branch name.

## Traps

- **Numeric input**: never `<input type="number">`. Use `type="text"`,
  `inputmode="decimal"`, and `parseAmount` — the reasoning is in `parse-amount.ts`.
  A German decimal comma has to survive (§14).
- **Boolean attributes**: `:inert="x"` renders `inert="false"`, which is still inert.
  Bind `x || undefined`.
- **`Date.now()` in a template or a prop expression** is captured when the component
  renders, not when the button is clicked. Pass `undefined` and let the callee
  default, or read the clock inside the handler.
- **Zero is a value, not an absence.** A target of `0` is not "no target" and an
  intake of `0` is not "unknown" — guard on `> 0` and on `undefined` separately.
- **Tests touching Dexie** need `import 'fake-indexeddb/auto'` as the first import;
  jsdom has no IndexedDB. It also has no `HTMLDialogElement`.
- `vitest/valid-expect` rejects `expect(value, 'message')`. Use `it.each` when you
  want the case named in the failure.
- Component tests pass while the layout is broken. When a change is visible, open the
  preview and look — overflow, column drift and wrong copy have all got through green
  suites here.

## Conventions

- **One issue → one branch → one PR**, carrying one reviewable concern. A diff too
  big to read line by line is a scoping problem, not a review problem (§19).
- In chat, write **`PR#64`** and **`I#42`**; inside GitHub bodies use bare `#64` so it
  autolinks. `Closes #N` when the PR finishes the issue, a comment on it when it does
  not.
- Commit subjects and PR titles describe the durable change, from a developer's point
  of view: no WIP or review-time state, no AI attribution, and not addressed to the
  reviewer. The body explains why (§19).
- `PROJECT.md` may be edited in the PR that makes its text untrue — call the edit out
  in the body. It is a licence to keep the document honest, not to redesign it.
- Reference sections and issues (§9, #17) where they help a later reader.

## Never

- Invent a **[verify]** value from §18. They need an authoritative source, and they
  are the human's to fill in.
- Render an unknown nutrient as `0`, or divide by elapsed days instead of days
  logged. Both turn missing records into a claim about the diet (§3, §9).
- Rewrite a logged entry from upstream food data. Entries snapshot their values (§9).
