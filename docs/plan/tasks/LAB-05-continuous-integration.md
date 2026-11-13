# LAB-05: Checks on every pull request

- **Status:** Done
- **Type:** Groundwork
- **Depends on:** LAB-04 (Web foundation: app shell and navigation)
- **Unblocks:** LAB-06 (Catalog: see and add lab tests), LAB-08 (Patients: add and list patients), LAB-23 (Submission readiness)
- **Branch:** `lab-05-continuous-integration`

## Description

This task adds a GitHub Actions workflow that runs the project's checks automatically on every pull request and on every push to `main`: install, lint, type check, formatting, build, and the unit, component and integration tests against a real Postgres. It merges before any feature slice, so every slice is checked before it is reviewed. This is what makes "main always works" a checked fact and not only a promise. GitHub Actions is free for public repositories.

Changed at the check-in (owner's decision): the workflow and the README badge are kept, the ceremony is cut (see Out of scope). Two additions were made in the same pull request:

- **Running several copies side by side.** Up to three tickets may later be built at the same time, each in its own working copy. Every copy used the same Compose project name, database host port, API port and web port, so two copies collided. These four are now settings with the old values as defaults, so a normal single clone behaves exactly as before.
- **Two plan documents.** "How reviews work" in the plan index, and a backlog of improvements deliberately not taken.

## Requirements

**The workflow**
- One file, `.github/workflows/ci.yml`, named "CI". Triggers: `pull_request` (any target) and `push` to `main`. A `concurrency` group per ref cancels an older run when a newer one starts.
- One job, `checks`, on `ubuntu-latest`, with a 10-minute timeout and read-only repository permissions (`contents: read`). No secrets are used or needed.
- Postgres 16 as a service container with a healthcheck, published on the runner's port 5432 (the job runs on the runner, so it reaches the service on `localhost:5432`; 5433 belongs to the local Compose setup). The job environment sets `DATABASE_URL` (`lab_orders` on 5432), `TEST_DATABASE_URL` (`lab_orders_test` on 5432), `LOG_LEVEL=error` and `CLINIC_TIMEZONE=America/Denver`. There is no `.env` in CI and no fallback to `.env.example`.
- Steps in order, each named: check out the code (`actions/checkout@v7`); set up pnpm (`pnpm/action-setup@v6`, no version input, so it takes the version from `packageManager`); set up Node from `.nvmrc` with the pnpm cache (`actions/setup-node@v7`); `pnpm install --frozen-lockfile`; `pnpm lint`; `pnpm typecheck`; `pnpm format:check`; `pnpm build`; create the test database; `pnpm test`. A failure points to the step that failed.
- The test database is created by a step that runs `createdb` inside the service container (`docker exec`), so it does not depend on a Postgres client on the runner. It is named exactly `lab_orders_test`: the `_test` guard needs the suffix, and `pnpm db:test:reset` only resets `lab_orders` or `lab_orders_test` (LAB-02).
- In CI, `pnpm test` does not start Docker Compose: the integration global setup skips that step when `CI` is set (GitHub sets it), and uses the service container.
- Browser (Playwright) tests are not run in CI. They are the slowest and most fragile layer, so they run locally with `pnpm test:e2e` (LAB-21).

**Several copies side by side**
- Four settings in `.env`, defaults unchanged: `COMPOSE_PROJECT_NAME` (default `lab-orders-lite`; Compose reads it from `.env` and it overrides `name:` in `compose.yaml`, so each copy gets its own container, network and data volume), `DB_PORT` (default `5433`, the database's host port in `compose.yaml`), `PORT` (default `3000`, already a setting) and `WEB_PORT` (default `5173`, new in `src/server/config.ts`, used by `scripts/dev.ts` and `vite.config.ts`).
- `DATABASE_URL` and `TEST_DATABASE_URL` carry the database port as well, so `DB_PORT` and the two URLs must agree. `checkDatabasePort` (`src/server/db/guards.ts`) stops `pnpm dev` and `pnpm test` (when it starts the container) with one line naming the URL when a URL on `localhost`, `127.0.0.1` or `[::1]` uses a port other than `DB_PORT`. Without it, a second copy whose URLs still said 5433 would silently use, and in tests empty, the first copy's database. `db:migrate`, `db:seed`, `db:reset` and `db:test:reset` run the same check before connecting.
- Changed after the review: the same check refuses a `DB_PORT` other than 5433 while `COMPOSE_PROJECT_NAME` is empty or still `lab-orders-lite`. Compose treats an empty name as unset and falls back to `name:` in `compose.yaml`, so that copy would recreate the first copy's container on the new port, with the first copy's data volume.
- `pnpm dev`'s checks and messages use the settings: the port-in-use line names `PORT in .env` or `WEB_PORT in .env`, and `PORT` equal to `WEB_PORT` stops with one line saying they must differ. Vite listens on `WEB_PORT` (still `strictPort`) and proxies to `PORT`.

**Docs**
- `README.md`: the CI badge, what the automated checks run, and "Running a second copy" with the exact `.env` lines to change.
- `AGENTS.md` and `docs/testing.md`: the checks run on every pull request and every push to `main`, what they run, that browser tests are local only, where the test database lives in CI.
- `docs/plan/README.md`: "How reviews work", a line on building up to three tickets at the same time, and a link to `docs/plan/backlog.md`.
- `docs/plan/backlog.md`: improvements not taken, seeded with the earlier reviews' optional findings.

## Acceptance criteria

- [ ] Opening a pull request starts the "CI" workflow without any manual step, and the run appears on the pull request.
- [ ] A pull request with all checks passing shows a green result, and the run takes under 5 minutes.
- [ ] One deliberately failing pull request (done by the owner after this merges) fails at the step named for what it breaks, and is then closed.
- [ ] A passing run executes the integration tests, which read and write the database, so the Postgres service is reached; `pnpm test` does not try to start Docker Compose in CI.
- [ ] A push to `main` runs the same checks.
- [ ] The workflow file uses 0 secrets, requests only `contents: read`, and has no Playwright or `test:e2e` step.
- [ ] With the defaults (a fresh clone, `.env` copied from `.env.example`), `pnpm dev` and `pnpm test` work exactly as before: Compose project `lab-orders-lite`, database on 5433, API on 3000, web app on 5173.
- [ ] A second clone with the `.env` lines from "Running a second copy" runs its own database container and volume, `pnpm dev` and `pnpm test` while the first clone's database and `pnpm dev` are running.
- [ ] With `DB_PORT=5434` and a URL still on 5433, `pnpm dev` and `pnpm test` stop with one line naming that URL, before starting anything.
- [ ] With `DB_PORT=5434`, matching URLs and `COMPOSE_PROJECT_NAME` empty or `lab-orders-lite`, `pnpm dev`, `pnpm test` and the `db:*` scripts stop with a message saying the copy needs its own project name.
- [ ] With `PORT` equal to `WEB_PORT`, `pnpm dev` stops with one line saying they must differ.

## Tests

- Unit tests for `checkDatabasePort` (defaults accepted, a matching second copy accepted, a mismatch named, a changed `DB_PORT` with no, an empty or the default project name refused, a URL without a port counted as 5432, a non-local host ignored), for `WEB_PORT` in the config (default, given, malformed), and that the integration setup refuses a mismatched port before starting Docker.
- The workflow itself has no test code: it is verified by a local simulation before the push (a clean clone, `CI=true`, no `.env`, the job's environment, a Postgres 16 container on 5432 with the test database created the same way, then the same commands in the same order), and by its first real runs on GitHub.
- The two-copies setup is verified by hand: a throwaway second clone running `pnpm dev` and `pnpm test` beside the main checkout, then removed with its container and volume.

## Docs to update

- `README.md`, `AGENTS.md`, `docs/testing.md`, `docs/architecture.md` (settings table, ports), `docs/acceptance-checklist.md` (the changed `PORT` message), `docs/plan/README.md`, new `docs/plan/backlog.md`.
- Status table in `docs/plan/README.md` (LAB-05 set to Done when merged).

## Out of scope

- A pull request template: cut, ceremony for a one-person project.
- Three throwaway failing pull requests (lint, types, a test): cut, ceremony for a one-person project. One deliberate failure, done by the owner after this merges, shows that a failing check turns the pull request red.
- Browser (Playwright) tests in CI: a deliberate cut; they run locally (LAB-21).
- Separate ports or a separate Compose project in CI: CI runs one job at a time on a fresh runner, so it needs neither.
- Deriving `DB_PORT` from the database URLs: Compose cannot read a port out of a URL, and a wrapper script around every `docker compose` call would be more code than one setting with a check.
- Deployment, preview environments, release tagging, coverage thresholds, dependency scanning, Docker image caching: future version.
- Switching on branch protection for `main`: a GitHub setting the owner may switch on; the workflow works either way.
- Final check that CI is green on `main`: LAB-23.

## What to be able to explain

1. What does the workflow run, in what order, and why is the order useful when something fails?
2. Why is the Postgres in CI on port 5432 while local development uses 5433, and how does the job reach the service container?
3. What does "main always works" depend on, and what still slips through because browser tests are not in CI?
4. Why is the workflow limited to read-only permissions and no secrets?
5. Which four things must differ between two copies of the project, why does `DB_PORT` have to agree with the URLs, and what would go wrong without the check?
