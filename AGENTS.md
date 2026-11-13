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
- `src/web/`: the browser app (React, Vite, React Router, TanStack Query). Each feature gets its own folder, `src/web/<feature>/`, with its page (for example `catalog/CatalogPage.tsx`).
  - `main.tsx` mounts the app (error boundary, query client, router); `App.tsx` holds the routes; `Layout.tsx` and `MenuBar.tsx` are the frame around every page; `NotFoundPage.tsx` is the screen for unknown paths.
  - `api/`: `client.ts` (`apiFetch` and `ApiError`, the only way to call the API), `errors.ts` (`describeError`, the sentence shown for a failed request), `query-client.ts` (TanStack Query defaults).
  - `components/`: shared `Loading`, `EmptyState`, `ErrorMessage`, `StatusBadge` and the `ErrorBoundary`. A page shows loading, empty and error states with these, never its own.
  - `health/ServerStatus.tsx`: the footer line that says whether the API answers.
  - `styles/base.css`: the only stylesheet, plain CSS: the theme's custom properties and the shared classes (see "Styling a page"). `styles/StylesPage.tsx` is the `/styles` sample page.
  - `testing/`: the component test setup and `renderApp(path)`, which renders the whole app at a path with a fake `fetch`.
- `src/shared/`: code used by both sides: request and response schemas, money and date helpers, and every fixed list of values.
- `docs/`: architecture, API, data model, data flow, testing and the acceptance checklist. `docs/plan/` holds the build plan and one ticket per task.

Tests sit next to the code they test, and the file name decides how they run: unit tests `<name>.test.ts` (Node, no database), component tests `<name>.test.tsx` (React in jsdom with Testing Library), integration tests (database or HTTP through the app) `<name>.integration.test.ts`. The smoke test is `src/shared/smoke.test.ts`. See `docs/testing.md`.

## Import boundary

- `src/server` may import from `src/shared`, never from `src/web`.
- `src/web` may import from `src/shared`, never from `src/server`.
- `src/shared` imports from neither.

`pnpm lint` enforces this with the rule in `eslint-rules/import-boundary.js`, and `pnpm test` runs that rule's own tests (`eslint-rules/import-boundary.test.js`). Do not turn it off; if two sides need the same code, move that code into `src/shared`.

## Commands

pnpm comes with Node through Corepack. The commands below are written `pnpm <script>`; run them as `corepack pnpm <script>`, which works on any machine with Node 22, or run `corepack enable` once to type plain `pnpm` (with the nodejs.org installer that needs `sudo corepack enable`, because it writes to `/usr/local/bin`).

| Command | What it does |
|---|---|
| `pnpm install` | Install dependencies (the pnpm version pinned in `package.json`). |
| `pnpm lint` | ESLint with the TypeScript rules and the import boundary. |
| `pnpm typecheck` | The TypeScript compiler in strict mode, no output files. |
| `pnpm dev` | The whole app with one command (`scripts/dev.ts`): creates `.env` from `.env.example` when missing, checks the settings, that the database URLs use `DB_PORT`, that Docker runs and that ports 3000 (`PORT`) and 5173 (`WEB_PORT`) are different and free, then `db:up`, `db:migrate`, `db:seed`, then `dev:api` and `dev:web` together with prefixed output. Ctrl-C stops both. |
| `pnpm dev:api` | Run the API server under `tsx watch` with readable development logs (`NODE_ENV=development`). |
| `pnpm dev:web` | Run the Vite dev server on `WEB_PORT` (5173), proxying `/api` and `/healthz` to the API on `PORT`. |
| `pnpm build` | Build the web app into `dist/web`. |
| `pnpm start` | Run the API server under `tsx` with JSON logs. |
| `pnpm test` | Unit, component and integration tests (Vitest projects `unit`, `component` and `integration`). The integration project starts the database container and waits until it is healthy, unless `CI` is set, and needs `.env` (or `TEST_DATABASE_URL` in the environment); the unit and component projects need neither Docker nor `.env`. One project alone: `pnpm test --project unit`, `--project component` or `--project integration`. |
| `pnpm format` | Format the code with Prettier. Markdown is not formatted. |
| `pnpm format:check` | Check the formatting without changing files. |
| `pnpm db:up` | Start Postgres in Docker (host port `DB_PORT`, 5433) and wait until it is healthy. |
| `pnpm db:down` | Stop and remove the container. The data volume is kept. |
| `pnpm db:migrate` | Apply the pending files in `db/migrations/` to the development database. |
| `pnpm db:reset` | Drop and recreate the development database's schema, migrate, then seed. Refuses any database other than `lab_orders` and `lab_orders_test`, and refuses when `NODE_ENV=production`. |
| `pnpm db:seed` | Insert the fake sample rows from `db/seed.ts`. |
| `pnpm db:test:reset` | Drop, recreate and migrate the test database in `TEST_DATABASE_URL`. Refuses any database other than `lab_orders_test`. |

The TypeScript scripts run under `tsx`, which loads `.env` with `--env-file-if-exists` (`pnpm dev` creates `.env` from `.env.example`; otherwise copy it yourself). Plain `node` cannot run them, because imports are extensionless.

