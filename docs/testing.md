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

The unit and component tests must pass in any process time zone, because a calendar day never depends on it. `pnpm test` checks this itself for the tests that work out or show a calendar day (the ready date, dates of birth): the projects `dates-west-unit` and `dates-west-component` run those files again with `TZ=Pacific/Honolulu` (UTC-10), on every machine and in CI, next to `unit` and `component` in the process's own zone (UTC on the CI runner). The files are listed in `vitest.config.ts`; a new test file that checks a calendar day is added there. Treating a `YYYY-MM-DD` string as a JavaScript `Date` and reading it back in local time gives the right day in UTC and the day before west of it, so a run in UTC alone would miss it. To try another zone by hand: `TZ=Asia/Tokyo corepack pnpm test --project unit --project component`.

Test files run in file-path order (a small sequencer in `vitest.config.ts`), so the order is the same on every machine and every run. Every file passes in any order; the order matters only for the truncate check below, which the LAB-02 migration test would silently weaken if it ran between the two truncate files, because it drops the whole schema.

## In the automated checks (CI)

`.github/workflows/ci.yml` runs on every pull request and every push to `main`: install, lint, type check, formatting, build, then `pnpm test`, so every unit, component and integration test runs there (the calendar-day tests twice: in the runner's UTC and in `Pacific/Honolulu`). Browser tests (LAB-21) do not: they are the slowest and most fragile layer, and they need a browser, so they run locally only (see "Browser tests" below).

In CI the test database is a Postgres 16 service container on the runner's port 5432 (5433 is the local Compose setup). The workflow sets `TEST_DATABASE_URL` (`lab_orders_test` on 5432) and `DATABASE_URL` (`lab_orders` on 5432) in the job environment, creates `lab_orders_test` with `createdb` in the service container before the tests, and GitHub sets `CI`, so the integration setup does not start Docker Compose.

## Kinds of test

| Kind | Files | What it covers | Database |
|---|---|---|---|
| Unit | `<name>.test.ts`, next to the code | Pure functions and single modules: the error mapper, `parse`, the request id check, the logger, config, the guards, domain rules. | No |
| Component | `<name>.test.tsx`, next to the component | React components rendered in jsdom with Testing Library: the menu bar (navigation only), the routes, the shared states, the error boundary, the server status line. `fetch` is replaced with a fake, so no API runs. | No |
| Integration | `<name>.integration.test.ts`, next to the code | The app through `inject` (real routing, error handler and logging) and repositories on a real Postgres. | The test database |
| Browser (end to end) | `e2e/<journey>.spec.ts` | Journeys through the real screens, API and database in Chromium: that they work together. | The e2e database |

Unit tests also cover the web code that has no React in it: `apiFetch` (with a fake `fetch`), `describeError` and the retry rule. Browser tests (below) prove only that the screens, the API and the database work together. Each rule is tested in one layer only: a rule that is a pure function is unit tested; what needs React and the DOM is a component test; what needs HTTP or SQL is an integration test.

The file name decides the project: Vitest's `unit` project takes every `*.test.ts` except `*.integration.test.ts`, the `component` project takes every `*.test.tsx`, and the `integration` project takes `*.integration.test.ts`.

## Component tests

The `component` project runs in jsdom with the React plugin. `src/web/testing/setup.ts` runs before each file: after every test it unmounts what was rendered and puts the real `fetch` back. jsdom has the `<dialog>` element but not its behaviour, so `setup.ts` also gives it a small stand-in that does what a browser does: `showModal()` opens it, `close()` closes it and then fires `close` on a later task, and Escape (unless a handler prevented it) fires `cancel` and closes the most recently opened one (the stand-in keeps them in the order they were opened). It does not move the focus: the app moves it itself, and the tests check that. `src/web/testing/render.tsx` has the helpers:

- **`renderApp(path)`** renders the whole app (the app's own query client and routes, in a `MemoryRouter` at `path`). Unless the test stubbed `fetch` itself, `/healthz` answers `200 { "status": "ok" }`. `renderApp(path, { strictMode: true })` wraps it in `StrictMode`, as `main.tsx` does, so effects run twice as in development (the New order modal test uses it; it is off by default because it doubles the requests a fake API sees).
- **`stubFetch(status, body)`** replaces `fetch` with one that answers every request with that status and JSON body, and returns the mock so a test can count the calls.
- **`testQueryClient()`** is the app's query client with retries made instant, so a test that sees a retry does not wait for it.

Tests find elements the way a user does: by role and accessible name (`getByRole('link', { name: 'Catalog' })`), and click with `user-event`.

## The integration harness

`src/server/testing/` holds the harness:

- **`TEST_DATABASE_URL` only.** The harness reads no other setting, and goes through `testDatabaseUrl` in `src/server/db/guards.ts`, which refuses a database whose name does not end in `_test`. So a test can never empty the development database, whatever `DATABASE_URL` says. The setting comes from the environment (CI sets it), else from `.env`. If it is missing, the run stops with a message that says to run `cp .env.example .env`.
- **Migrations once per run.** `global-setup.ts` runs before any integration file: it checks the setting (before starting anything), starts the container unless `CI` is set (first checking that the URL's port is `DB_PORT`, so a second copy of the project never uses the first copy's test database), and applies pending migrations. `testing/harness.test.ts` checks that both it and `createTestPool` refuse a database not ending in `_test`.
- **Truncate, not a transaction.** `setup.ts` runs before each integration test file and truncates every table except `schema_migrations` (`truncateAllTables` in `harness.ts`). A transaction rolled back after each test would be faster, but code under test (placing an order, for example) uses its own transactions, and a test wrapped in one would not see what really gets committed. Truncating means each file starts empty while running the real code.
- **One file at a time.** The integration project sets `fileParallelism: false`: there is one test database, and two files running at once would truncate each other's rows. The two files `testing/truncate-first.integration.test.ts` and `truncate-second` each insert a row into the same table and check that they start with it empty. In file-path order they run after `db/db.integration.test.ts`, so no schema reset falls between them.
- **`startTestApp()`** builds the app with `buildApp` on a test-database pool, a fixed clock (`2026-01-15T17:00:00Z`, or the `clock` option, for example just before midnight in the clinic), the clinic time zone `America/Denver` and a logger that captures every line at `debug`. It returns `inject` (Fastify's in-process request), the pool, `logs()` (the parsed lines), `logText()` (the raw text, for checking that something never appears) and `close()`. A test can add its own routes to `app` before the first request, for example one that throws.
- **Two requests at the same moment** are forced to overlap with a table lock, never a mock: a separate connection runs `begin; lock table orders in share mode`, the test sends both requests, waits in `pg_locks` until both writes are blocked, then commits so they race. `transitions.integration.test.ts` (LAB-16, two status changes) and `idempotent-create.integration.test.ts` (LAB-18, two creates with one `Idempotency-Key`) do this.
- **`captureLogger()`** gives a logger that keeps its lines in memory, for unit tests of code that logs.
- **Seeds.** No test runs `pnpm db:seed`, which only ever targets the development database, and no test relies on seeded rows. A seed function is tested by calling it twice on the test database (`src/server/catalog/seed.integration.test.ts`): the first run inserts its rows, the second inserts none.

## Checked by hand

- **`pnpm dev`** (LAB-04): from a fresh clone with no `.env`; a second run; a malformed setting; Docker not running; Ctrl-C leaving no process behind; the proxy; the page with the API stopped; keyboard use. The steps are in `docs/acceptance-checklist.md`, Checkpoint 1.

- **Shutdown** (LAB-03): start the server, send a slow request, send `SIGTERM` while it runs: the request finishes, `app.shutting_down` is logged and the process exits 0. Send the signal twice: the second one is ignored, with the same result. A request longer than 10 seconds is cut off and the process exits 1.

## Browser tests

`pnpm test:e2e` runs the journeys in `e2e/` with Playwright, in Chromium only. They are local only: the CI workflow does not run them (it would need a browser download, and they are the slowest and most fragile layer; the rules they pass through are already proved by the unit, component and integration tests). `pnpm test` does not pick them up: Vitest only includes `src/**` and `eslint-rules/**`, and the Playwright files are named `*.spec.ts` in `e2e/`.

**One-time setup** after `pnpm install` (downloads the browser, about 100 MB):

```sh
corepack pnpm exec playwright install chromium
```

Then `corepack pnpm test:e2e` is the only command. It needs `.env` and Docker, and:

1. checks the settings, that Docker runs, and that `PORT` and `WEB_PORT` are free (it never reuses a server that is already there, so a `pnpm dev` on other ports is left alone; on these ports it stops with one line);
2. starts the database container, creates the database `lab_orders_e2e` if it is missing, then drops and recreates its tables, migrates and seeds it, so every run starts from the same rows;
3. starts the API and the web app on `PORT` and `WEB_PORT` against that database, waits until `/healthz` answers through Vite, and runs Playwright (extra arguments are passed on, for example `corepack pnpm test:e2e -g "double click"`);
4. stops the API and the web app, whatever the result, and exits with Playwright's exit code. The database container stays up, as after `pnpm test`.

**Its own database.** The browser tests use `lab_orders_e2e` rather than `lab_orders_test`, so a run never empties what an integration run or a `pnpm dev` session holds, and the integration harness's "tables are empty at the start of each file" rule is untouched. The name is fixed in `src/server/db/guards.ts` (`e2eDatabaseUrl`: the server and login of `DATABASE_URL`, the name `lab_orders_e2e`); no setting can change it, and the reset goes through the same `assertResettable` as `pnpm db:reset`, whose list now has three names. The script creates the database itself, because the container's init script only runs when the volume is first created.

**The journeys.** Each creates its own patients (unique fake names, `@example.test` emails) and, when an order is only the starting point, creates it through the API (`e2e/helpers.ts`), so any journey runs alone or in any order. What a journey is about it does through the screens. Elements are found by role, label and visible text; waits are on visible outcomes, never a fixed pause. No journey asserts a calendar date: the ready date is read from the dialog's preview and compared with the saved order.

| File | Journey |
|---|---|
| `patients.spec.ts` | Add a patient; a second one with the same email shows the duplicate warning naming the first; Create anyway saves it. |
| `place-order.spec.ts` | Place an order from the orders page (pick the patient, quick-add by code and by name, see the live total and ready date, submit) and see the same total and ready date on the list row and in the panel. A double click on Submit order creates one order. "New order for this patient" opens with the patient chosen and the order joins the patient's history. |
| `order-status.spec.ts` | Advance ordered, collected, completed, and a completed order offers no actions. Cancel: an empty note is refused, then the note and name show on the cancelled order, which the status filter finds. |
| `filters.spec.ts` | Filter the list by status and by patient; both filters survive a reload. |
| `menu.spec.ts` | The menu bar has only Orders, Patients and Catalog. |

**Seeing why one failed.** Every failed test keeps a trace (`trace: 'retain-on-failure'`) in `test-results/`, and the HTML report is in `playwright-report/` (both are git-ignored):

```sh
corepack pnpm exec playwright show-report
corepack pnpm exec playwright show-trace test-results/<test folder>/trace.zip
```

The trace is a recording of each step with the page as it was, the network calls and the console. The API's warnings and errors also appear in the terminal during the run (`LOG_LEVEL=warn`).

**Deliberately not tested in a browser:** every validation message (component and unit tests own them), ready-date edge cases (unit tests), other browsers and narrow screens (the app is desktop only), accessibility audits, load, and the crash fallback screen (a component test). New journeys are added only for something that can only go wrong in a real browser.
