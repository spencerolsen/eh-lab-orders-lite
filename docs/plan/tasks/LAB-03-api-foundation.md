# LAB-03: API foundation: server, logging, errors, health

- **Status:** In progress
- **Type:** Groundwork
- **Depends on:** LAB-02 (Database, migrations and config)
- **Unblocks:** LAB-04 (Web foundation: app shell and navigation)
- **Branch:** `lab-03-api-foundation`

## Description

This task builds the server that every feature will plug into: a Fastify app with structured logging, one error shape for every failure, a registry of error codes, a health endpoint that checks the database, a clean shutdown, and the integration test harness that later tasks use. The only endpoint is `GET /healthz`.

It comes before any feature because the logging standard, the status-code rules and the error shape must be the same everywhere, and are cheap to set once and expensive to retrofit. The test harness is built here so that LAB-06 can start with a failing integration test.

## Requirements

**API**
- `src/server/app.ts` exports `buildApp(deps)`, which returns a Fastify instance without listening (so tests can use `inject`). `deps = { pool, clock, logger }` with `clock: () => Date`; these are the only dependencies `buildApp` takes; no test-only hooks in production code. Production passes the real pool, `() => new Date()` and the pino logger; tests pass their own. `src/server/main.ts` loads config, builds the app, listens on `PORT`, and registers shutdown. Feature routes will be registered under the `/api` prefix; `/healthz` sits outside it.
- `GET /healthz` runs `select 1` through the pool with a 2-second query timeout. It returns 200 `{ "status": "ok" }`, or 503 `{ "status": "unavailable" }` if the database does not answer, and the 503 arrives within 3 seconds even when the database host is unreachable. It reports nothing else (no versions, no connection details).

**Errors**
- `src/server/errors.ts` defines the typed application errors `ValidationError` (400), `NotFoundError` (404), `ConflictError` (409) and `BusinessRuleError` (422), and the error-code registry: one exported list of upper snake case codes. This task registers the base codes `VALIDATION_ERROR` (400), `NOT_FOUND` (404) and `INTERNAL_ERROR` (500). Later tasks add their own codes to the registry and to the error-code table in `docs/api.md`; codes are never lower case.
- One Fastify error handler maps the typed errors to the single response shape `{ "error": { "code", "message", "details"?, "requestId" } }`. Status meanings: 400 malformed or invalid input shape, including unknown extra fields; 404 the resource in the URL path does not exist; 422 a business rule is broken or an id inside the request body does not exist; 409 a conflict.
- A shared helper `parse(schema, input)` runs a Zod schema and throws `ValidationError` with `details` listing each field and a short reason. Each route calls it explicitly. Schemas used for request bodies reject unknown fields.
- Anything else becomes 500 `INTERNAL_ERROR` with the generic message "Something went wrong on our side" and the request id. The stack trace goes to the log only. Unknown routes return the same shape with 404 and `NOT_FOUND`.

**Logging**
- pino, level from `LOG_LEVEL`. Structured JSON in production, readable colourised output (pino-pretty) in development only.
- Every line carries the request id. The id is taken from an `x-request-id` header when present and valid, otherwise generated, and is returned in the response header `x-request-id` and in every error body.
- Request completion is logged once at `info` (method, route pattern, status, duration). Request bodies, query strings and headers are never logged; the logged route is the pattern (`/api/patients/:id`), not the raw URL.
- The pool's `'error'` listener from LAB-02 (`createPool` in `src/server/db/pool.ts`, event `db.pool_error`) switches from `console.error` to the pino logger, still logging the error code only and no connection details.
- The pool wrapper in `src/server/db/` logs each query's duration at `debug` level, with the request id when there is one. It logs no SQL parameters and no row data.
- Levels follow the logging standard in `docs/process.md`: `debug` developer detail; `info` things that happened (`app.started`, `app.shutting_down`); `warn` expected refusals (4xx from the typed errors); `error` unexpected breaks (500s, with stack) and an unreachable database. Event names are stable and dotted. Only ids and counts go into log fields.

