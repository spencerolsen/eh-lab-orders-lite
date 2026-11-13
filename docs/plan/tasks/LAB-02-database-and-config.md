# LAB-02: Database, migrations and config

- **Status:** Not started
- **Type:** Groundwork
- **Depends on:** LAB-01 (Repo skeleton and tooling)
- **Unblocks:** LAB-03 (API foundation: server, logging, errors, health)
- **Branch:** `lab-02-database-and-config`

## Description

This task gives the project a real Postgres database that starts with one command, a way to change its structure with plain SQL files, a seed command, and a config module that checks every setting when the app starts. There are still no business tables, only the table that records which migrations have run.

It comes before the server because the server's first job is to read its config and reach the database, and every later slice adds tables through the migration runner built here. Getting the date parsing right now means date of birth and ready date stay as `YYYY-MM-DD` strings from the very first query.

## Requirements

**Data**
- Postgres 16 in Docker Compose (`compose.yaml`), service `db`, published on host port 5433 (so it does not clash with a local Postgres on 5432), a named volume for data, and a healthcheck (`pg_isready`) so other commands can wait for it.
- Two databases on the one server: `lab_orders` for development and `lab_orders_test` for tests. The test database is created by an init script mounted into the container, and `db:reset` never touches it by default.
- `.env.example` has a `TEST_DATABASE_URL` setting whose default points at `lab_orders_test` on port 5433 (same user and password as `DATABASE_URL`). Only the test tooling reads it (the integration harness from LAB-03 and `db:test:reset`); the running app does not need it. Test tooling uses ONLY `TEST_DATABASE_URL` and refuses to run unless the database name ends in `_test`.
- Bookkeeping table `schema_migrations(filename text primary key, applied_at timestamptz not null default now())`. No other tables.

**Tooling**
- Migrations are plain `.sql` files in `db/migrations/`, named `0001_description.sql`, applied in filename order. The first file is the bookkeeping-only baseline; the runner creates `schema_migrations` itself if it is missing.
- Runner (`src/server/db/migrate.ts`): applies each unapplied file inside its own transaction, records it, stops at the first failure and rolls that file back. Re-running when everything is applied does nothing. Prints the name of each file applied.
- Commands: `pnpm db:migrate` (apply pending), `pnpm db:reset` (drop and recreate the schema, then migrate, then seed; refuses to run if the database name does not contain `lab_orders` or if `NODE_ENV=production`), `pnpm db:up` and `pnpm db:down` (wrap Docker Compose).
- `pnpm db:seed` runs `db/seed.ts`. It exists here and is empty for now, with a comment that sample data is obviously fake. It is the one seed command every later task extends: each task that adds a table adds its fake rows to this file. One mechanism for every seeded row: each seeded row has a fixed key (a fixed UUID, or for `order_items` its primary key) and is inserted with `on conflict do nothing`, so running the seed twice leaves the same rows.
- `pnpm db:test:reset` runs reset and migrate against the database in `TEST_DATABASE_URL`, and refuses to run unless its name ends in `_test`.

