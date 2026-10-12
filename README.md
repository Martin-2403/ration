# Ration

[![CI](https://github.com/Martin-2403/ration/actions/workflows/ci.yml/badge.svg)](https://github.com/Martin-2403/ration/actions/workflows/ci.yml)

A local-first calorie and nutrient tracking PWA. Meal templates, barcode lookup,
supplements, and long-term nutrient evaluation — all stored on the device, with
user-controlled encrypted backup. No accounts, no server.

**[PROJECT.md](PROJECT.md) is the spec and the single source of truth** for what to
build. Read it before changing anything: it records the architecture decisions and,
more usefully, why each was made.

## Running it

Node 24 is pinned by `.nvmrc`; the `engines` field accepts `^22.18.0 || >=24.12.0`:

```bash
nvm use
npm install
npm run dev
```

Then open the URL Vite prints, normally http://localhost:5173/.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | dev server with hot module replacement |
| `npm run build` | type-check, then production build into `dist/` |
| `npm run build-only` | production build without the type-check — what CI runs |
| `npm run preview` | serve the built `dist/` locally |
| `npm run type-check` | `vue-tsc` — the dev server does **not** type-check |
| `npm run lint` | ESLint, check only — what CI runs |
| `npm run lint:fix` | ESLint with `--fix`, for local use |
| `npm run format` | Prettier over `src/` |
| `npm run test:unit` | tests in watch mode |
| `npm run test:unit -- --run` | tests once |

CI runs lint, type-check, tests and `build-only` as separate steps, on pushes to
`main` and on every pull request.

## Layout

See §16 of PROJECT.md for the full structure and the reasoning. In short:

- `src/data/` — the nutrient registry, seed foods, reference intakes
- `src/views/` — route targets; `src/components/` — reusable pieces
- `src/theme/tokens.css` — design tokens, the single source of truth for styling
- `src/stores/` — Pinia; `src/db.ts` — Dexie behind a repository interface

## Contributing

One issue, one branch, one pull request. [CLAUDE.md](CLAUDE.md) is the working
agreement: how work is split and reviewed, when the assistant stops and asks rather
than decides, and how commits and pull requests are written.

## How this project uses AI

An AI coding assistant, Claude Code, writes most of the code and documentation,
working to the agreement in [CLAUDE.md](CLAUDE.md). Martin, the owner, decides scope
and design, and reviews and merges every pull request; the assistant never merges.
Each pull request gets a review pass run by the assistant before it is handed to
him.

Nutrition reference values — the **[verify]** items in §18 of PROJECT.md — are
transcribed from cited primary documents (EU regulation, EFSA), with the source and
retrieval date recorded beside each value in code. They are never recalled from
model memory.

Commits from before this section was added on 2026-10-12 carry a `Co-Authored-By`
trailer; later ones do not, and this section is the disclosure.