**Tooling**
- The API runs under `tsx` (for example `tsx watch --env-file=.env src/server/main.ts`), and imports stay extensionless (`../shared/money`). Plain `node` cannot resolve extensionless TypeScript imports, so it is not used to run the server.
- Graceful shutdown on `SIGTERM` and `SIGINT`: stop accepting connections, let in-flight requests finish (10-second cap), close the pool, log `app.shutting_down`, exit 0.
- Integration harness in `src/server/testing/`: builds the app against the database in `TEST_DATABASE_URL` (and only that setting; it refuses to run unless the database name ends in `_test`), runs pending migrations once per run, truncates all tables except `schema_migrations` between test files (not wrapped in a transaction), and exposes an `inject` helper. Vitest has an integration project with `fileParallelism: false`, so integration test files run one at a time against the one test database. `pnpm test` runs unit and integration together. It starts the database container and waits for it to be healthy (as `pnpm test:e2e` does), so it works as the first command on a fresh clone. It skips the container start when the `CI` environment variable is set. In CI, `TEST_DATABASE_URL` is set by the workflow (LAB-05).

## Acceptance criteria

- [ ] `GET /healthz` returns 200 `{"status":"ok"}` with the database up.
- [ ] With the database stopped, `GET /healthz` returns 503 within 3 seconds and an `error`-level line is logged.
- [ ] A request to an unknown path returns 404 `NOT_FOUND` in the standard error shape including `requestId`.
- [ ] A request carrying `x-request-id: abc-123` gets the same id in the response header and in every log line for that request.
- [ ] A route that throws an unexpected error returns 500 `INTERNAL_ERROR` with the generic message and a `requestId`; the response never contains the stack or the original error text, and the stack is in the log.
- [ ] Each typed error maps to its status: validation 400, not found 404, conflict 409, business rule 422. A body with an unknown extra field returns 400 `VALIDATION_ERROR`.
- [ ] Log output for a request with a body and a query string contains neither, and the debug-level query lines contain no SQL parameter values.
- [ ] On a fresh clone with the database stopped, `pnpm test` starts it, waits, and passes. With `TEST_DATABASE_URL` pointing at a database whose name does not end in `_test`, the harness refuses to run.
- [ ] The Vitest integration project sets `fileParallelism: false`, and two integration test files that each insert a row both start with an empty table.
- [ ] Sending `SIGTERM` while a request is running lets that request finish, then exits 0.
- [ ] `pnpm lint`, `pnpm typecheck` and `pnpm test` pass.
- [ ] The `docs/process.md` slice log entry and test log entry for this task were written in the same pull request.

## Tests

- **Unit:** `error mapper turns each typed error into status, code and shape`; `zod failure becomes field details`; `unknown field is rejected`; `request id header is accepted when valid and replaced when malformed`.
- **Integration:** `healthz returns ok`; `healthz returns 503 when the pool is closed`; `unknown route returns the standard 404 shape`; `unexpected error returns generic 500 and hides the message`; `logs contain request id and no body or query string` (captured through a pino destination); `query duration is logged at debug without parameters`.
- Shutdown is checked by hand (acceptance list), not automated.

## Docs to update

- `docs/api.md` (error shape, status code rules, the error-code table with the three base codes, request id header, `/healthz`).
- `docs/architecture.md` (server structure, where errors and logging live).
- `docs/testing.md` (the kinds of test, the harness, `TEST_DATABASE_URL` and the `_test` guard, truncate not transaction, files run one at a time, `pnpm test` starts the database unless `CI` is set).
- `AGENTS.md` (how to add a route and which error class to throw), `README.md` (run and test commands).
- `docs/process.md`: slice log entry (what was asked for, what was rejected or changed and why) and test log entry.

## Out of scope

- Any feature route: catalog LAB-06, patients LAB-08, orders LAB-11.
- The web shell and Vite proxy: LAB-04.
- Running tests on every pull request: LAB-05.
- Metrics, tracing, a separate readiness endpoint, rate limiting: future version.

## What to be able to explain

1. When is a failure a 400, a 404, a 409 or a 422? Give one example of each from this app.
2. Why does the server return a generic message on a 500 but log the stack, and how does the request id connect the two?
3. Why does `buildApp` not call `listen` and take `{ pool, clock, logger }`, and what does that make possible for the tests?
4. Why are request bodies and query strings never logged, and what does the query-duration debug line leave out?
5. Why truncate tables between test files instead of rolling back a transaction, and why must the files run one at a time?
6. Why does the harness use only `TEST_DATABASE_URL` and refuse names not ending in `_test`?
