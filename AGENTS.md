# Working in this repo

Instructions for anyone changing this code, human or AI assistant. `CLAUDE.md` only imports this file, so there is one source of truth.

## What this is

Lab Orders Lite: a small clinic app for patients, a lab test catalog and orders. One package (no workspace), TypeScript in strict mode, pnpm.

## Folders

- `src/server/`: the API server. Each feature gets its own folder, `src/server/<feature>/` (for example `orders`, `patients`, `catalog`).
  - `routes.ts`: HTTP routes. A route parses its input explicitly with the shared schema, then calls the repository or the service.
  - `repo.ts`: the SQL queries for that feature, hand-written, with typed row mappers. Queries live here and nowhere else.
  - `domain/`: business rules as pure functions (no Fastify, no `pg`), unit tested on their own. Rules never live in routes or repositories.
  - `service.ts`: only where a feature needs a transaction or combines rules with several queries (for example placing an order). Simple features call the repository from the route.
- `src/web/`: the browser app. Each feature gets its own folder, `src/web/<feature>/`.
- `src/shared/`: code used by both sides: request and response schemas, money and date helpers, and every fixed list of values.
- `docs/`: architecture, API, data model, data flow, testing and the acceptance checklist. `docs/plan/` holds the build plan and one ticket per task.

Tests sit next to the code they test, named `<name>.test.ts`. The smoke test is `src/shared/smoke.test.ts`.

## Import boundary

- `src/server` may import from `src/shared`, never from `src/web`.
- `src/web` may import from `src/shared`, never from `src/server`.
- `src/shared` imports from neither.

`pnpm lint` enforces this with the rule in `eslint-rules/import-boundary.js`. Do not turn it off; if two sides need the same code, move that code into `src/shared`.

## Commands

| Command | What it does |
|---|---|
| `pnpm install` | Install dependencies (pnpm through Corepack; the version is pinned in `package.json`). |
| `pnpm lint` | ESLint with the TypeScript rules and the import boundary. |
| `pnpm typecheck` | The TypeScript compiler in strict mode, no output files. |
| `pnpm test` | Unit and integration tests (Vitest). |
| `pnpm format` | Format the code with Prettier. Markdown is not formatted. |
| `pnpm format:check` | Check the formatting without changing files. |

Run `pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm format:check` before opening a pull request. Later tasks add `pnpm dev` (LAB-04), the database commands (LAB-02) and `pnpm test:e2e` (LAB-21).

## Conventions

- **Money is in whole cents**, as integers (`price_cents`, `total_cents`). Never floats.
- **Dates are `YYYY-MM-DD` strings** (a date of birth, a ready date). Never a JavaScript `Date` for a calendar day.
- **Logs carry ids and counts only.** No names, dates of birth or other patient details in logs.
- **Each fixed list of values is defined once in `src/shared/`** (for example order statuses), and everything else (database checks, schemas, the screens) derives from it.
- Imports are relative (`../shared/money`).

## Workflow

- One task, one branch, one pull request. Each task in `docs/plan/tasks/` is built on a feature branch off `main` named after it (for example `lab-06-catalog-list-and-add`) and merged into `main` after review.
- Tests and docs are written in the same pull request as the code.
- `main` works after every merge.