**Config**
- `src/server/config.ts` parses `process.env` with a Zod schema and exports one typed, frozen object. Settings: `DATABASE_URL` (required, a postgres URL), `PORT` (integer, default 3000), `LOG_LEVEL` (one of `debug`, `info`, `warn`, `error`; default `info`), `CLINIC_TIMEZONE` (an IANA name checked against the runtime's known zones; default `America/Denver`). The clinic timezone decides which calendar day an order was placed on, used from LAB-11.
- **Logging:** on any invalid or missing setting the process writes one structured JSON line at `error` level (fields `level`, `event: "config.invalid"`, and `problems`, a list of setting name and reason) and exits with code 1 before doing anything else. The line never contains the value of `DATABASE_URL`, because it may hold a password.
- `.env.example` from LAB-01 is updated to match exactly. `.env` is loaded in development with the `--env-file` flag, given to `tsx`, which runs the TypeScript scripts and the server (plain `node` cannot resolve the extensionless imports; see LAB-03). When `.env` is missing, the `pnpm dev` script (LAB-04) copies `.env.example` to `.env` and prints one line saying so; this validation still refuses to start when a setting is missing or malformed.

**Database access**
- `src/server/db/pool.ts` creates one `pg` pool from config and exports it with a `closePool()` function.
- `src/server/db/types.ts` registers a type parser so Postgres `DATE` (type id 1082) comes back as the raw `YYYY-MM-DD` string, not a JS `Date`.

## Acceptance criteria

- [ ] `pnpm db:up` starts Postgres, and `docker compose ps` shows the database as healthy.
- [ ] The database accepts connections on host port 5433, and both `lab_orders` and `lab_orders_test` exist.
- [ ] `pnpm db:migrate` on a fresh database creates `schema_migrations` and records the baseline file; running it again applies 0 files and exits 0.
- [ ] A migration file with a syntax error leaves no partial changes and is not recorded; the command exits non-zero and names the file.
- [ ] `pnpm db:reset` returns the development database to a clean migrated state, and refuses to run against a database whose name lacks `lab_orders`.
- [ ] With `DATABASE_URL` unset the process exits with code 1 and one JSON line at `error` level naming `DATABASE_URL`; with `PORT=abc` the line names `PORT`; with `CLINIC_TIMEZONE=Mars/Base` it names `CLINIC_TIMEZONE`.
- [ ] A `DATABASE_URL` containing a password that is also invalid in another way never prints that password in the line.
- [ ] `select '2000-02-29'::date as d` through the app's pool returns the string `'2000-02-29'` under both `TZ=America/Los_Angeles` and `TZ=Pacific/Auckland`.
- [ ] `pnpm db:seed` runs and exits 0 with 0 rows inserted.
- [ ] With no `.env` file, `pnpm dev` still starts (the copy from `.env.example` happens; checked once LAB-04 adds the script).
- [ ] `pnpm db:test:reset` with a `TEST_DATABASE_URL` whose database name does not end in `_test` refuses to run and exits non-zero.
- [ ] `pnpm test`, `pnpm lint` and `pnpm typecheck` pass.
- [ ] The `docs/process.md` slice log entry and test log entry for this task were written in the same pull request.

## Tests

- **Unit** (`config.test.ts`): valid env gives the typed object with defaults; each invalid setting is reported by name; several errors are reported together in one line; the password is not in the output.
- **Integration** (test database, one test file): `migrate runs pending files once and records them`; `migrate rolls back a failing file`; `date type parser returns YYYY-MM-DD strings under a non-UTC timezone`.
- The shared integration harness (truncate between test files, Fastify inject) is built in LAB-03.

## Docs to update

- `README.md` (prerequisites and the database commands), `AGENTS.md` (db commands, migration rules: never edit an applied file, add a new one; every task extends `db:seed`, each seeded row has a fixed key and is inserted with `on conflict do nothing`).
- `docs/architecture.md` (database section: Postgres in Docker, port 5433, two databases).
- `docs/data-model.md` (only `schema_migrations` exists so far, and the date rule).
- `docs/process.md`: slice log entry (what was asked for, what was rejected or changed and why) and test log entry.

## Out of scope

- Any business table (lab tests, patients, orders, order items): the slice that first needs it adds it, starting with LAB-06.
- The server, request logging and health check: LAB-03.
- Seed rows: each later task adds its own obviously fake rows to `db:seed` as its table arrives.
- The one-command start (`pnpm dev`, which always runs the seed and copies `.env.example` when `.env` is missing): LAB-04.
- Down migrations: future version. This project only rolls forward; `db:reset` is the way back in development.

## What to be able to explain

1. Why plain SQL migration files and a small runner, and not an ORM or a migration library?
2. What happens when a migration fails halfway, and why does each file run in its own transaction?
3. Why does the config module exit at startup instead of failing on the first request that needs a missing setting?
4. What bug does the `DATE` type parser prevent, and who would have seen it?
5. Why is the clinic timezone a setting even though only one clinic exists?
6. Why does the test tooling read only `TEST_DATABASE_URL` and refuse names that do not end in `_test`, and why does `pnpm dev` copy `.env.example` instead of skipping validation?
