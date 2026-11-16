# Lab Orders Lite

[![CI](https://github.com/spencerolsen/eh-lab-orders-lite/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/spencerolsen/eh-lab-orders-lite/actions/workflows/ci.yml)

Lab Orders Lite is a small clinic app. Staff keep a list of patients and a catalog of lab tests, place orders for a patient, and see each order's total and the date its results should be ready. It is a Fastify API over Postgres and a React web app, with unit, component, integration and browser tests. It is built for a desktop browser (1024 px wide or more).

What it does:

- **Patients:** add, search by name, edit. Adding a patient who looks like an existing one shows a warning with the matches.
- **Catalog:** add lab tests, edit price and turnaround, activate or deactivate (tests are never deleted; deactivating asks for confirmation first), and search the list by code or name.
- **Orders:** place an order for one patient and one or more tests, with a live total and ready date while building it. Filter the list by status and patient, and sort it by patient, ready date, status or created time (the server sorts, so the order holds across "Load more"). Open an order in a side panel.
- **Order status:** mark an order collected, then completed, or cancel it with a note and a name.
- **Patient page:** the patient's order history, and a New order button with that patient already chosen.

## Run it

You need **Node 22** and **Docker**. pnpm comes with Node through Corepack, so there is nothing else to install.

```sh
corepack pnpm install
corepack pnpm dev
```

Then open http://localhost:5173. The first run creates `.env` from `.env.example` and starts Postgres in Docker, applies the migrations and loads sample data (8 lab tests, 6 patients, 5 orders). Ctrl-C stops the app and leaves the database running; `corepack pnpm db:down` stops the database (the data is kept).

If a port is taken, or Docker is not running, `corepack pnpm dev` stops with one line that says which. The API is on port 3000, the web app on 5173 and Postgres on 5433; all three are settings in `.env`. The clinic's time zone (it decides which day an order was placed on) is `CLINIC_TIMEZONE`, `America/Denver` by default.

**Running a second copy** (for example one clone per branch) needs its own database container and ports. In the second copy's `.env`, change these lines (a third copy uses 5435, 3002, 5175 and `lab-orders-lite-3`), then open http://localhost:5174:

```sh
COMPOSE_PROJECT_NAME=lab-orders-lite-2
DB_PORT=5434
DATABASE_URL=postgres://lab_orders:lab_orders@localhost:5434/lab_orders
TEST_DATABASE_URL=postgres://lab_orders:lab_orders@localhost:5434/lab_orders_test
PORT=3001
WEB_PORT=5174
```

If `.env` does not exist yet, copy `.env.example` to `.env` first, then change these lines. `DB_PORT` and the port in both URLs must match, and a changed `DB_PORT` needs its own `COMPOSE_PROJECT_NAME`; `corepack pnpm dev` and `corepack pnpm test` stop with one line if not.

Other commands, all run as `corepack pnpm <script>`: `build`, `db:reset` (drop, migrate and reseed the development database), `lint`, `typecheck`, `format:check`. Run `corepack enable` once if you would rather type plain `pnpm`.

## Test it

| Kind | What it covers | Command |
|---|---|---|
| Unit | Pure rules and single modules: total, ready date, status moves, duplicate matching, schemas, config, error mapping. No database. | `corepack pnpm test --project unit` |
| Component | React screens in a fake browser (jsdom) with a faked `fetch`: forms, the New order dialog, the order panel, filters. | `corepack pnpm test --project component` |
| Integration | The real app through HTTP against a real Postgres: every endpoint, the transaction, the idempotency key, two status changes racing. | `corepack pnpm test --project integration` |
| Browser | The main journeys in Chromium against the real app and database: add a patient and see the duplicate warning, place an order, double-click submit, change status, cancel, filter, sort. | `corepack pnpm exec playwright install chromium` once, then `corepack pnpm test:e2e` |

`corepack pnpm test` runs the first three together (it starts the database container itself). The integration tests need a `.env` (created by the first `corepack pnpm dev`, or by copying `.env.example`) or `TEST_DATABASE_URL` set in the environment; the unit and component tests need neither. Each rule is tested in one layer only. Calendar-day tests run a second time with the process in another time zone, so a day-shift bug cannot hide.

**Browser tests run locally only.** They are the slowest and most fragile layer and need a browser download, so they are not in the GitHub Actions checks. Those run lint, types, formatting, the build and the first three kinds of test against a Postgres 16 service on every pull request. Details: [docs/testing.md](docs/testing.md).

## How it is built

```mermaid
flowchart LR
  B["Browser<br/>React, TanStack Query"] -->|"/api, /healthz"| V["Vite dev server<br/>(proxy)"]
  V --> A["API<br/>Fastify, Zod, pino"]
  A -->|"hand-written SQL (pg)"| D[("Postgres 16<br/>Docker")]
```

The browser only talks to Vite, which forwards `/api` and `/healthz` to the API, so there is one origin and no CORS setup.

```
src/server/<feature>/   catalog, patients, orders: routes.ts, repo.ts, domain/, service.ts
src/web/<feature>/      one folder per screen area, plus api/, components/, styles/
src/shared/             schemas, money and date helpers, fixed lists: used by both sides
db/migrations/          plain numbered SQL files; db/seeds/ holds the sample data
e2e/                    the browser journeys
docs/                   architecture, API, data model, data flow, testing, plan
```

Where the rules live:

- **Business rules are pure functions in `domain/`.** They take the time as an argument and import no framework or database code. The total is `calculateTotal`, the ready date is `estimateReadyDate`, and the allowed status moves are one table in `domain/transitions.ts`.
- **SQL lives in `repo.ts`** and nowhere else. `service.ts` exists only where a feature needs a transaction (placing an order, creating a patient with the duplicate check).
- **One shared schema per input** in `src/shared/`. The server parses requests with it and the forms check with the same code, so a rule is written once.
- `src/server` and `src/web` never import each other; a lint rule enforces it.

## Decisions and trade-offs

| Decision | Why | What it costs |
|---|---|---|
| Total and ready date are computed only on the server. A quote endpoint previews them with the same code as create. | The browser cannot disagree with what is saved. | An extra request each time the chosen tests change. |
| Creating an order is one database transaction. | An order never exists without all its items. | The catalog rows are locked for the length of the transaction. |
| An idempotency key per opening of the New order dialog. | A double click or a retry after a lost reply places one order. | Keys never expire, and a reused key with a changed body returns the first order. |
| Status changes: read, check the move in the domain table, then update only if the status is unchanged. | Forbidden moves get 422, and two people acting at once get one success and one 409. | A stale tab gets 422 "not allowed" instead of 409 (the panel reloads to the real status). |
| A transitions endpoint and a separate cancel endpoint, not a PATCH on status. | Moves are validated by one table, and cancel carries required data (note, name). | Two endpoints instead of one generic one. |
| Order items copy the test's code, name, price and turnaround. | Changing the catalog later never rewrites an old order or its promised date. | Some duplicated data. |
| Money is integer cents. Dates are `YYYY-MM-DD` strings. | No rounding errors and no off-by-one-day bugs from time zones. | Conversion helpers at the edges. |
| Hand-written SQL and plain migration files, no ORM. | The constraints, the transaction and the conditional update stay visible and easy to explain. | More typing, and typed row mappers to keep by hand. |
| TanStack Query refetches after a change. No optimistic updates. | The screen always shows what the server holds. | A short wait before a change shows. |
| Structured logs with a request id on every line, ids and counts only. | A reported error can be traced, and no patient data lands in log files. | Debugging sometimes needs the id, not the detail. |

More on each, with the reasoning behind it, is in [docs/architecture.md](docs/architecture.md) and [docs/data-flow.md](docs/data-flow.md).

## Business rules

**Statuses.** `ordered`, `collected`, `completed`, `cancelled`. Allowed moves: ordered to collected, collected to completed, and cancel from ordered or collected. `completed` and `cancelled` are final. Nothing is skipped and nothing goes back.

**Cancel.** A note (1 to 500 characters) and the name of the person cancelling are required and stored with the time. A cancelled order is kept, with its items.

**Ready date.** The ready date is the Nth business day after the day the order was placed, where N is the longest turnaround among its tests. Weekends are skipped, the order day is never counted, the day is the clinic's (not the server's or the browser's), and there are no holidays. Examples:

- Friday order, one 1-day test: ready Monday.
- Saturday order, a 2-day test: Monday is day 1, so ready Tuesday. A Friday or Sunday order with the same test is ready the same Tuesday.
- Monday order with a 1-day and a 5-day test: the longest counts, so ready the next Monday.

**Duplicate patient.** On create, an existing patient is a likely duplicate if any one of these matches: the same email; the same phone (compared as 10 digits); or the same first name, last name and date of birth. Comparison is exact, ignoring letter case and surrounding spaces. A match warns and never blocks: the user can open the existing patient or create the new one anyway. Every patient needs an email or a phone.

## Reliability and observability

- **Health check:** `GET /healthz` runs `select 1` and answers 200, or 503 if the database does not answer within 2 seconds.
- **Graceful shutdown:** on SIGTERM or SIGINT, requests in flight finish, new ones get a 503, the pool closes, then the process exits (capped at 10 seconds).
- **Config validated at startup:** a missing or malformed setting stops the app with one JSON line naming the setting, never its value.
- **Request ids:** every response has `x-request-id`; the same id is in every error body and every log line for that request.
- **Logging standard:** pino, JSON lines, four levels used consistently, stable dotted event names, ids and counts only. No names, dates of birth, search text, request bodies or SQL parameters.
- **One error shape** for every failure (`code`, `message`, `details`, `requestId`), and the screens show the message with the request id.

Details and the table of log events: [docs/architecture.md](docs/architecture.md#logging) and [docs/api.md](docs/api.md#errors).

## Known limits

- No login or roles. The name on a cancellation is typed in, and every user can see every patient.
- A tab that is out of date gets "This order has changed" and reloads. There is no live update.
- Sorting the orders list by status or by patient has no index and may read every matching order; the other sorts use an index. Tests and Total cannot be sorted (the total is worked out per order, not stored).
- The orders list uses offset paging. Orders placed or cancelled between two pages can make a row repeat or be skipped. There is no total count.
- Reusing an idempotency key with a different body returns the first order. Keys never expire and are not tied to a user.
- If a test's price or turnaround changes while the New order dialog is open, the order is saved at the current numbers, which can differ from the preview.
- Two people saving the same patient or lab test at once: the last save wins.
- Two identical patient creates at the same moment can both pass the duplicate check.
- No public holidays or cut-off times in the ready date.
- The patient list without a search and the lab test catalog list are not paged: each returns every row. A patient search returns at most 50.
- The rule for lists: a list that grows without bound (orders) is paged, and filtered and sorted on the server; a small reference list (the catalog) is loaded whole and filtered in the browser. So the catalog search runs in the browser, over the list the page already holds, and moves to the server when the catalog is paged.
- Desktop only (1024 px and wider). No mobile layout.
- Orders cannot be edited after they are placed. Cancel and place a new one.
- Patient search is not accent-insensitive, and phone numbers must be US numbers.

The full list of smaller items, with the reason each was left, is in [docs/plan/backlog.md](docs/plan/backlog.md).

## What I would do next

1. **Login, roles and an audit trail** of who viewed or changed which patient and order.
2. **Metrics and alerting** around the paths that must not fail: placing an order, the ready date, status changes.
3. **Cursor paging** for the orders list, so pages neither repeat nor skip and later pages are not slower.
4. **A production deployment:** the API serving the built web app, a hosted Postgres, backups.
5. **Holidays and cut-off times** in the ready date.
6. **AI-assisted features, in plain code first:** plain-language search that turns a sentence into the filters the app already has, and flags on orders that look wrong for a patient's history. A person confirms anything clinical.

## How this was built

I made or reviewed every product and architecture decision. AI assistants wrote the code, working from a plan with one ticket per change. Each change was reviewed independently, by a session that had not written it, before it was merged. The plan, the tickets and the review findings that were not applied are in [docs/plan/](docs/plan/README.md).

## Docs

| Page | What is in it |
|---|---|
| [docs/architecture.md](docs/architecture.md) | How the server, web app and database fit together; logging; settings; the visual theme. |
| [docs/api.md](docs/api.md) | Every endpoint: request, response, status codes, error codes. |
| [docs/data-model.md](docs/data-model.md) | Tables, columns, constraints and indexes, with a diagram. |
| [docs/data-flow.md](docs/data-flow.md) | Sequence diagrams: placing an order, the quote, status change, cancel, duplicate check, errors. |
| [docs/testing.md](docs/testing.md) | The four kinds of test, the harness, running browser tests. |
| [docs/acceptance-checklist.md](docs/acceptance-checklist.md) | The manual checks for a pass in a real browser. |
| [docs/plan/](docs/plan/README.md) | The build plan, one ticket per change, and the backlog. |
| [AGENTS.md](AGENTS.md) | The codebase conventions, for people and AI assistants. |
