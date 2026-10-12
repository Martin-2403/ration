# Ration — working notes for the assistant

`PROJECT.md` is the spec: **read it before writing code**, and treat §0's
non-negotiables as binding. It says what to build and why; `README.md` has the
commands. This file is the working agreement — who decides what, how work is split
and shipped — plus the traps that have already cost an afternoon.

## Environment and gates

- Node 24, pinned in `.nvmrc`. A fresh non-interactive shell may not have it on
  `PATH`; check `node -v` and run `nvm use` before npm if it disagrees.
- CI (`.github/workflows/ci.yml`) runs lint, type-check, tests and build as separate
  steps, so a failure names which one broke. Run all four locally before pushing —
  particularly **type-check**: the dev server strips types without checking them,
  and Vitest erases type-only imports, so a broken one is invisible until CI.
- Verify a green run against the head SHA you actually pushed, not the branch name.

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

## Division of work

Split by who decides, not who types: keep the speed of assisted coding without
Martin losing the mental model of the codebase. The files that constrain everything
else are short, and worth typing by hand.

- **Martin owns** the shapes everything downstream reads: the registry
  (`data/nutrients.ts`, §5) and the domain types in `types.ts`; provenance semantics
  (§3); the `daysLogged` denominator and window math (§9) — the places where a wrong
  answer still looks plausible; and the *decisions* in §18's **[verify]** items:
  which framework, how wide a first pass, whether a licence is acceptable.
- **The assistant owns** mechanical expansion of decisions already made: Dexie
  schema, Pinia stores, router wiring, component markup and token wiring (§15), the
  German OCR vocabulary (§14), resolver tier plumbing (§4), WebCrypto envelope
  mechanics (§10).
- **Tests are the interface.** Where it fits, Martin writes the failing test and the
  assistant makes it pass — above all for `units.ts` conversions, the evaluation
  denominator, and anything where a plausible wrong number would go unnoticed. §17
  enumerates the surface.

## When to stop and ask

Stop and ask rather than decide whenever:

- the answer is not already in `PROJECT.md` or this file
- a **[verify]** value would have to be guessed to continue
- the change would bend one of §0's non-negotiables
- the diff is growing past what a single PR should carry
- the request has a plausible second reading that leads somewhere different

For anything non-obvious, state the approach and why in a few lines *before* any
code, then wait — a sentence is cheaper to disagree with than a 300-line diff.
Conversely, do **not** ask about what the spec or this file already settles.

## Workflow

- **One issue → one branch → one PR**, carrying one reviewable concern. A diff too
  big to read line by line is a scoping problem, not a review problem.
- **Keep the issue list honest.** `Closes #N` when the PR finishes the issue; a
  comment saying what landed and what is left when it does not. Never close an issue
  to look productive — if nothing is finishable, say so.
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
  autolinks.

## Commits and pull requests

- **Write for the history, not the review.** Subjects and PR titles describe the
  durable change, from a developer's point of view: no review-time state ("WIP",
  "part 2 of 3", "red until implemented"), and nothing addressed to the reviewer.
  Dependencies between PRs go in the body ("Depends on #24"), not the title.
- **The commit body carries the why**, and may record constraints that still hold.
  **The PR body stays short** — what the change does and what was measured, in the
  third person. It does not flag what deserves attention, narrate who did what,
  offer the reviewer options, or recap the conversation that produced it. For a
  docs-only change, one line is right. Alternatives and recommendations go in chat;
  the record gets the decision taken.
- **No AI attribution in the record**: no `Co-Authored-By: Claude` trailer, no
  "🤖 Generated with Claude Code" footer, no AI narration in message prose. This
  overrides the harness's default attribution; README's "How this project uses AI"
  is the disclosure. Earlier commits keep their trailers — history is not rewritten.
- `PROJECT.md` may be edited in the PR that makes its text untrue — call the edit out
  in the body. It is a licence to keep the document honest, not to redesign it.
- Reference sections and issues (§9, #17) where they help a later reader.
- Code: simple and readable; comments explain the why, not just the what.

## Never

- Invent a **[verify]** value from §18, or recall one from memory. Sourcing them is
  delegated as of 2026-09-03: fetch the primary document, transcribe from it, and
  record the source and retrieval date beside the value in code. Where a source does
  not cover something, leave it absent rather than reaching for a second-best table.
  Licence and terms questions get *reported*, not decided.
- Render an unknown nutrient as `0`, or divide by elapsed days instead of days
  logged. Both turn missing records into a claim about the diet (§3, §9).
- Rewrite a logged entry from upstream food data. Entries snapshot their values (§9).
