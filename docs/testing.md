# Testing

The kinds of test in this repo, what each one covers, and how to run them.

## Running the tests

```sh
pnpm test                          # unit and integration tests together
pnpm test --project unit           # unit tests only (no database, Docker or .env needed)
pnpm test --project integration    # integration tests only
```

Before any integration file runs, the integration project's global setup (`src/server/testing/global-setup.ts`) starts the Postgres container and waits until it is healthy (`docker compose up -d --wait db`, the same as `pnpm db:up`). So on a fresh clone, after `cp .env.example .env`, `pnpm test` is the first command needed. When the `CI` environment variable is set it skips that step and uses the database the CI workflow provides (LAB-05). The unit project has no global setup, so `pnpm test --project unit` works with Docker stopped.

The rule for settings: tests read `TEST_DATABASE_URL` from the environment first, then from `.env` (there is no fallback to `.env.example`). Locally that means `cp .env.example .env` once. When `CI` is set, nothing changes in where the setting comes from (CI has no `.env`, so the workflow must set `TEST_DATABASE_URL` in the job environment); the only difference is that the integration setup does not start Docker.

Test files run in file-path order (a small sequencer in `vitest.config.ts`), so the order is the same on every machine and every run.

## Kinds of test

| Kind | Files | What it covers | Database |
|---|---|---|---|
| Unit | `<name>.test.ts`, next to the code | Pure functions and single modules: the error mapper, `parse`, the request id check, the logger, config, the guards, domain rules. | No |
| Integration | `<name>.integration.test.ts`, next to the code | The app through `inject` (real routing, error handler and logging) and repositories on a real Postgres. | The test database |

Later tasks add component tests for the web app (LAB-04) and browser tests (LAB-21). Each rule is tested in one layer only: a rule that is a pure function is unit tested; what needs HTTP or SQL is an integration test.

The suffix decides the project: Vitest's `unit` project takes every `*.test.ts` except `*.integration.test.ts`, and the `integration` project takes those.

## The integration harness

`src/server/testing/` holds the harness:

- **`TEST_DATABASE_URL` only.** The harness reads no other setting, and goes through `testDatabaseUrl` in `src/server/db/guards.ts`, which refuses a database whose name does not end in `_test`. So a test can never empty the development database, whatever `DATABASE_URL` says. The setting comes from the environment (CI sets it), else from `.env`. If it is missing, the run stops with `TEST_DATABASE_URL is not set: run \`cp .env.example .env\``.
- **Migrations once per run.** `global-setup.ts` runs before any integration file: it checks the setting (before starting anything), starts the container unless `CI` is set, and applies pending migrations. `testing/harness.test.ts` checks that both it and `createTestPool` refuse a database not ending in `_test`.
- **Truncate, not a transaction.** `setup.ts` runs before each integration test file and truncates every table except `schema_migrations` (`truncateAllTables` in `harness.ts`). A transaction rolled back after each test would be faster, but code under test (placing an order, for example) uses its own transactions, and a test wrapped in one would not see what really gets committed. Truncating means each file starts empty while running the real code.
- **One file at a time.** The integration project sets `fileParallelism: false`: there is one test database, and two files running at once would truncate each other's rows. The two files `testing/truncate-first.integration.test.ts` and `truncate-second` each insert a row into the same table and check that they start with it empty.
- **`startTestApp()`** builds the app with `buildApp` on a test-database pool, a fixed clock (`2026-01-15T17:00:00Z`) and a logger that captures every line at `debug`. It returns `inject` (Fastify's in-process request), the pool, `logs()` (the parsed lines), `logText()` (the raw text, for checking that something never appears) and `close()`. A test can add its own routes to `app` before the first request, for example one that throws.
- **`captureLogger()`** gives a logger that keeps its lines in memory, for unit tests of code that logs.

## Checked by hand

- **Shutdown** (LAB-03): start the server, send a slow request, send `SIGTERM` while it runs: the request finishes, `app.shutting_down` is logged and the process exits 0.