`package.json` lists `esbuild` under `pnpm.ignoredBuiltDependencies`, so `pnpm install` skips its install script without a warning. The script is not needed: tsx, Vite and Vitest use esbuild's JavaScript API, which finds the binary in the platform package (`@esbuild/<platform>`) that pnpm installs as an optional dependency. The script only downloads that binary when the optional package is missing, and speeds up the `esbuild` command, which nothing here runs. A new dependency with an install script must be added to `ignoredBuiltDependencies` or `onlyBuiltDependencies` the same way, with its reason here.

Run `pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm format:check` before opening a pull request. LAB-21 adds `pnpm test:e2e`.

The same checks run on GitHub Actions for every pull request and every push to `main` (`.github/workflows/ci.yml`, one job): `pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm typecheck`, `pnpm format:check`, `pnpm build`, then `pnpm test` against a Postgres 16 service container on port 5432, with the settings in the job's environment (there is no `.env` in CI). Browser tests are not run there; they run locally. A new setting a check needs goes into the workflow's `env` as well as `.env.example`.

**Several copies at once.** Each copy of the project (one per ticket built in parallel) needs its own `COMPOSE_PROJECT_NAME`, `DB_PORT` (with the same port in `DATABASE_URL` and `TEST_DATABASE_URL`), `PORT` and `WEB_PORT` in its `.env`; the README section "Running a second copy" has the exact lines. Nothing else in the code may hard-code a port or the project name.

## Conventions

- **Money is in whole cents**, as integers (`price_cents`, `total_cents`), everywhere except on screen. Never floats. The only conversions are in `src/shared/money.ts`: `parseDollarsToCents` (what the user typed, read as text) and `formatCents` (for display).
- **Dates are `YYYY-MM-DD` strings** (a date of birth, a ready date), from the form to the database and back. Never a JavaScript `Date` for a calendar day: use the helpers in `src/shared/dates.ts` (`isRealDate`, `today(timezone, now)`, `formatDate`). "Today" on the server is `today(deps.clinicTimezone, deps.clock())`, never the server's own time zone.
- **Logs carry ids and counts only.** No names, dates of birth or other patient details in logs, and never request bodies, query strings, headers or SQL parameters. Levels follow the logging standard in `docs/architecture.md`.
- **Each fixed list of values is defined once in `src/shared/`** (for example order statuses), and everything else (database checks, schemas, the screens) derives from it.
- **Patient rules live in one shared schema**, `src/shared/patients.ts`: the server parses with it and the form checks with it. A new screen that creates or edits a patient reuses `PatientForm` (`src/web/patients/`), and any screen that names a patient uses `PatientLabel` (name with date of birth).
- Imports are relative (`../shared/money`).

## Calling the API from a page

- Call the API only through `apiFetch` (`src/web/api/client.ts`) inside a TanStack Query `useQuery` or `useMutation`, and check the returned body with the shared response schema (`schema.parse(await apiFetch(...))`). `apiFetch` throws an `ApiError` for every failure; never read a raw `Response` in a page.
- Show the three states with the shared components: `Loading` while pending, `EmptyState` for an empty list, `ErrorMessage` (with `onRetry` for a query) for an error. `ErrorMessage` uses `describeError`, so the user sees the server's message for a 4xx, a generic one for a 5xx or when the server cannot be reached, and the request id as "Reference: <id>".
- Field errors from a 400 are in `error.details` (an `ApiError`), one `{ field, reason }` per field.
- The web code never imports `src/server`: a type both sides need (like the error body in `src/shared/api-error.ts`) goes in `src/shared`.

## Styling a page

Open http://localhost:5173/styles (your `WEB_PORT`): it is linked from nowhere in the menu and shows every shared style; copy markup from `src/web/styles/StylesPage.tsx`. The theme and the contrast table are in `docs/architecture.md`.

- **Never write a colour.** Use the custom properties in `src/web/styles/base.css` (`var(--color-brand)`, `var(--color-text-muted)`, ...), named by role. No hex value goes anywhere under `src/web/` except where they are defined. Spacing is `var(--space-1)` to `var(--space-5)`.
- **Use the shared classes**; a page needs little or no CSS of its own. If it does, add it to `base.css` with the same variables.
- **Desktop only:** no media queries or breakpoints.
- Headings `h1` to `h3` and every `<button>` are styled without a class.

