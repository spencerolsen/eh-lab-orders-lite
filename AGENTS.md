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

`pnpm lint` enforces this with the rule in `eslint-rules/import-boundary.js`, and `pnpm test` runs that rule's own tests (`eslint-rules/import-boundary.test.js`). Do not turn it off; if two sides need the same code, move that code into `src/shared`.

## Commands

| Command | What it does |
|---|---|
| `pnpm install` | Install dependencies (pnpm through Corepack; the version is pinned in `package.json`). |
| `pnpm lint` | ESLint with the TypeScript rules and the import boundary. |
| `pnpm typecheck` | The TypeScript compiler in strict mode, no output files. |
| `pnpm test` | Unit tests (Vitest). No database needed. LAB-03 adds the integration tests to this command. |
| `pnpm test:integration` | Integration tests (`*.integration.test.ts`) against the test database in `TEST_DATABASE_URL`. Needs the database running (`pnpm db:up`). |
| `pnpm format` | Format the code with Prettier. Markdown is not formatted. |
| `pnpm format:check` | Check the formatting without changing files. |
| `pnpm db:up` | Start Postgres in Docker (host port 5433) and wait until it is healthy. |
| `pnpm db:down` | Stop and remove the container. The data volume is kept. |
| `pnpm db:migrate` | Apply the pending files in `db/migrations/` to the development database. |
| `pnpm db:reset` | Drop and recreate the development database's schema, migrate, then seed. Refuses any database other than `lab_orders` and `lab_orders_test`, and refuses when `NODE_ENV=production`. |
| `pnpm db:seed` | Insert the fake sample rows from `db/seed.ts`. |
| `pnpm db:test:reset` | Drop, recreate and migrate the test database in `TEST_DATABASE_URL`. Refuses a database whose name does not end in `_test`. |

The TypeScript scripts run under `tsx`, which loads `.env` with `--env-file-if-exists` (copy `.env.example` to `.env` first). Plain `node` cannot run them, because imports are extensionless.

Run `pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm format:check` before opening a pull request. Later tasks add `pnpm dev` (LAB-04) and `pnpm test:e2e` (LAB-21).

## Conventions

- **Money is in whole cents**, as integers (`price_cents`, `total_cents`). Never floats.
- **Dates are `YYYY-MM-DD` strings** (a date of birth, a ready date). Never a JavaScript `Date` for a calendar day.
- **Logs carry ids and counts only.** No names, dates of birth or other patient details in logs.
- **Each fixed list of values is defined once in `src/shared/`** (for example order statuses), and everything else (database checks, schemas, the screens) derives from it.
- Imports are relative (`../shared/money`).

## Database

- **Migrations** are plain SQL files in `db/migrations/`, named `NNNN_description.sql` (for example `0002_lab_tests.sql`) and applied in filename order by `src/server/db/migrate.ts`. Each file runs in its own transaction and is recorded in `schema_migrations`.
- **Never edit a migration that has been applied** (merged to `main`). To change the schema, add a new file with the next number.
- A migration file contains no `begin`, `commit` or `rollback`; the runner wraps it in a transaction, and refuses a file that has its own.
- The runner also refuses a file not named `NNNN_description.sql` (lower case), and a pending file that sorts before the newest applied one: give a new file the next free number.
- **Run one migration runner at a time** (one `pnpm db:migrate`, `pnpm db:reset` or test run against a database). There is no lock, but a race cannot apply a file twice: the second runner's insert into `schema_migrations` hits the primary key on `filename`, so its transaction is rolled back and it exits with an error.
- **Every task that adds a table extends `db/seed.ts`** with obviously fake rows. Each seeded row has a fixed key (a fixed UUID, or for `order_items` its primary key) and is inserted with `on conflict do nothing`, so running the seed twice leaves the same rows.
- **Settings** are read once at startup by `loadConfig()` in `src/server/config.ts`, which exits with one JSON error line if any is missing or invalid. Add a new setting there and to `.env.example`.
- Test tooling uses only `TEST_DATABASE_URL`, and refuses a database whose name does not end in `_test` (`src/server/db/guards.ts`).

## Workflow

- One task, one branch, one pull request. Each task in `docs/plan/tasks/` is built on a feature branch off `main` named after it (for example `lab-06-catalog-list-and-add`) and merged into `main` after review.
- Tests and docs are written in the same pull request as the code.
- `main` works after every merge.
