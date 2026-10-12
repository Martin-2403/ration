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
- **Every PR gets a review pass before handover.** Open it, run `/code-review`
  against its number, then act on what comes back — fix it in the same branch, or
  say in chat why it stands. Only then hand it over. Findings are reported in
  chat, not added to the PR body, and the merge is never the assistant's to make.
- **Each issue is implemented by its own agent, in its own git worktree.** The main
  session orchestrates: it writes the brief (the issue, the PROJECT.md sections and
  CLAUDE.md traps that apply, the files in scope, what "verified" means for this
  change), spawns the implementer, and keeps only the result in its own context.
- **Review findings go through the orchestrator, never agent to agent.** The
  reviewer reports to the main session, which verifies each finding — probe,
  revert-check, measurement — before sending the confirmed ones back to the same
  implementer. Reviewers are wrong often enough that acting on an unchecked
  finding has already reintroduced a fixed bug once (#116's `watch` suggestion).
- **Independent issues may run in parallel**, if they touch disjoint files —
  `LogView.vue` is the usual collision — and each worktree runs its dev server on
  its own port; the preview on 4300 cannot be shared. Expect 1Password signing
  prompts to arrive together.
- In chat, write **`PR#64`** and **`I#42`**; inside GitHub bodies use bare `#64` so it
  autolinks. `Closes #N` when the PR finishes the issue, a comment on it when it does
  not.
- Commit subjects and PR titles describe the durable change, from a developer's point
  of view: no WIP or review-time state, no AI attribution, and not addressed to the
  reviewer. No passages like: "🤖 Generated with [Claude Code](https://claude.com/claude-code)",
  as the whole project will be disclaimed as AI assisted coding
- **The commit body carries the why** (§19). **The PR body stays short** — what the
  change does and what was measured, in the third person. It does not flag what
  deserves attention, narrate who did what, offer the reviewer options, or recap the
  conversation that produced it. For a docs-only change, one line is right.
  Alternatives and recommendations go in chat; the record gets the decision taken.
- `PROJECT.md` may be edited in the PR that makes its text untrue — call the edit out
  in the body. It is a licence to keep the document honest, not to redesign it.
- Reference sections and issues (§9, #17) where they help a later reader.

## Never

- Invent a **[verify]** value from §18, or recall one from memory. Sourcing them is
  delegated as of 2026-09-03: fetch the primary document, transcribe from it, and
  record the source and retrieval date beside the value in code. Where a source does
  not cover something, leave it absent rather than reaching for a second-best table.
  Licence and terms questions get *reported*, not decided.
- Render an unknown nutrient as `0`, or divide by elapsed days instead of days
  logged. Both turn missing records into a claim about the diet (§3, §9).
- Rewrite a logged entry from upstream food data. Entries snapshot their values (§9).