| What | Markup |
|---|---|
| Page heading with actions on the right | `<div className="page-header"><h1>Patients</h1><button type="button">Add a patient</button></div>` (a page with no actions uses a bare `<h1>`) |
| Primary button | `<button type="button">Save</button>` (the default look) |
| Secondary button | `<button type="button" className="button-secondary">Cancel</button>` |
| Danger button | `<button type="button" className="button-danger">Cancel order</button>` |
| Link that looks like a primary button | `<Link className="button" to="...">New order</Link>` |
| Form | `<form className="form">` (fields in a column), buttons in `<div className="form-actions">`; `className="form card"` puts it on a surface |
| Field | `<div className="field">` holding `<label htmlFor="code">`, the `<input id="code">` (or `select`, `textarea`), then optional `<p id="code-help" className="field-help">` and `<p id="code-error" className="field-error">` |
| Invalid field | `aria-invalid="true"` on the input and the error message's id in its `aria-describedby` (with the help text's id, space-separated); the red outline comes from `aria-invalid`, never a class |
| Table | `<table className="table">` with `<th scope="col">` in a `<thead>`; add `className="numeric"` to the `th` and `td` of a number column (prices, counts) to right-align it |
| Order status | `<StatusBadge status="ordered" />` from `components/StatusBadge` |
| Surface | `className="card"` for a box on the page; `className="stack"` puts children in a column with a gap; `className="muted"` for secondary text |
| Dialog or slide-out panel | `<dialog className="dialog">` or `<dialog className="panel">`, opened with `showModal()` (the backdrop is styled) |

## Adding a route

1. Put it in `src/server/<feature>/routes.ts`, as a function that takes the app and the deps it needs and writes the full path (`app.get('/api/lab-tests', ...)`), and call it from `buildApp` (`src/server/app.ts`), one line per feature. Do not wrap it in `app.register` with a `prefix`: an encapsulated plugin makes `app.close()` set the shutdown flag a few ticks late, and a request in that gap runs instead of getting the 503 (the shutdown test in `app.integration.test.ts` catches it).
2. Parse every input explicitly: `const body = parse(createLabTestBody, request.body)`, and the same for `request.params` and `request.query`. Body schemas are `z.strictObject`, so unknown fields are a 400. Schemas live in `src/shared/`.
3. Run SQL through the repository, giving it `withQueryLog(deps.pool, request.log)` (or the transaction's client), so query durations are logged with the request id.
4. Throw a typed error from `src/server/errors.ts`; never build an error response by hand:
   - `ValidationError` (400): the input is malformed or has the wrong shape. `parse` throws it for you.
   - `NotFoundError` (404): the resource named in the URL path does not exist.
   - `ConflictError(code, message)` (409): a conflict with stored data, such as a duplicate code (translate the database's unique violation; do not check first).
   - `BusinessRuleError(code, message)` (422): the shape is right but a business rule is broken, or an id inside the body does not exist.
   - Anything else becomes a 500 with a generic message; the stack goes to the log.
5. A new error code goes into `ERROR_CODES` in `src/server/errors.ts` and into the error-code table in `docs/api.md` (a unit test checks they match), in upper snake case.
6. Log business events once, where they are handled, with `request.log` and a dotted event name (`lab_test.created`), ids and counts only. The levels and rules are in the logging standard in `docs/architecture.md`. The request line and the error lines are already written for you.
7. Write an integration test with `startTestApp()` from `src/server/testing/harness.ts`, and document the endpoint in `docs/api.md`.

## Database

- **Migrations** are plain SQL files in `db/migrations/`, named `NNNN_description.sql` (for example `0002_lab_tests.sql`) and applied in filename order by `src/server/db/migrate.ts`. Each file runs in its own transaction and is recorded in `schema_migrations`.
- **Never edit a migration that has been applied** (merged to `main`). To change the schema, add a new file with the next number.
- A migration file contains no `begin`, `commit`, `rollback` or `abort`; the runner wraps it in a transaction. It refuses a file with a line that starts with `begin`, `commit` or `rollback` before running it, and stops with a message to run `pnpm db:reset` if a file ends the transaction any other way (an `abort`, or a `commit` in the middle of a line).
- The runner also refuses a file not named `NNNN_description.sql` (lower case), two files with the same number, and a pending file that sorts before the newest applied one: give a new file the next free number.
- **Run one migration runner at a time** (one `pnpm db:migrate`, `pnpm db:reset` or test run against a database). There is no lock, but a race cannot apply a file twice: the second runner fails with a duplicate-key error (on the primary key of `schema_migrations` on a migrated database, or, on a brand-new database, while creating `schema_migrations`), so nothing is applied twice and it exits with an error.
- **Every task that adds a table adds a seed** with obviously fake rows: a file in `db/seeds/` exporting one function that takes the database client and returns how many rows it inserted, and one line in the `SEEDS` list in `db/seed.ts`. Each seeded row has a fixed key (a fixed UUID, or for `order_items` its primary key) and is inserted with `on conflict do nothing`, so running the seed twice leaves the same rows.
- **Settings** are read once at startup by `loadConfig()` in `src/server/config.ts`, which exits with one JSON error line if any is missing or invalid. Add a new setting there and to `.env.example`.
- Test tooling uses only `TEST_DATABASE_URL`, and refuses a database whose name does not end in `_test` (`src/server/db/guards.ts`).

## Workflow

- One task, one branch, one pull request. Each task in `docs/plan/tasks/` is built on a feature branch off `main` named after it (for example `lab-06-catalog-list-and-add`) and merged into `main` after review.
- Tests and docs are written in the same pull request as the code.
- `main` works after every merge.
