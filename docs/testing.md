# Testing

The kinds of test in this repo, what each one covers, and how to run them.

## Running the tests

```sh
corepack pnpm test                          # unit, component and integration tests together
corepack pnpm test --project unit           # unit tests only (no database, Docker or .env needed)
corepack pnpm test --project component      # component tests only (no database, Docker or .env needed)
corepack pnpm test --project integration    # integration tests only
```

Before any integration file runs, the integration project's global setup (`src/server/testing/global-setup.ts`) starts the Postgres container and waits until it is healthy (`docker compose up -d --wait db`, the same as `pnpm db:up`). So on a fresh clone, after `cp .env.example .env`, `pnpm test` is the first command needed. When the `CI` environment variable is set it skips that step and uses the database the CI workflow provides (LAB-05). The unit and component projects have no global setup, so `pnpm test --project unit` and `--project component` work with Docker stopped.

The rule for settings: tests read `TEST_DATABASE_URL` from the environment first, then from `.env` (there is no fallback to `.env.example`). Locally that means `cp .env.example .env` once (or one `pnpm dev`, which creates it). When `CI` is set, nothing changes in where the setting comes from (CI has no `.env`, so the workflow must set `TEST_DATABASE_URL` in the job environment); the only difference is that the integration setup does not start Docker.

Test files run in file-path order (a small sequencer in `vitest.config.ts`), so the order is the same on every machine and every run. Every file passes in any order; the order matters only for the truncate check below, which the LAB-02 migration test would silently weaken if it ran between the two truncate files, because it drops the whole schema.

## Kinds of test

| Kind | Files | What it covers | Database |
|---|---|---|---|
| Unit | `<name>.test.ts`, next to the code | Pure functions and single modules: the error mapper, `parse`, the request id check, the logger, config, the guards, domain rules. | No |
| Component | `<name>.test.tsx`, next to the component | React components rendered in jsdom with Testing Library: the menu bar, the routes, the shared states, the error boundary, the server status line. `fetch` is replaced with a fake, so no API runs. | No |
| Integration | `<name>.integration.test.ts`, next to the code | The app through `inject` (real routing, error handler and logging) and repositories on a real Postgres. | The test database |

Unit tests also cover the web code that has no React in it: `apiFetch` (with a fake `fetch`), `describeError` and the retry rule. LAB-21 adds browser tests. Each rule is tested in one layer only: a rule that is a pure function is unit tested; what needs React and the DOM is a component test; what needs HTTP or SQL is an integration test.

The file name decides the project: Vitest's `unit` project takes every `*.test.ts` except `*.integration.test.ts`, the `component` project takes every `*.test.tsx`, and the `integration` project takes `*.integration.test.ts`.

## Component tests

The `component` project runs in jsdom with the React plugin. `src/web/testing/setup.ts` runs before each file: after every test it unmounts what was rendered and puts the real `fetch` back. `src/web/testing/render.tsx` has the helpers:

- **`renderApp(path)`** renders the whole app (the app's own query client and routes, in a `MemoryRouter` at `path`). Unless the test stubbed `fetch` itself, `/healthz` answers `200 { "status": "ok" }`.
- **`stubFetch(status, body)`** replaces `fetch` with one that answers every request with that status and JSON body, and returns the mock so a test can count the calls.
- **`testQueryClient()`** is the app's query client with retries made instant, so a test that sees a retry does not wait for it.

Tests find elements the way a user does: by role and accessible name (`getByRole('link', { name: 'Catalog' })`), and click with `user-event`.

## The integration harness

`src/server/testing/` holds the harness:

- **`TEST_DATABASE_URL` only.** The harness reads no other setting, and goes through `testDatabaseUrl` in `src/server/db/guards.ts`, which refuses a database whose name does not end in `_test`. So a test can never empty the development database, whatever `DATABASE_URL` says. The setting comes from the environment (CI sets it), else from `.env`. If it is missing, the run stops with a message that says to run `cp .env.example .env`.
- **Migrations once per run.** `global-setup.ts` runs before any integration file: it checks the setting (before starting anything), starts the container unless `CI` is set, and applies pending migrations. `testing/harness.test.ts` checks that both it and `createTestPool` refuse a database not ending in `_test`.
- **Truncate, not a transaction.** `setup.ts` runs before each integration test file and truncates every table except `schema_migrations` (`truncateAllTables` in `harness.ts`). A transaction rolled back after each test would be faster, but code under test (placing an order, for example) uses its own transactions, and a test wrapped in one would not see what really gets committed. Truncating means each file starts empty while running the real code.
- **One file at a time.** The integration project sets `fileParallelism: false`: there is one test database, and two files running at once would truncate each other's rows. The two files `testing/truncate-first.integration.test.ts` and `truncate-second` each insert a row into the same table and check that they start with it empty. In file-path order they run after `db/db.integration.test.ts`, so no schema reset falls between them.
- **`startTestApp()`** builds the app with `buildApp` on a test-database pool, a fixed clock (`2026-01-15T17:00:00Z`) and a logger that captures every line at `debug`. It returns `inject` (Fastify's in-process request), the pool, `logs()` (the parsed lines), `logText()` (the raw text, for checking that something never appears) and `close()`. A test can add its own routes to `app` before the first request, for example one that throws.
- **`captureLogger()`** gives a logger that keeps its lines in memory, for unit tests of code that logs.

## Checked by hand

- **`pnpm dev`** (LAB-04): from a fresh clone with no `.env`; a second run; a malformed setting; Docker not running; Ctrl-C leaving no process behind; the proxy; the page with the API stopped; keyboard use. The steps are in `docs/acceptance-checklist.md`, Checkpoint 1.

- **Shutdown** (LAB-03): start the server, send a slow request, send `SIGTERM` while it runs: the request finishes, `app.shutting_down` is logged and the process exits 0. Send the signal twice: the second one is ignored, with the same result. A request longer than 10 seconds is cut off and the process exits 1.
