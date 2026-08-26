# Ration

A local-first calorie and nutrient tracking PWA. Meal templates, barcode lookup,
supplements, and long-term nutrient evaluation — all stored on the device, with
user-controlled encrypted backup. No accounts, no server.

**[PROJECT.md](PROJECT.md) is the spec and the single source of truth.** Read it
before changing anything: it records the architecture decisions and, more usefully,
why each was made.

## Running it

Node is pinned by `.nvmrc` (the `engines` field needs >= 24.12):

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
| `npm run type-check` | `vue-tsc` — the dev server does **not** type-check |
| `npm run lint` | ESLint with `--fix` |
| `npm run format` | Prettier over `src/` |
| `npm run test:unit` | tests in watch mode |
| `npx vitest run` | tests once |

The dev server strips types without checking them, so a type error can sit there
while the page looks fine. `npm run type-check` is the real gate.

## Layout

See §16 of PROJECT.md for the full structure and the reasoning. In short:

- `src/data/` — the nutrient registry, seed foods, reference intakes
- `src/views/` — route targets; `src/components/` — reusable pieces
- `src/theme/tokens.css` — design tokens, the single source of truth for styling
- `src/stores/` — Pinia; `src/db.ts` — Dexie behind a repository interface

## Contributing

§19 of PROJECT.md describes how work is split and reviewed, including when an AI
assistant should stop and ask rather than decide.
